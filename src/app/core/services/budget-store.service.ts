import { Injectable, computed, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  Expense,
  Income,
  MonthlyAmountMap,
  CategoryBudgetMap,
  Owner,
  OwnerOrGlobal,
  Provision,
  RecurringExpense,
  SavingsGoal,
} from '../models/budget.models';
import { incomeAppliesToMonth, incomeForMonth } from '../utils/income.utils';
import { occurrencesInMonth } from '../utils/recurring-expense.utils';
import { ymOf, prevYM, monthLabel, monthShortLabel, fmtDate } from '../utils/date.utils';
import { fmt } from '../utils/currency.utils';
import {
  provisionUnit,
  countedExpenses,
  CountedExpense,
  lastDayOfMonthYM,
  provisionDaysUntilNext,
  isHitMonth,
  provisionPot,
  effectiveProvisionAmount,
  provisionDueAlert,
  formatProvisionNextHit,
  provisionAdjustmentsForMonth,
} from '../utils/provision.utils';
import {
  rowToExpense,
  expenseToRow,
  rowToIncome,
  incomeToRow,
  rowsToMonthlyMap,
  rowsToCategoryBudgetMap,
  rowToProvision,
  provisionToRow,
  rowToProvisionAdjustment,
  adjustmentToRow,
  rowToRecurringExpense,
  recurringExpenseToRow,
  rowToSavingsGoal,
  savingsGoalToRow,
  savingsContributionToRow,
} from '../utils/supabase-mappers';

function emptyMonthlyMap(): MonthlyAmountMap {
  return { moi: {}, madame: {} };
}

function emptyCategoryBudgetMap(): CategoryBudgetMap {
  return { moi: {}, madame: {} };
}

export interface IncomeBarEntry {
  key: string;
  label: string;
  date: string;
  amount: number;
  isVersement?: boolean;
  isRollover?: boolean;
}

export interface SmartAlert {
  severity: 'critical' | 'warning' | 'info';
  icon: string;
  message: string;
}

// Résultat de remainingBudget() — objet plutôt qu'un simple nombre pour que
// l'UI puisse expliquer le montant (budget / déjà dépensé / à venir) sans
// recalculer la logique métier côté composant.
export interface RemainingBudget {
  amount: number;
  budget: number;
  spent: number;
  recurringRemaining: number;
  provisionsRemaining: number;
}

// Store central : équivalent de l'ancien objet `state` + `renderAll()`.
// Toute vue qui lit ces signals se met à jour automatiquement — pas besoin
// d'appeler manuellement un "render" comme dans l'ancienne app.
@Injectable({ providedIn: 'root' })
export class BudgetStore {
  readonly expenses = signal<Expense[]>([]);
  readonly incomes = signal<Income[]>([]);
  readonly provisions = signal<Provision[]>([]);
  readonly savingsGoals = signal<SavingsGoal[]>([]);
  readonly recurringExpenses = signal<RecurringExpense[]>([]);
  readonly budgets = signal<MonthlyAmountMap>(emptyMonthlyMap());
  readonly categoryBudgets = signal<CategoryBudgetMap>(emptyCategoryBudgetMap());
  readonly rollovers = signal<MonthlyAmountMap>(emptyMonthlyMap());
  // Mois clôturés ("YYYY-MM") : verrou global, pas par profil — une fois
  // un mois clôturé, plus aucune saisie/modif/suppression n'est possible
  // pour ce mois-ci, peu importe le profil actif. Set plutôt que tableau
  // pour des lookups O(1) (isMonthClosed est appelé par toutes les
  // méthodes de mutation datées, potentiellement souvent).
  readonly closedMonths = signal<Set<string>>(new Set());

  readonly current = signal<string>(ymOf(new Date()));
  readonly activeOwner = signal<OwnerOrGlobal>('moi');
  readonly loading = signal(true);
  // Liste des tables dont le chargement a échoué au dernier loadAll() —
  // null tant qu'aucun chargement n'a eu lieu, [] si tout est ok. Sans ça,
  // une erreur réseau/Supabase sur une table se traduisait auparavant par
  // `?? []`, indiscernable d'une table réellement vide (voir
  // AUDIT_PRODUCTION_V2.md §3.5) — l'UI peut afficher un bandeau
  // d'avertissement tant que loadError() n'est pas vide, plutôt que de
  // laisser croire silencieusement que les données sont à jour.
  readonly loadError = signal<string[] | null>(null);

  constructor(private supabase: SupabaseService) {}

  async loadAll(): Promise<void> {
    this.loading.set(true);
    const client = this.supabase.client;
    const [
      expensesRes,
      incomesRes,
      budgetsRes,
      categoryBudgetsRes,
      rolloversRes,
      provisionsRes,
      adjustmentsRes,
      recurringExpensesRes,
      savingsGoalsRes,
      savingsContributionsRes,
      closedMonthsRes,
    ] = await Promise.all([
      client.from('expenses').select('*').order('date'),
      client.from('incomes').select('*').order('date'),
      client.from('budgets').select('*'),
      client.from('category_budgets').select('*'),
      client.from('rollovers').select('*'),
      client.from('provisions').select('*'),
      client.from('provision_adjustments').select('*'),
      client.from('recurring_expenses').select('*').order('day_of_month'),
      client.from('savings_goals').select('*'),
      client.from('savings_goal_contributions').select('*'),
      client.from('closed_months').select('*'),
    ]);

    const failedTables = (
      [
        ['expenses', expensesRes],
        ['incomes', incomesRes],
        ['budgets', budgetsRes],
        ['category_budgets', categoryBudgetsRes],
        ['rollovers', rolloversRes],
        ['provisions', provisionsRes],
        ['provision_adjustments', adjustmentsRes],
        ['recurring_expenses', recurringExpensesRes],
        ['savings_goals', savingsGoalsRes],
        ['savings_goal_contributions', savingsContributionsRes],
        ['closed_months', closedMonthsRes],
      ] as const
    )
      .filter(([, res]) => res.error)
      .map(([table]) => table);

    if (failedTables.length) {
      // On logue pour le diagnostic (console visible en dev, et
      // interceptable par un outil de monitoring plus tard) sans bloquer
      // l'affichage : les tables en échec gardent leurs anciennes valeurs
      // en mémoire (voir plus bas) plutôt que d'être vidées à tort.
      console.error('loadAll(): échec de chargement sur', failedTables.join(', '));
    }
    this.loadError.set(failedTables.length ? failedTables : []);

    // Chaque table n'est mise à jour que si sa requête a réussi — en cas
    // d'erreur, on garde l'ancienne valeur du signal plutôt que de la
    // remplacer par une liste vide qui ferait croire à des données
    // effacées (ex. rouvrir l'app après une coupure réseau ne doit pas
    // donner l'impression que tout a disparu).
    if (!expensesRes.error) this.expenses.set((expensesRes.data ?? []).map(rowToExpense));
    if (!incomesRes.error) this.incomes.set((incomesRes.data ?? []).map(rowToIncome));
    if (!budgetsRes.error) this.budgets.set(rowsToMonthlyMap(budgetsRes.data ?? []));
    if (!categoryBudgetsRes.error) {
      this.categoryBudgets.set(rowsToCategoryBudgetMap(categoryBudgetsRes.data ?? []));
    }
    if (!rolloversRes.error) this.rollovers.set(rowsToMonthlyMap(rolloversRes.data ?? []));
    if (!recurringExpensesRes.error) {
      this.recurringExpenses.set((recurringExpensesRes.data ?? []).map(rowToRecurringExpense));
    }
    // provisions dépend aussi de adjustmentsRes : une erreur sur l'une ou
    // l'autre peut faire recalculer des pots de provision incomplets, donc
    // les deux gardent l'ancienne valeur en cas d'échec de l'une des deux.
    if (!provisionsRes.error && !adjustmentsRes.error) {
      this.provisions.set(
        (provisionsRes.data ?? []).map((row: any) => rowToProvision(row, adjustmentsRes.data ?? [])),
      );
    }
    if (!savingsGoalsRes.error && !savingsContributionsRes.error) {
      this.savingsGoals.set(
        (savingsGoalsRes.data ?? []).map((row: any) =>
          rowToSavingsGoal(row, savingsContributionsRes.data ?? []),
        ),
      );
    }
    if (!closedMonthsRes.error) {
      this.closedMonths.set(new Set((closedMonthsRes.data ?? []).map((row: any) => row.ym as string)));
    }
    this.loading.set(false);
  }

  // Le report Global n'est jamais stocké : toujours la somme de Moi + Madame
  // (même logique que le budget global = somme des deux profils).
  rolloverFor(owner: OwnerOrGlobal, ym: string): number {
    if (owner === 'global') {
      return this.rolloverFor('moi', ym) + this.rolloverFor('madame', ym);
    }
    return this.rollovers()[owner]?.[ym] ?? 0;
  }

  // --- Clôture de mois ---------------------------------------------------
  // Un mois clôturé verrouille toutes les opérations DATÉES dans ce mois
  // (dépenses, revenus ponctuels, ajustements de provisions, contributions
  // d'épargne, budgets par catégorie, report). Volontairement PAS les
  // entités structurelles qui s'étendent sur plusieurs mois (provisions,
  // dépenses récurrentes, revenus récurrents, objectifs d'épargne
  // eux-mêmes) : clôturer juillet ne doit pas empêcher de renommer une
  // provision ou de désactiver un récurrent qui existe indépendamment du
  // mois. confirmRecurringExpense/payProvision/splitVersementIntoProvisions
  // ne sont pas gardés directement : ils délèguent à addExpense/
  // addProvisionAdjustment, déjà gardés, donc couverts automatiquement.

  isMonthClosed(ym: string): boolean {
    return this.closedMonths().has(ym);
  }

  // Pratique pour l'UI : état de clôture du mois actuellement affiché.
  readonly currentMonthClosed = computed(() => this.isMonthClosed(this.current()));

  private assertMonthOpen(ym: string): void {
    if (this.isMonthClosed(ym)) {
      throw new Error(`Le mois ${ym} est clôturé : plus aucune modification n'est possible.`);
    }
  }

  async closeMonth(ym: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('closed_months')
      .upsert({ ym }, { onConflict: 'ym' });
    if (error) throw error;
    this.closedMonths.update((set) => new Set(set).add(ym));
  }

  async reopenMonth(ym: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('closed_months')
      .delete()
      .eq('ym', ym);
    if (error) throw error;
    this.closedMonths.update((set) => {
      const copy = new Set(set);
      copy.delete(ym);
      return copy;
    });
  }

  // Versements reçus de l'autre profil (un versement envoyé par l'autre
  // augmente le budget de celle qui le reçoit). 0 au niveau Global : ce
  // n'est qu'un transfert interne qui s'annule.
  versementsRecus(owner: OwnerOrGlobal, ym: string | null): number {
    const inMonth = (e: Expense) =>
      e.category === 'Versement' && (!ym || e.date.startsWith(ym));
    if (owner === 'moi') {
      return this.expenses()
        .filter((e) => inMonth(e) && e.owner === 'madame')
        .reduce((s, e) => s + e.amount, 0);
    }
    if (owner === 'madame') {
      return this.expenses()
        .filter((e) => inMonth(e) && e.owner === 'moi')
        .reduce((s, e) => s + e.amount, 0);
    }
    return 0;
  }

  // Barre résumé toujours visible : revenus + versements reçus + report,
  // pour le mois affiché et le profil actif.
  readonly incomeBar = computed(() => {
    const ym = this.current();
    const owner = this.activeOwner();
    const entries: IncomeBarEntry[] = [];

    const rollover = this.rolloverFor(owner, ym);
    if (rollover !== 0) {
      entries.push({
        key: `rollover-${owner}-${ym}`,
        label: `↩ Report de ${monthLabel(prevYM(ym))}`,
        date: `${ym}-01`,
        amount: rollover,
        isRollover: true,
      });
    }

    this.incomes().forEach((i) => {
      if (owner !== 'global' && i.owner !== owner) return;
      if (!incomeAppliesToMonth(i, ym)) return;
      const badge = i.owner === 'moi' ? 'Moi' : 'Mme';
      const label = i.recurring
        ? `${i.type} • ${badge}`
        : `${i.type} • ${fmtDate(i.date)} • ${badge}`;
      entries.push({
        key: `income-${i.id}`,
        label,
        date: i.date,
        amount: incomeForMonth(i, ym),
      });
    });

    if (owner !== 'global') {
      const sender: Owner = owner === 'moi' ? 'madame' : 'moi';
      const senderLabel = sender === 'moi' ? 'Moi' : 'Madame';
      this.expenses()
        .filter(
          (e) =>
            e.category === 'Versement' &&
            e.owner === sender &&
            e.date.startsWith(ym),
        )
        .forEach((e) => {
          entries.push({
            key: `versement-${e.id}`,
            label: `↔ Versement reçu de ${senderLabel} • ${fmtDate(e.date)}`,
            date: e.date,
            amount: e.amount,
            isVersement: true,
          });
        });
    }

    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const total = entries.reduce((s, e) => s + e.amount, 0);
    return { entries, total };
  });

  // Dépenses du profil et du mois affichés (vue "mois" uniquement pour
  // l'instant — la vue "Tout" arrivera avec la vue annuelle, plus tard).
  readonly visibleExpenses = computed(() => {
    const ym = this.current();
    const owner = this.activeOwner();
    return this.expenses()
      .filter((e) => owner === 'global' || e.owner === owner)
      .filter((e) => e.date.startsWith(ym))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  });

  // Revenus du profil et du mois affichés (mêmes règles que dans la barre
  // "Entrées du mois" : incomeAppliesToMonth() gère aussi la récurrence).
  readonly visibleIncomes = computed(() => {
    const ym = this.current();
    const owner = this.activeOwner();
    return this.incomes()
      .filter((i) => owner === 'global' || i.owner === owner)
      .filter((i) => incomeAppliesToMonth(i, ym))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  });

  // Provisions pertinentes pour le profil actif (Global = toutes).
  readonly visibleProvisions = computed(() => {
    const owner = this.activeOwner();
    return owner === 'global'
      ? this.provisions()
      : this.provisions().filter((p) => p.owner === owner);
  });

  readonly visibleSavingsGoals = computed(() => {
    const owner = this.activeOwner();
    return owner === 'global'
      ? this.savingsGoals()
      : this.savingsGoals().filter((g) => g.owner === owner);
  });

  // "À payer bientôt" : provisions dues ce mois-ci, en déficit, ou dont
  // l'échéance tombe dans les 30 prochains jours — triées par date, la
  // plus proche en premier. Donne une vue calendrier des gros paiements
  // à venir, pour ne pas se faire surprendre.
  readonly upcomingProvisions = computed(() => {
    const ym = this.current();
    const expenses = this.expenses();

    return this.visibleProvisions()
      .map((p) => {
        const pot = provisionPot(p, ym, expenses);
        const target = effectiveProvisionAmount(p, expenses);
        const daysUntil = provisionDaysUntilNext(p, ym);
        const dueThisMonth = isHitMonth(p, ym);
        const dueAlert = provisionDueAlert(p, ym, expenses);

        let status: 'ready' | 'accumulating' | 'deficit';
        if (pot < 0) {
          status = 'deficit';
        } else if (pot >= target) {
          status = 'ready';
        } else {
          status = 'accumulating';
        }

        return {
          provision: p,
          pot,
          target,
          missing: Math.max(target - pot, 0),
          daysUntil,
          dueThisMonth,
          dueAlert,
          status,
          nextLabel: formatProvisionNextHit(p, ym),
        };
      })
      .filter((row) => row.dueThisMonth || row.daysUntil <= 30 || row.status === 'deficit')
      .sort((a, b) => a.daysUntil - b.daysUntil);
  });

  // Dépenses "comptées" pour le budget/solde/graphique : dépenses réelles des
  // catégories NON provisionnées + réserve synthétique par provision active.
  readonly countedExpensesList = computed<CountedExpense[]>(() =>
    countedExpenses(
      this.expenses(),
      this.provisions(),
      this.activeOwner(),
      this.current(),
    ),
  );

  // Vue annuelle (roadmap #9) : signal indépendant du mois affiché
  // ailleurs, pour pouvoir consulter une année sans perturber la vue
  // "mois" du reste du tableau de bord.
  readonly yearlyYear = signal<number>(new Date().getFullYear());

  // Vision 12 mois du budget : dépenses, budget, solde net, revenus,
  // provisions accumulées/payées et carte de crédit, mois par mois, pour
  // le profil actif (Moi/Madame/Global — même filtre que le reste de
  // l'app). Utilise countedExpenses() pour rester cohérent avec les
  // provisions, qui remplacent le paiement réel par une réserve.
  readonly yearlyView = computed(() => {
    const owner = this.activeOwner();
    const year = this.yearlyYear();
    const provisions = this.provisions();
    const expenses = this.expenses();
    const incomes = this.incomes();
    const owners: Owner[] = owner === 'global' ? ['moi', 'madame'] : [owner];
    const todayYm = ymOf(new Date());

    const relevantProvisions =
      owner === 'global' ? provisions : provisions.filter((p) => p.owner === owner);
    const provisionCategories = new Set(relevantProvisions.map((p) => p.category));

    const months = Array.from({ length: 12 }, (_, i) => {
      const ym = `${year}-${String(i + 1).padStart(2, '0')}`;

      let revenus = 0;
      owners.forEach((o) => {
        incomes.forEach((inc) => {
          if (inc.owner === o) revenus += incomeForMonth(inc, ym);
        });
        if (owner !== 'global') revenus += this.versementsRecus(o, ym);
      });

      const spent = countedExpenses(expenses, provisions, owner, ym).reduce(
        (s, e) => s + e.amount,
        0,
      );
      const rollover = this.rolloverFor(owner, ym);
      // "budget" inclut le report du mois clôturé précédent, comme dans
      // budgetSummary() — sinon "Dépenses > Budget" (overBudget) serait
      // trompeur pour un mois qui a reçu un report.
      const budget = revenus + rollover;
      const soldeNet = budget - spent;

      const provisionsAccumulated = relevantProvisions.reduce(
        (s, p) => s + provisionAdjustmentsForMonth(p, ym).reduce((s2, a) => s2 + a.amount, 0),
        0,
      );
      const provisionsPaid = expenses
        .filter(
          (e) =>
            provisionCategories.has(e.category) &&
            e.date.startsWith(ym) &&
            (owner === 'global' || e.owner === owner),
        )
        .reduce((s, e) => s + e.amount, 0);

      const ccTotal = expenses
        .filter(
          (e) =>
            (owner === 'global' || e.owner === owner) &&
            e.date.startsWith(ym) &&
            e.cc &&
            e.category !== 'Versement' &&
            e.category !== 'Remboursement Carte Crédit',
        )
        .reduce((s, e) => s + e.amount, 0);

      return {
        ym,
        label: monthShortLabel(ym),
        revenus,
        budget,
        spent,
        soldeNet,
        provisionsAccumulated,
        provisionsPaid,
        ccTotal,
        overBudget: budget > 0 && spent > budget,
        isCurrentMonth: ym === todayYm,
        isFuture: ym > todayYm,
      };
    });

    const totals = months.reduce(
      (acc, m) => ({
        revenus: acc.revenus + m.revenus,
        budget: acc.budget + m.budget,
        spent: acc.spent + m.spent,
        soldeNet: acc.soldeNet + m.soldeNet,
        provisionsAccumulated: acc.provisionsAccumulated + m.provisionsAccumulated,
        provisionsPaid: acc.provisionsPaid + m.provisionsPaid,
        ccTotal: acc.ccTotal + m.ccTotal,
      }),
      {
        revenus: 0,
        budget: 0,
        spent: 0,
        soldeNet: 0,
        provisionsAccumulated: 0,
        provisionsPaid: 0,
        ccTotal: 0,
      },
    );

    return { year, months, totals };
  });


  // countedExpenses() (pas les dépenses brutes) pour rester cohérent avec
  // les provisions, qui lissent déjà certaines dépenses irrégulières.
  readonly monthComparison = computed(() => {
    const owner = this.activeOwner();
    const ym = this.current();
    const prevYm = prevYM(ym);

    const currentList = this.countedExpensesList();
    const prevList = countedExpenses(this.expenses(), this.provisions(), owner, prevYm);

    const currentTotal = currentList.reduce((s, e) => s + e.amount, 0);
    const prevTotal = prevList.reduce((s, e) => s + e.amount, 0);

    const byCategory = (list: CountedExpense[]) => {
      const map = new Map<string, number>();
      list.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount));
      return map;
    };
    const currentByCat = byCategory(currentList);
    const prevByCat = byCategory(prevList);

    const categories = new Set([...currentByCat.keys(), ...prevByCat.keys()]);
    const rows = Array.from(categories)
      .map((category) => {
        const current = currentByCat.get(category) ?? 0;
        const previous = prevByCat.get(category) ?? 0;
        return { category, current, previous, delta: current - previous };
      })
      .filter((r) => Math.abs(r.delta) >= 0.01)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // Mois en cours = comparaison partielle (le mois n'est pas terminé) :
    // signalé pour éviter une lecture trompeuse (voir point d'attention
    // de la roadmap), plutôt que de faire une projection approximative.
    const isPartialMonth = ym === ymOf(new Date());

    return {
      prevYm,
      prevLabel: monthLabel(prevYm),
      currentTotal,
      prevTotal,
      delta: currentTotal - prevTotal,
      rows,
      isPartialMonth,
      hasPrevData: prevList.length > 0,
    };
  });


  readonly revenueBase = computed(() => {
    const owner = this.activeOwner();
    const ym = this.current();
    let total = 0;
    this.incomes().forEach((i) => {
      if (owner !== 'global' && i.owner !== owner) return;
      total += incomeForMonth(i, ym);
    });
    if (owner !== 'global') total += this.versementsRecus(owner, ym);
    return total;
  });

  // Résumé budget + solde net du mois/profil affichés. Le report du mois
  // clôturé précédent (rollover) est inclus dans "budget" : c'est de
  // l'argent réellement disponible ce mois-ci, au même titre que les
  // revenus — sinon la barre de progression et le "sur X$" affiché
  // sous-évaluent ce qui est vraiment disponible à dépenser.
  readonly budgetSummary = computed(() => {
    const owner = this.activeOwner();
    const ym = this.current();
    const spent = this.countedExpensesList().reduce((s, e) => s + e.amount, 0);
    const rollover = this.rolloverFor(owner, ym);
    const budget = this.revenueBase() + rollover;
    const versementsIn = owner === 'global' ? 0 : this.versementsRecus(owner, ym);
    return {
      spent,
      budget,
      rollover,
      versementsIn,
      soldeNet: budget - spent,
    };
  });

  // Prévision de fin de mois : uniquement pour le mois réel en cours (pas
  // les mois passés/futurs). Sépare les réserves de provisions (déjà
  // comptées en entier pour le mois, pas à projeter) des dépenses réelles
  // "variables" (celles-là seules sont extrapolées selon le rythme du mois),
  // pour éviter qu'une grosse provision en début de mois fausse la
  // projection (voir le point d'attention du document de roadmap).
  readonly monthForecast = computed(() => {
    const ym = this.current();
    const today = new Date();
    if (ym !== ymOf(today)) return null;

    const dayOfMonth = today.getDate();
    const daysInMonth = Number(lastDayOfMonthYM(ym).slice(-2));

    const list = this.countedExpensesList();
    const provisionPart = list
      .filter((e) => e.provision)
      .reduce((s, e) => s + e.amount, 0);
    const variablePart = list
      .filter((e) => !e.provision)
      .reduce((s, e) => s + e.amount, 0);

    const projectedVariable = (variablePart / dayOfMonth) * daysInMonth;
    const projectedSpend = provisionPart + projectedVariable;

    const { budget } = this.budgetSummary();
    const projectedSoldeNet = budget - projectedSpend;

    return {
      dayOfMonth,
      daysInMonth,
      spentSoFar: provisionPart + variablePart,
      projectedSpend,
      projectedSoldeNet,
    };
  });

  // "Reste réellement disponible" : budget moins ce qui est déjà dépensé,
  // ET moins ce qui va forcément être dépensé/réservé avant la fin du
  // mois affiché (récurrents attendus pas encore confirmés + montant
  // manquant des provisions dont l'échéance tombe ce mois-ci). Contraire
  // à l'ancien remainingPerDay (retiré), fonctionne pour n'importe quel
  // mois affiché (pas seulement le mois réel en cours), car
  // budgetSummary/expectedThisMonth/upcomingProvisions le font déjà tous.
  //
  // Volontairement nommé "remainingBudget" et pas "safeToSpend" : ce
  // calcul répond uniquement à "combien reste-t-il dans mon budget ?",
  // pas à "combien puis-je dépenser sans compromettre mes finances ?"
  // (qui demanderait en plus épargne, marge de sécurité, etc. — hors
  // scope de cette itération).
  //
  // Pas de double comptage : les contributions déjà faites ce mois-ci à
  // une provision sont comptées dans `spent` (via countedExpenses) ET
  // font déjà baisser `missing` d'autant (missing = target - pot, et pot
  // inclut ces contributions) — donc les deux déductions sont
  // complémentaires, jamais redondantes. Voir provisionPot().
  readonly remainingBudget = computed<RemainingBudget>(() => {
    const { budget, spent } = this.budgetSummary();

    const recurringRemaining = this.expectedThisMonth().reduce(
      (s, row) => s + row.template.amount,
      0,
    );

    const provisionsRemaining = this.upcomingProvisions()
      .filter((row) => row.dueThisMonth)
      .reduce((s, row) => s + row.missing, 0);

    return {
      amount: budget - spent - recurringRemaining - provisionsRemaining,
      budget,
      spent,
      recurringRemaining,
      provisionsRemaining,
    };
  });

  // "Disponible par jour", basé sur remainingBudget() (pas sur le budget
  // brut — voir l'historique dans REVIEW_ARCHITECTURE_ET_PLAN_REFACTORING
  // ou la doc de positionnement : une première version basée sur
  // `budget - spentSoFar` seul ignorait les récurrents/provisions à venir
  // et pouvait annoncer un montant par jour trompeur). Réparti sur les
  // jours restants du MOIS RÉEL EN COURS uniquement — null en dehors de
  // ce mois (même garde que monthForecast) et quand il ne reste plus de
  // jours (dernier jour du mois).
  readonly remainingBudgetPerDay = computed(() => {
    const forecast = this.monthForecast();
    if (!forecast) return null;

    const daysLeft = forecast.daysInMonth - forecast.dayOfMonth;
    if (daysLeft <= 0) return null;

    return this.remainingBudget().amount / daysLeft;
  });

  // Alertes intelligentes : agrège plusieurs signaux déjà calculés
  // ailleurs (provisions, budget par catégorie, budget global, carte de
  // crédit, solde net) en une petite liste courte, triée par gravité, sans
  // répétition. Plafonnée à 5 pour éviter le bruit ("ne pas afficher trop
  // d'alertes").
  readonly smartAlerts = computed<SmartAlert[]>(() => {
    const alerts: SmartAlert[] = [];
    const ym = this.current();
    const isCurrentMonth = ym === ymOf(new Date());
    const summary = this.budgetSummary();

    // Solde net négatif
    if (summary.soldeNet < 0) {
      alerts.push({
        severity: 'critical',
        icon: '🔴',
        message: `Solde net négatif : ${fmt(summary.soldeNet)}.`,
      });
    }

    // Provisions en retard ou bientôt dues avec cagnotte insuffisante
    this.upcomingProvisions().forEach((row) => {
      if (!row.dueAlert) return;
      const when =
        row.daysUntil < 0
          ? `en retard de ${Math.abs(row.daysUntil)} j`
          : row.daysUntil === 0
            ? "aujourd'hui"
            : row.daysUntil === 1
              ? 'demain'
              : `dans ${row.daysUntil} j`;
      alerts.push({
        severity: row.dueAlert.type === 'overdue' ? 'critical' : 'warning',
        icon: row.dueAlert.type === 'overdue' ? '🔴' : '⏰',
        message: `${row.provision.name} ${when} : il manque ${fmt(row.missing)}.`,
      });
    });

    // Budget global (uniquement pour le mois réel en cours)
    if (isCurrentMonth && summary.budget > 0) {
      const pct = (summary.spent / summary.budget) * 100;
      // Bug corrigé : comparer sur le pourcentage (spent/budget*100 >= 100)
      // déclenchait "Budget dépassé de 0,00 $" dès que le budget était
      // exactement atteint (pile 100 %, pas réellement dépassé). On
      // compare maintenant le montant réel, plus précis qu'un pourcentage
      // arrondi et cohérent avec le reste du code (ex. provisionDueAlert
      // fait déjà `pot >= target` pour ne rien afficher quand la cible est
      // pile atteinte, pas seulement dépassée).
      if (summary.spent > summary.budget) {
        alerts.push({
          severity: 'critical',
          icon: '🔴',
          message: `Budget dépassé de ${fmt(summary.spent - summary.budget)}.`,
        });
      } else if (pct >= 80) {
        alerts.push({
          severity: 'warning',
          icon: '⚠️',
          message: `Budget global à ${pct.toFixed(0)} % avant la fin du mois.`,
        });
      }
    }

    // Catégories proches ou en dépassement de leur budget (les 2 pires)
    this.categoryBudgetRows()
      .filter((r) => r.budget > 0 && r.pct >= 80)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 2)
      .forEach((r) => {
        // Même correctif que ci-dessus : dépassement seulement si le
        // montant restant est réellement négatif, pas juste "pct >= 100"
        // (pile 100 % ne veut pas dire dépassé, et affichait auparavant
        // "dépassement de 0,00 $" — trompeur).
        if (r.remaining < 0) {
          alerts.push({
            severity: 'warning',
            icon: '⚠️',
            message: `${r.category} : dépassement de ${fmt(-r.remaining)}.`,
          });
        } else {
          alerts.push({
            severity: 'info',
            icon: 'ℹ️',
            message: `${r.category} à ${r.pct.toFixed(0)} % du budget.`,
          });
        }
      });

    // Carte de crédit élevée par rapport au budget
    const ccTotal = this.visibleExpenses()
      .filter(
        (e) =>
          e.cc && e.category !== 'Versement' && e.category !== 'Remboursement Carte Crédit',
      )
      .reduce((s, e) => s + e.amount, 0);
    if (summary.budget > 0 && ccTotal / summary.budget >= 0.5) {
      alerts.push({
        severity: 'info',
        icon: '💳',
        message: `Carte de crédit : ${fmt(ccTotal)} chargés ce mois-ci (${((ccTotal / summary.budget) * 100).toFixed(0)} % du budget).`,
      });
    }

    // Chevauchement catégorie : une provision et une dépense récurrente
    // active couvrent la même catégorie. Jamais traité comme une erreur —
    // les deux peuvent être des obligations légitimes et distinctes (ex.
    // leasing auto en récurrent + entretien auto en provision). Purement
    // informatif, pour laisser l'utilisateur vérifier lui-même s'il ne
    // s'agit pas en fait de la même obligation comptée deux fois. Les
    // provisions n'ont pas de notion "active/inactive" dans le modèle
    // (contrairement aux récurrents) : toutes comptent.
    const provisionCategories = new Set(this.visibleProvisions().map((p) => p.category));
    const flaggedCategories = new Set<string>();
    this.visibleRecurringExpenses()
      .filter((r) => r.active && provisionCategories.has(r.category))
      .forEach((r) => {
        if (flaggedCategories.has(r.category)) return;
        flaggedCategories.add(r.category);
        alerts.push({
          severity: 'info',
          icon: 'ℹ️',
          message: `${r.category} : couverte par une provision et une dépense récurrente. Vérifie qu'il ne s'agit pas de la même obligation.`,
        });
      });

    const order: Record<SmartAlert['severity'], number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    return alerts.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 5);
  });

  // Budget d'une catégorie pour un profil et un mois : hérite du mois
  // précédent le plus récent qui en a un si rien n'est défini pour ce
  // mois précis (même principe que prévu pour le budget mensuel).
  effectiveCategoryBudget(owner: Owner, category: string, ym: string): number {
    let cursor = ym;
    for (let i = 0; i < 36; i++) {
      const v = this.categoryBudgets()[owner]?.[cursor]?.[category];
      if (v != null) return v;
      cursor = prevYM(cursor);
    }
    return 0;
  }

  // Liste des catégories "actives" (budgétées et/ou dépensées) pour le
  // profil/mois affichés, avec dépensé/budget/restant/%. Utilise
  // countedExpensesList() (pas les dépenses brutes) pour rester cohérent
  // avec les provisions, qui remplacent le paiement réel par une réserve.
  readonly categoryBudgetRows = computed(() => {
    const owner = this.activeOwner();
    const ym = this.current();
    const owners: Owner[] = owner === 'global' ? ['moi', 'madame'] : [owner];

    const spentByCategory: Record<string, number> = {};
    this.countedExpensesList().forEach((e) => {
      spentByCategory[e.category] = (spentByCategory[e.category] || 0) + e.amount;
    });

    const categories = new Set<string>(Object.keys(spentByCategory));
    owners.forEach((o) => {
      Object.values(this.categoryBudgets()[o] || {}).forEach((catMap) => {
        Object.keys(catMap).forEach((c) => categories.add(c));
      });
    });

    return Array.from(categories)
      .map((category) => {
        const budget = owners.reduce(
          (s, o) => s + this.effectiveCategoryBudget(o, category, ym),
          0,
        );
        const spent = spentByCategory[category] || 0;
        const pct = budget > 0 ? (spent / budget) * 100 : spent > 0 ? 100 : 0;
        // Un budget explicitement mis à 0 pour LE MOIS AFFICHÉ (pas hérité
        // d'un mois précédent) doit rester visible dans la liste, même
        // sans dépense — sinon la ligne disparaît dès qu'on enregistre 0,
        // ce qui donne l'impression que ça n'a pas fonctionné.
        const hasExplicitEntryThisMonth = owners.some(
          (o) => this.categoryBudgets()[o]?.[ym]?.[category] != null,
        );
        return { category, budget, spent, remaining: budget - spent, pct, hasExplicitEntryThisMonth };
      })
      .filter((r) => r.budget > 0 || r.spent > 0 || r.hasExplicitEntryThisMonth)
      .sort((a, b) => b.spent - a.spent || b.budget - a.budget);
  });

  async setCategoryBudget(
    owner: Owner,
    ym: string,
    category: string,
    amount: number,
  ): Promise<void> {
    this.assertMonthOpen(ym);
    const { error } = await this.supabase.client
      .from('category_budgets')
      .upsert({ owner, ym, category, amount }, { onConflict: 'owner,ym,category' });
    if (error) throw error;
    this.categoryBudgets.update((map) => {
      const copy: CategoryBudgetMap = { moi: { ...map.moi }, madame: { ...map.madame } };
      copy[owner] = { ...copy[owner], [ym]: { ...copy[owner][ym], [category]: amount } };
      return copy;
    });
  }

  async removeCategoryBudget(owner: Owner, ym: string, category: string): Promise<void> {
    this.assertMonthOpen(ym);
    const { error } = await this.supabase.client
      .from('category_budgets')
      .delete()
      .eq('owner', owner)
      .eq('ym', ym)
      .eq('category', category);
    if (error) throw error;
    this.categoryBudgets.update((map) => {
      const copy: CategoryBudgetMap = { moi: { ...map.moi }, madame: { ...map.madame } };
      if (copy[owner][ym]) {
        const catMap = { ...copy[owner][ym] };
        delete catMap[category];
        copy[owner] = { ...copy[owner], [ym]: catMap };
      }
      return copy;
    });
  }

  // Crée une dépense puis recale les provisions concernées. Les deux
  // opérations touchent des tables différentes (pas de transaction SQL
  // possible depuis ici) — si le recalage échoue après que la dépense a
  // été insérée, on supprime la dépense qu'on vient de créer (rollback de
  // compensation) plutôt que de la laisser exister sans le recalage
  // attendu, ce qui serait un état incohérent silencieux.
  async addExpense(expense: Omit<Expense, 'id'>): Promise<Expense> {
    this.assertMonthOpen(expense.date.slice(0, 7));
    const { data, error } = await this.supabase.client
      .from('expenses')
      .insert(expenseToRow(expense))
      .select()
      .single();
    if (error) throw error;
    const newExpense = rowToExpense(data);
    this.expenses.update((list) => [...list, newExpense]);
    try {
      await this.syncProvisionsFromExpense(newExpense);
    } catch (err) {
      const { error: rollbackError } = await this.supabase.client
        .from('expenses')
        .delete()
        .eq('id', newExpense.id);
      this.expenses.update((list) => list.filter((e) => e.id !== newExpense.id));
      if (rollbackError) {
        throw new Error(
          `Le recalage des provisions a échoué (${(err as Error).message ?? err}) et la dépense créée n'a pas ` +
            `pu être annulée (${rollbackError.message}). Vérifie manuellement dans Supabase.`,
        );
      }
      throw new Error(
        `Le recalage des provisions a échoué : ${(err as Error).message ?? err}. La dépense n'a pas été créée (annulée automatiquement).`,
      );
    }
    return newExpense;
  }

  async removeExpense(id: string): Promise<void> {
    const existing = this.expenses().find((e) => e.id === id);
    if (existing) this.assertMonthOpen(existing.date.slice(0, 7));
    const { error } = await this.supabase.client
      .from('expenses')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.expenses.update((list) => list.filter((e) => e.id !== id));
  }

  // Édite une dépense existante. Recalcule automatiquement tout ce qui en
  // dépend (cagnotte des provisions, budget, solde net...) puisque ce sont
  // des signals dérivés — et recale la provision correspondante si la
  // dépense éditée tombe (toujours ou désormais) dans sa catégorie/profil,
  // exactement comme à la création.
  async updateExpense(
    id: string,
    changes: Partial<Omit<Expense, 'id'>>,
  ): Promise<void> {
    const existing = this.expenses().find((e) => e.id === id);
    if (!existing) throw new Error('Dépense introuvable.');
    // Le mois d'origine ET le mois de destination (si la date change)
    // doivent tous les deux être ouverts : on ne peut ni modifier une
    // dépense qui appartient à un mois clôturé, ni en déplacer une dans
    // un mois clôturé.
    this.assertMonthOpen(existing.date.slice(0, 7));
    if (changes.date !== undefined) {
      this.assertMonthOpen(changes.date.slice(0, 7));
    }

    const row: Record<string, unknown> = {};
    if (changes.amount !== undefined) row['amount'] = changes.amount;
    if (changes.category !== undefined) row['category'] = changes.category;
    if (changes.date !== undefined) row['date'] = changes.date;
    if (changes.owner !== undefined) row['owner'] = changes.owner;
    if (changes.cc !== undefined) row['cc'] = changes.cc;
    if (changes.recurringSourceId !== undefined) {
      row['recurring_source_id'] = changes.recurringSourceId;
    }

    const { data, error } = await this.supabase.client
      .from('expenses')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = rowToExpense(data);
    this.expenses.update((list) =>
      list.map((e) => (e.id === id ? updated : e)),
    );
    try {
      await this.syncProvisionsFromExpense(updated);
    } catch (err) {
      // Même logique de compensation qu'addExpense() : on revient à
      // l'état d'avant l'édition plutôt que de laisser la dépense
      // modifiée sans son recalage de provision.
      const { error: rollbackError } = await this.supabase.client
        .from('expenses')
        .update(expenseToRow(existing))
        .eq('id', id);
      this.expenses.update((list) => list.map((e) => (e.id === id ? existing : e)));
      if (rollbackError) {
        throw new Error(
          `Le recalage des provisions a échoué (${(err as Error).message ?? err}) et la dépense n'a pas pu être ` +
            `restaurée à son état précédent (${rollbackError.message}). Vérifie manuellement dans Supabase.`,
        );
      }
      throw new Error(
        `Le recalage des provisions a échoué : ${(err as Error).message ?? err}. La modification a été annulée automatiquement.`,
      );
    }
  }

  readonly visibleRecurringExpenses = computed(() => {
    const owner = this.activeOwner();
    return owner === 'global'
      ? this.recurringExpenses()
      : this.recurringExpenses().filter((r) => r.owner === owner);
  });

  // "Dépenses attendues ce mois-ci" : occurrences non encore confirmées
  // pour le mois affiché. Un gabarit mensuel produit une seule occurrence
  // (comportement d'origine, inchangé) ; un gabarit hebdo/aux 2
  // semaines/2x par mois peut en produire plusieurs pour le même mois.
  //
  // Correspondance confirmé/attendu par COMPTE (pas par date exacte) :
  // si un gabarit attend K occurrences ce mois-ci et que C dépenses de ce
  // mois y sont déjà liées (quelle que soit leur date exacte), on masque
  // les C premières occurrences suggérées. Ça préserve exactement le
  // comportement mensuel d'origine (K=1 : masqué dès qu'une confirmation
  // existe, même si l'utilisateur a changé la date avant de confirmer) et
  // se généralise proprement aux gabarits à occurrences multiples, sans
  // dépendre d'une correspondance de date exacte fragile.
  readonly expectedThisMonth = computed(() => {
    const ym = this.current();
    const confirmedCounts = new Map<string, number>();
    this.expenses()
      .filter((e) => e.recurringSourceId && e.date.startsWith(ym))
      .forEach((e) => {
        const id = e.recurringSourceId!;
        confirmedCounts.set(id, (confirmedCounts.get(id) ?? 0) + 1);
      });

    const result: { template: RecurringExpense; suggestedDate: string }[] = [];
    for (const r of this.visibleRecurringExpenses()) {
      if (!r.active) continue;
      const occurrences = occurrencesInMonth(r, ym);
      const alreadyConfirmed = confirmedCounts.get(r.id) ?? 0;
      occurrences
        .slice(alreadyConfirmed)
        .forEach((suggestedDate) => result.push({ template: r, suggestedDate }));
    }
    return result;
  });

  async addRecurringExpense(r: Omit<RecurringExpense, 'id'>): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('recurring_expenses')
      .insert(recurringExpenseToRow(r))
      .select()
      .single();
    if (error) throw error;
    this.recurringExpenses.update((list) => [...list, rowToRecurringExpense(data)]);
  }

  async updateRecurringExpense(
    id: string,
    changes: Partial<Omit<RecurringExpense, 'id'>>,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (changes.name !== undefined) row['name'] = changes.name;
    if (changes.amount !== undefined) row['amount'] = changes.amount;
    if (changes.category !== undefined) row['category'] = changes.category;
    if (changes.owner !== undefined) row['owner'] = changes.owner;
    if (changes.dayOfMonth !== undefined) row['day_of_month'] = changes.dayOfMonth;
    if (changes.cc !== undefined) row['cc'] = changes.cc;
    if (changes.active !== undefined) row['active'] = changes.active;

    const { data, error } = await this.supabase.client
      .from('recurring_expenses')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = rowToRecurringExpense(data);
    this.recurringExpenses.update((list) =>
      list.map((r) => (r.id === id ? updated : r)),
    );
  }

  async removeRecurringExpense(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('recurring_expenses')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.recurringExpenses.update((list) => list.filter((r) => r.id !== id));
  }

  // Confirme une dépense attendue : crée la dépense réelle correspondante,
  // liée au modèle (pour qu'elle ne soit plus suggérée ce mois-ci).
  // Réutilise addExpense() tel quel — création, recalage éventuel de
  // provision, sauvegarde, tout est déjà géré là-bas.
  async confirmRecurringExpense(
    templateId: string,
    amount: number,
    date: string,
    cc: boolean,
  ): Promise<void> {
    const template = this.recurringExpenses().find((r) => r.id === templateId);
    if (!template) throw new Error('Dépense récurrente introuvable.');
    await this.addExpense({
      amount,
      category: template.category,
      date,
      owner: template.owner,
      cc,
      recurringSourceId: template.id,
    });
  }

  // Si une dépense réelle tombe dans la même catégorie/profil qu'une
  // provision configurée en recalage automatique, son cycle repart de la
  // date de ce paiement (même logique que l'ancienne app).
  private async syncProvisionsFromExpense(expense: Expense): Promise<void> {
    if (!(expense.amount > 0)) return;
    if (expense.category === 'Revenu' || expense.category === 'Versement') return;

    const matches = this.provisions().filter(
      (p) =>
        p.category === expense.category &&
        p.owner === expense.owner &&
        p.autoRecalibrate,
    );
    if (matches.length === 0) return;

    const results = await Promise.all(
      matches.map((p) => {
        const updates: any = { start_ym: expense.date.slice(0, 7) };
        if (provisionUnit(p) === 'days') updates.start_date = expense.date;
        return this.supabase.client.from('provisions').update(updates).eq('id', p.id);
      }),
    );
    // Bug corrigé : ces erreurs n'étaient auparavant jamais vérifiées —
    // un échec de mise à jour d'une provision passait totalement
    // inaperçu, laissant croire à un recalage réussi alors que la
    // provision gardait sa date d'origine. On remonte l'erreur au lieu
    // de continuer, pour qu'addExpense()/updateExpense() puisse
    // déclencher leur rollback de compensation.
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      throw new Error(
        `Échec de mise à jour de ${failed.length} provision(s) : ${failed[0].error?.message}`,
      );
    }

    const matchIds = new Set(matches.map((p) => p.id));
    this.provisions.update((list) =>
      list.map((p) =>
        matchIds.has(p.id)
          ? {
              ...p,
              startYM: expense.date.slice(0, 7),
              startDate: provisionUnit(p) === 'days' ? expense.date : p.startDate,
            }
          : p,
      ),
    );
  }

  async addProvision(provision: Omit<Provision, 'id' | 'adjustments'>): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('provisions')
      .insert(provisionToRow(provision))
      .select()
      .single();
    if (error) throw error;
    this.provisions.update((list) => [...list, rowToProvision(data, [])]);
  }

  async removeProvision(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('provisions')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.provisions.update((list) => list.filter((p) => p.id !== id));
  }

  // --- Objectifs d'épargne (roadmap #10) ---------------------------------

  async addSavingsGoal(goal: Omit<SavingsGoal, 'id' | 'contributions'>): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('savings_goals')
      .insert(savingsGoalToRow(goal))
      .select()
      .single();
    if (error) throw error;
    this.savingsGoals.update((list) => [...list, rowToSavingsGoal(data, [])]);
  }

  async removeSavingsGoal(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('savings_goals')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.savingsGoals.update((list) => list.filter((g) => g.id !== id));
  }

  async addSavingsGoalContribution(
    goalId: string,
    amount: number,
    date: string,
    note: string,
  ): Promise<void> {
    this.assertMonthOpen(date.slice(0, 7));
    const { data, error } = await this.supabase.client
      .from('savings_goal_contributions')
      .insert(savingsContributionToRow(goalId, { amount, date, note }))
      .select()
      .single();
    if (error) throw error;
    const contribution = {
      id: data.id,
      amount: Number(data.amount),
      date: data.date,
      note: data.note ?? '',
    };
    this.savingsGoals.update((list) =>
      list.map((g) =>
        g.id === goalId ? { ...g, contributions: [...g.contributions, contribution] } : g,
      ),
    );
  }

  async removeSavingsGoalContribution(goalId: string, contributionId: string): Promise<void> {
    const goal = this.savingsGoals().find((g) => g.id === goalId);
    const contribution = goal?.contributions.find((c) => c.id === contributionId);
    if (contribution) this.assertMonthOpen(contribution.date.slice(0, 7));
    const { error } = await this.supabase.client
      .from('savings_goal_contributions')
      .delete()
      .eq('id', contributionId);
    if (error) throw error;
    this.savingsGoals.update((list) =>
      list.map((g) =>
        g.id === goalId
          ? { ...g, contributions: g.contributions.filter((c) => c.id !== contributionId) }
          : g,
      ),
    );
  }

  // Édite une provision existante (utilisé pour l'instant pour ajuster le
  // pourcentage de répartition, mais reste générique pour d'autres champs).
  async updateProvision(
    id: string,
    changes: Partial<Omit<Provision, 'id' | 'adjustments'>>,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (changes.name !== undefined) row['name'] = changes.name;
    if (changes.amount !== undefined) row['amount'] = changes.amount;
    if (changes.everyN !== undefined) row['every_n'] = changes.everyN;
    if (changes.intervalUnit !== undefined) row['interval_unit'] = changes.intervalUnit;
    if (changes.startYM !== undefined) row['start_ym'] = changes.startYM || null;
    if (changes.startDate !== undefined) row['start_date'] = changes.startDate || null;
    if (changes.category !== undefined) row['category'] = changes.category;
    if (changes.owner !== undefined) row['owner'] = changes.owner;
    if (changes.autoRecalibrate !== undefined) row['auto_recalibrate'] = changes.autoRecalibrate;
    if (changes.allocationPercent !== undefined) row['allocation_percent'] = changes.allocationPercent;
    if (changes.rollingCount !== undefined) row['rolling_count'] = changes.rollingCount;

    const { data, error } = await this.supabase.client
      .from('provisions')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const existing = this.provisions().find((p) => p.id === id);
    const updated = rowToProvision(data, existing ? existing.adjustments.map((a) => ({
      id: a.id,
      provision_id: id,
      amount: a.amount,
      date: a.date,
      note: a.note,
    })) : []);
    this.provisions.update((list) => list.map((p) => (p.id === id ? updated : p)));
  }

  // Marque une provision comme payée : crée la dépense réelle correspondante.
  // Réutilise addExpense() tel quel (création + recalage automatique via
  // syncProvisionsFromExpense) — rien n'est dupliqué ici.
  // Versements "Versement" déjà enregistrés (via le formulaire de dépense
  // classique) pour l'expéditeur du profil actif, mais pas encore répartis
  // entre des provisions (aucun ajustement lié). Permet de répartir un
  // versement existant sans en recréer un — et donc sans le décompter deux
  // fois du budget de l'expéditeur.
  readonly unsplitVersements = computed(() => {
    const receiver = this.activeOwner();
    if (receiver === 'global') return [];
    const sender: Owner = receiver === 'moi' ? 'madame' : 'moi';
    const linkedIds = new Set(
      this.provisions().flatMap((p) =>
        p.adjustments.map((a) => a.versementExpenseId).filter((id): id is string => !!id),
      ),
    );
    return this.expenses()
      .filter((e) => e.category === 'Versement' && e.owner === sender && !linkedIds.has(e.id))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  // Enregistre un versement reçu ET le répartit en un seul geste entre
  // plusieurs provisions (ajouts au fonds), pour aider à payer des
  // provisions à plusieurs. Réutilise addExpense() et
  // addProvisionAdjustment() tels quels — rien n'est dupliqué. Chaque
  // ajout est lié à la dépense "Versement" via versementExpenseId, pour
  // pouvoir défaire la répartition en un clic (cancelVersementSplit),
  // sans supprimer le versement lui-même.
  // Si existingExpenseId est fourni (versement déjà enregistré via le
  // formulaire de dépense classique), aucune nouvelle dépense n'est créée
  // — on répartit celle qui existe déjà, pour éviter de la décompter deux
  // fois du budget de l'expéditeur.
  async splitVersementIntoProvisions(
    totalAmount: number,
    date: string,
    allocations: { provisionId: string; amount: number }[],
    existingExpenseId?: string,
  ): Promise<void> {
    const receiver = this.activeOwner();
    if (receiver === 'global') {
      throw new Error('Choisis le profil Moi ou Madame avant de répartir un versement.');
    }
    const sender: Owner = receiver === 'moi' ? 'madame' : 'moi';
    const senderLabel = sender === 'moi' ? 'Moi' : 'Madame';

    let versementExpenseId: string;
    if (existingExpenseId) {
      const existing = this.expenses().find((e) => e.id === existingExpenseId);
      if (!existing) throw new Error('Versement introuvable.');
      versementExpenseId = existing.id;
    } else {
      const versementExpense = await this.addExpense({
        amount: totalAmount,
        category: 'Versement',
        date,
        owner: sender,
        cc: false,
      });
      versementExpenseId = versementExpense.id;
    }

    for (const a of allocations) {
      if (a.amount > 0) {
        await this.addProvisionAdjustment(
          a.provisionId,
          a.amount,
          date,
          `Versement de ${senderLabel}`,
          versementExpenseId,
        );
      }
    }
  }

  // Annule une répartition de versement faite avec splitVersementIntoProvisions :
  // supprime uniquement les ajouts de provisions qui lui sont liés
  // (versementExpenseId) — PAS la dépense "Versement" elle-même. Le
  // versement redevient une dépense normale, modifiable/supprimable comme
  // les autres (utile car un versement "existant" a pu être enregistré
  // indépendamment de la répartition, et ne doit pas disparaître avec elle).
  async cancelVersementSplit(versementExpenseId: string): Promise<void> {
    const linked = this.provisions().flatMap((p) =>
      p.adjustments
        .filter((a) => a.versementExpenseId === versementExpenseId)
        .map((a) => ({ provisionId: p.id, adjustmentId: a.id, date: a.date })),
    );
    if (linked.length === 0) return;

    // Toutes les répartitions liées à un même versement partagent
    // normalement la même date (créées ensemble par
    // splitVersementIntoProvisions), mais on vérifie chaque mois concerné
    // par sécurité plutôt que de supposer.
    new Set(linked.map((l) => l.date.slice(0, 7))).forEach((ym) => this.assertMonthOpen(ym));

    const { error } = await this.supabase.client
      .from('provision_adjustments')
      .delete()
      .in(
        'id',
        linked.map((l) => l.adjustmentId),
      );
    if (error) throw error;
    const linkedIds = new Set(linked.map((l) => l.adjustmentId));
    this.provisions.update((list) =>
      list.map((p) => ({
        ...p,
        adjustments: p.adjustments.filter((a) => !linkedIds.has(a.id)),
      })),
    );
  }

  async payProvision(
    provisionId: string,
    amount: number,
    date: string,
    cc: boolean,
  ): Promise<void> {
    const provision = this.provisions().find((p) => p.id === provisionId);
    if (!provision) throw new Error('Provision introuvable.');
    await this.addExpense({
      amount,
      category: provision.category,
      date,
      owner: provision.owner,
      cc,
    });
  }

  async addProvisionAdjustment(
    provisionId: string,
    amount: number,
    date: string,
    note: string,
    versementExpenseId?: string,
  ): Promise<void> {
    this.assertMonthOpen(date.slice(0, 7));
    const { data, error } = await this.supabase.client
      .from('provision_adjustments')
      .insert(adjustmentToRow(provisionId, { amount, date, note, versementExpenseId }))
      .select()
      .single();
    if (error) throw error;
    const adjustment = rowToProvisionAdjustment(data);
    this.provisions.update((list) =>
      list.map((p) =>
        p.id === provisionId
          ? { ...p, adjustments: [...p.adjustments, adjustment] }
          : p,
      ),
    );
  }

  async removeProvisionAdjustment(
    provisionId: string,
    adjustmentId: string,
  ): Promise<void> {
    const adjustment = this.provisions()
      .find((p) => p.id === provisionId)
      ?.adjustments.find((a) => a.id === adjustmentId);
    if (adjustment) this.assertMonthOpen(adjustment.date.slice(0, 7));
    const { error } = await this.supabase.client
      .from('provision_adjustments')
      .delete()
      .eq('id', adjustmentId);
    if (error) throw error;
    this.provisions.update((list) =>
      list.map((p) =>
        p.id === provisionId
          ? { ...p, adjustments: p.adjustments.filter((a) => a.id !== adjustmentId) }
          : p,
      ),
    );
  }

  async addIncome(income: Omit<Income, 'id'>): Promise<void> {
    // Un revenu récurrent est une entité structurelle (s'applique à tous
    // les mois à partir de recurringStartMonth) — sa création n'est pas
    // bloquée par la clôture du mois de sa date de référence. Seuls les
    // revenus ponctuels sont de vraies transactions datées.
    if (!income.recurring) this.assertMonthOpen(income.date.slice(0, 7));
    const { data, error } = await this.supabase.client
      .from('incomes')
      .insert(incomeToRow(income))
      .select()
      .single();
    if (error) throw error;
    this.incomes.update((list) => [...list, rowToIncome(data)]);
  }

  async removeIncome(id: string): Promise<void> {
    const existing = this.incomes().find((i) => i.id === id);
    if (existing && !existing.recurring) this.assertMonthOpen(existing.date.slice(0, 7));
    const { error } = await this.supabase.client
      .from('incomes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.incomes.update((list) => list.filter((i) => i.id !== id));
  }

  // En vue Global, retire le report des DEUX profils pour ce mois (le report
  // Global affiché n'est que leur somme, jamais stocké séparément).
  async removeRollover(owner: OwnerOrGlobal, ym: string): Promise<void> {
    this.assertMonthOpen(ym);
    const owners: Owner[] = owner === 'global' ? ['moi', 'madame'] : [owner];
    await Promise.all(
      owners.map((o) =>
        this.supabase.client
          .from('rollovers')
          .delete()
          .eq('owner', o)
          .eq('ym', ym),
      ),
    );
    this.rollovers.update((map) => {
      const copy: MonthlyAmountMap = {
        moi: { ...map.moi },
        madame: { ...map.madame },
      };
      owners.forEach((o) => delete copy[o][ym]);
      return copy;
    });
  }

  // Écrit (ou remplace) le report d'un profil pour un mois donné.
  async setRollover(owner: Owner, ym: string, amount: number): Promise<void> {
    this.assertMonthOpen(ym);
    const { error } = await this.supabase.client
      .from('rollovers')
      .upsert({ owner, ym, amount }, { onConflict: 'owner,ym' });
    if (error) throw error;
    this.rollovers.update((map) => ({
      ...map,
      [owner]: { ...map[owner], [ym]: amount },
    }));
  }

  // Calcule le solde net d'un profil précis (Moi/Madame) pour le mois
  // affiché, sans changer le profil actuellement sélectionné à l'écran.
  soldeNetForOwner(owner: Owner): number {
    const saved = this.activeOwner();
    this.activeOwner.set(owner);
    const result = this.budgetSummary().soldeNet;
    this.activeOwner.set(saved);
    return result;
  }

  // Nombre de dépenses / revenus ponctuels du mois affiché (tous profils),
  // pour le récapitulatif avant réinitialisation.
  monthStats(ym: string): { nExp: number; nInc: number } {
    return {
      nExp: this.expenses().filter((e) => e.date.startsWith(ym)).length,
      nInc: this.incomes().filter((i) => !i.recurring && i.date.startsWith(ym))
        .length,
    };
  }

  // Supprime les dépenses du mois donné (tous profils).
  async resetExpensesForMonth(ym: string): Promise<void> {
    this.assertMonthOpen(ym);
    const { error } = await this.supabase.client
      .from('expenses')
      .delete()
      .gte('date', `${ym}-01`)
      .lte('date', lastDayOfMonthYM(ym));
    if (error) throw error;
    this.expenses.update((list) => list.filter((e) => !e.date.startsWith(ym)));
  }

  // Supprime les revenus PONCTUELS du mois donné (tous profils). Les revenus
  // récurrents ne sont jamais supprimés ici : ils s'appliquent à tous les
  // mois, un par mois n'aurait pas de sens.
  async resetIncomesForMonth(ym: string): Promise<void> {
    this.assertMonthOpen(ym);
    const targets = this.incomes().filter(
      (i) => !i.recurring && i.date.startsWith(ym),
    );
    if (targets.length === 0) return;
    const { error } = await this.supabase.client
      .from('incomes')
      .delete()
      .in(
        'id',
        targets.map((i) => i.id),
      );
    if (error) throw error;
    const ids = new Set(targets.map((i) => i.id));
    this.incomes.update((list) => list.filter((i) => !ids.has(i.id)));
  }

  // Réinitialisation complète : efface tout, tous les profils, tous les
  // mois. Passe par la fonction Postgres reset_everything() (voir
  // supabase/migration-008-atomic-reset.sql) plutôt que par 8 DELETE
  // séparés depuis le client : la fonction s'exécute dans une seule
  // transaction, donc soit tout est supprimé, soit rien ne l'est — plus
  // de risque de suppression partielle en cas d'échec réseau/permission
  // à mi-parcours (voir AUDIT_PRODUCTION_V2.md §3.3).
  async resetEverything(): Promise<void> {
    const { error } = await this.supabase.client.rpc('reset_everything');
    if (error) {
      throw new Error(
        `Échec de la réinitialisation : ${error.message}. Opération atomique — aucune donnée n'a été supprimée.`,
      );
    }

    this.expenses.set([]);
    this.incomes.set([]);
    this.provisions.set([]);
    this.savingsGoals.set([]);
    this.recurringExpenses.set([]);
    this.budgets.set(emptyMonthlyMap());
    this.categoryBudgets.set(emptyCategoryBudgetMap());
    this.rollovers.set(emptyMonthlyMap());
  }

  // Restaure une sauvegarde .json exportée précédemment : remplace TOUTES
  // les données actuelles. Les identifiants d'origine sont conservés pour
  // que les ajustements de provisions restent liés à la bonne provision.
  //
  // Atomicité (voir AUDIT_PRODUCTION_V2.md §3.3) : la restauration elle-même
  // reste ~10 insert Supabase séquentiels (contrairement à
  // resetEverything(), une vraie transaction SQL pour ~10 tables aux
  // formes différentes — legacy id remapping compris — serait un chantier
  // à part entière, pas fait ici). Ce qu'on garantit à la place : un
  // "tout ou rien" par compensation. Si un insert échoue en cours de
  // route, on revide tout ce qui vient d'être partiellement inséré via
  // resetEverything() (déjà atomique) avant de remonter l'erreur — pour
  // ne jamais laisser la base dans un état "à moitié restauré". Le pire
  // cas possible n'est donc plus "données mélangées entre l'ancien et le
  // nouvel import", mais "import annulé, base vide" — un état sans
  // ambiguïté, que l'utilisateur peut réessayer.
  async importData(data: any): Promise<void> {
    if (
      !data ||
      !Array.isArray(data.expenses) ||
      !Array.isArray(data.incomes) ||
      !Array.isArray(data.provisions)
    ) {
      throw new Error('Format de fichier non reconnu.');
    }

    await this.resetEverything();

    try {
      await this.insertImportedData(data);
    } catch (err) {
      try {
        await this.resetEverything();
      } catch (rollbackErr) {
        // Cas rare et sérieux : l'import a échoué ET le rollback de
        // compensation a échoué aussi (ex. panne réseau prolongée). On ne
        // masque ni l'un ni l'autre — l'utilisateur doit savoir que l'état
        // de la base est incertain et vérifier manuellement, plutôt que de
        // recevoir un message qui ne parle que de l'échec d'origine.
        throw new Error(
          `Échec de l'import (${(err as Error).message ?? err}), et la restauration automatique de secours a ` +
            `elle-même échoué (${(rollbackErr as Error).message ?? rollbackErr}). L'état de la base est incertain ` +
            `— vérifie manuellement dans Supabase avant de réessayer.`,
        );
      }
      throw new Error(
        `Import annulé : ${(err as Error).message ?? err}. Aucune donnée n'a été conservée (la base a été revidée), tu peux réessayer.`,
      );
    }

    await this.loadAll();
  }

  private async insertImportedData(data: any): Promise<void> {
    // L'ancienne application (fichier HTML unique) générait des identifiants
    // courts (ex. "mrztns345pw3k"), pas de vrais UUID comme Supabase les
    // exige. On les remplace ici par de vrais UUID, en gardant une table de
    // correspondance pour relier correctement les ajustements à leur
    // provision. Les fichiers déjà au format UUID (exportés depuis cette
    // nouvelle app) passent inchangés.
    const isUuid = (v: unknown): v is string =>
      typeof v === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const idFor = (v: unknown): string => (isUuid(v) ? v : crypto.randomUUID());

    if (data.provisions.length) {
      const provisionIdMap = new Map<string, string>();
      const provisionRows = data.provisions.map((p: Provision) => {
        const newId = idFor(p.id);
        provisionIdMap.set(String(p.id), newId);
        return { id: newId, ...provisionToRow(p) };
      });
      const { error } = await this.supabase.client
        .from('provisions')
        .insert(provisionRows);
      if (error) throw error;

      const adjustmentRows = data.provisions.flatMap((p: Provision) =>
        (p.adjustments || []).map((a) => ({
          id: idFor(a.id),
          provision_id: provisionIdMap.get(String(p.id))!,
          amount: a.amount,
          date: a.date,
          note: a.note,
        })),
      );
      if (adjustmentRows.length) {
        const { error: adjError } = await this.supabase.client
          .from('provision_adjustments')
          .insert(adjustmentRows);
        if (adjError) throw adjError;
      }
    }

    // Optionnel : absent des sauvegardes faites avant l'ajout des objectifs
    // d'épargne, donc on ne bloque pas l'import si le champ manque.
    if (Array.isArray(data.savingsGoals) && data.savingsGoals.length) {
      const goalIdMap = new Map<string, string>();
      const goalRows = data.savingsGoals.map((g: SavingsGoal) => {
        const newId = idFor(g.id);
        goalIdMap.set(String(g.id), newId);
        return { id: newId, ...savingsGoalToRow(g) };
      });
      const { error: goalError } = await this.supabase.client
        .from('savings_goals')
        .insert(goalRows);
      if (goalError) throw goalError;

      const contributionRows = data.savingsGoals.flatMap((g: SavingsGoal) =>
        (g.contributions || []).map((c) => ({
          id: idFor(c.id),
          savings_goal_id: goalIdMap.get(String(g.id))!,
          amount: c.amount,
          date: c.date,
          note: c.note,
        })),
      );
      if (contributionRows.length) {
        const { error: contribError } = await this.supabase.client
          .from('savings_goal_contributions')
          .insert(contributionRows);
        if (contribError) throw contribError;
      }
    }

    // Optionnel : absent des sauvegardes exportées avant ce correctif —
    // même garde que pour savingsGoals ci-dessus, on ne bloque pas
    // l'import d'un fichier plus ancien qui ne les contient pas.
    if (Array.isArray(data.recurringExpenses) && data.recurringExpenses.length) {
      const rows = data.recurringExpenses.map((r: RecurringExpense) => ({
        id: idFor(r.id),
        ...recurringExpenseToRow(r),
      }));
      const { error } = await this.supabase.client.from('recurring_expenses').insert(rows);
      if (error) throw error;
    }

    if (data.expenses.length) {
      const rows = data.expenses.map((e: Expense) => ({
        id: idFor(e.id),
        ...expenseToRow(e),
      }));
      const { error } = await this.supabase.client.from('expenses').insert(rows);
      if (error) throw error;
    }

    if (data.incomes.length) {
      const rows = data.incomes.map((i: Income) => ({
        id: idFor(i.id),
        ...incomeToRow(i),
      }));
      const { error } = await this.supabase.client.from('incomes').insert(rows);
      if (error) throw error;
    }

    const ownersList: Owner[] = ['moi', 'madame'];
    if (data.budgets) {
      const rows: any[] = [];
      ownersList.forEach((o) => {
        Object.entries(data.budgets[o] || {}).forEach(([ym, amount]) => {
          rows.push({ owner: o, ym, amount });
        });
      });
      if (rows.length) {
        const { error } = await this.supabase.client.from('budgets').insert(rows);
        if (error) throw error;
      }
    }

    if (data.rollovers) {
      const rows: any[] = [];
      ownersList.forEach((o) => {
        Object.entries(data.rollovers[o] || {}).forEach(([ym, amount]) => {
          rows.push({ owner: o, ym, amount });
        });
      });
      if (rows.length) {
        const { error } = await this.supabase.client.from('rollovers').insert(rows);
        if (error) throw error;
      }
    }

    if (data.categoryBudgets) {
      const rows: any[] = [];
      ownersList.forEach((o) => {
        Object.entries(data.categoryBudgets[o] || {}).forEach(([ym, catMap]: [string, any]) => {
          Object.entries(catMap || {}).forEach(([category, amount]) => {
            rows.push({ owner: o, ym, category, amount });
          });
        });
      });
      if (rows.length) {
        const { error } = await this.supabase.client
          .from('category_budgets')
          .insert(rows);
        if (error) throw error;
      }
    }
  }

  // Sauvegarde complète en .json (téléchargement local), pour archive
  // manuelle ou avant une réinitialisation.
  exportData(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      expenses: this.expenses(),
      incomes: this.incomes(),
      provisions: this.provisions(),
      savingsGoals: this.savingsGoals(),
      recurringExpenses: this.recurringExpenses(),
      budgets: this.budgets(),
      categoryBudgets: this.categoryBudgets(),
      rollovers: this.rollovers(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-tracker-${this.current()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
