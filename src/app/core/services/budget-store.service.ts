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
  ProvisionAdjustment,
  RecurringExpense,
  RecurringIncome,
  SavingsGoal,
  CreditCardPayment,
} from '../models/budget.models';
import { incomeAppliesToMonth, incomeForMonth } from '../utils/income.utils';
import { occurrencesInMonth } from '../utils/recurring-expense.utils';
import { ymOf, prevYM, nextYM, monthLabel, monthShortLabel, fmtDate, isoOfDate } from '../utils/date.utils';
import { fmt } from '../utils/currency.utils';
import {
  provisionUnit,
  countedExpenses,
  CountedExpense,
  lastDayOfMonthYM,
  provisionDaysUntilNext,
  isHitMonth,
  provisionPot,
  round2,
  provisionStart,
  effectiveProvisionAmount,
  provisionDueAlert,
  formatProvisionUpcomingHit,
  provisionAdjustmentsUpTo,
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
  rowToRecurringIncome,
  recurringIncomeToRow,
  rowToSavingsGoal,
  savingsGoalToRow,
  savingsContributionToRow,
  rowToCreditCardPayment,
  creditCardPaymentToRow,
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

// Validation en profondeur du fichier importé (audit BUG-014) — au-delà
// de la simple présence des tableaux (déjà vérifiée dans importData()),
// chaque élément est ici vérifié individuellement : types corrects,
// montants numériques positifs, dates au format YYYY-MM-DD, profil parmi
// ('moi'|'madame'). Collecte TOUTES les erreurs plutôt que de s'arrêter à
// la première, pour que l'utilisateur voie d'un coup tout ce qui cloche
// dans son fichier plutôt que de corriger un problème à la fois par
// tentatives successives.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;
const VALID_OWNERS = ['moi', 'madame'];
const VALID_RECURRING_INTERVALS = ['once', 'monthly', 'weekly', 'biweekly', 'semimonthly'];
const VALID_PROVISION_INTERVAL_UNITS = ['days', 'months'];
const VALID_RECURRING_EXPENSE_INTERVALS = ['monthly', 'weekly', 'biweekly', 'semimonthly'];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateImportPayload(data: any): string[] {
  const errors: string[] = [];

  (data.expenses as unknown[]).forEach((raw, i) => {
    const e = raw as any;
    const label = `expenses[${i}]`;
    if (!isFiniteNumber(e?.amount) || e.amount <= 0) errors.push(`${label} : montant invalide (${e?.amount})`);
    if (!isNonEmptyString(e?.category)) errors.push(`${label} : catégorie manquante`);
    if (!isNonEmptyString(e?.date) || !DATE_RE.test(e.date)) errors.push(`${label} : date invalide (${e?.date})`);
    if (!VALID_OWNERS.includes(e?.owner)) errors.push(`${label} : profil invalide (${e?.owner})`);
  });

  (data.incomes as unknown[]).forEach((raw, i) => {
    const inc = raw as any;
    const label = `incomes[${i}]`;
    if (!isFiniteNumber(inc?.amount) || inc.amount <= 0) errors.push(`${label} : montant invalide (${inc?.amount})`);
    if (!isNonEmptyString(inc?.type)) errors.push(`${label} : type manquant`);
    if (!isNonEmptyString(inc?.date) || !DATE_RE.test(inc.date)) errors.push(`${label} : date invalide (${inc?.date})`);
    if (!VALID_OWNERS.includes(inc?.owner)) errors.push(`${label} : profil invalide (${inc?.owner})`);
    if (inc?.recurring && !VALID_RECURRING_INTERVALS.includes(inc?.recurringInterval)) {
      errors.push(`${label} : fréquence de récurrence invalide (${inc?.recurringInterval})`);
    }
  });

  (data.provisions as unknown[]).forEach((raw, i) => {
    const p = raw as any;
    const label = `provisions[${i}]`;
    if (!isFiniteNumber(p?.amount) || p.amount <= 0) errors.push(`${label} : montant invalide (${p?.amount})`);
    if (!isFiniteNumber(p?.everyN) || p.everyN <= 0) errors.push(`${label} : cycle invalide (${p?.everyN})`);
    if (!VALID_PROVISION_INTERVAL_UNITS.includes(p?.intervalUnit)) {
      errors.push(`${label} : unité de cycle invalide (${p?.intervalUnit})`);
    }
    if (!isNonEmptyString(p?.startYM) || !YM_RE.test(p.startYM)) {
      errors.push(`${label} : mois de départ invalide (${p?.startYM})`);
    }
    if (!isNonEmptyString(p?.category)) errors.push(`${label} : catégorie manquante`);
    if (!VALID_OWNERS.includes(p?.owner)) errors.push(`${label} : profil invalide (${p?.owner})`);
    if (
      p?.allocationPercent != null &&
      (!isFiniteNumber(p.allocationPercent) || p.allocationPercent < 0 || p.allocationPercent > 100)
    ) {
      errors.push(`${label} : pourcentage d'allocation invalide (${p.allocationPercent})`);
    }
    (p?.adjustments || []).forEach((raw2: unknown, j: number) => {
      const a = raw2 as any;
      const label2 = `${label}.adjustments[${j}]`;
      if (!isFiniteNumber(a?.amount) || a.amount <= 0) errors.push(`${label2} : montant invalide (${a?.amount})`);
      if (!isNonEmptyString(a?.date) || !DATE_RE.test(a.date)) errors.push(`${label2} : date invalide (${a?.date})`);
    });
  });

  if (Array.isArray(data.recurringExpenses)) {
    (data.recurringExpenses as unknown[]).forEach((raw, i) => {
      const r = raw as any;
      const label = `recurringExpenses[${i}]`;
      if (!isFiniteNumber(r?.amount) || r.amount <= 0) errors.push(`${label} : montant invalide (${r?.amount})`);
      if (!isNonEmptyString(r?.category)) errors.push(`${label} : catégorie manquante`);
      if (!VALID_OWNERS.includes(r?.owner)) errors.push(`${label} : profil invalide (${r?.owner})`);
      if (r?.interval != null && !VALID_RECURRING_EXPENSE_INTERVALS.includes(r.interval)) {
        errors.push(`${label} : fréquence invalide (${r.interval})`);
      }
    });
  }

  if (Array.isArray(data.recurringIncomes)) {
    (data.recurringIncomes as unknown[]).forEach((raw, i) => {
      const r = raw as any;
      const label = `recurringIncomes[${i}]`;
      if (!isFiniteNumber(r?.amount) || r.amount <= 0) errors.push(`${label} : montant invalide (${r?.amount})`);
      if (!isNonEmptyString(r?.type)) errors.push(`${label} : type manquant`);
      if (!VALID_OWNERS.includes(r?.owner)) errors.push(`${label} : profil invalide (${r?.owner})`);
      if (!isNonEmptyString(r?.startDate) || !DATE_RE.test(r.startDate)) {
        errors.push(`${label} : date de départ invalide (${r?.startDate})`);
      }
      if (r?.interval != null && !VALID_RECURRING_EXPENSE_INTERVALS.includes(r.interval)) {
        errors.push(`${label} : fréquence invalide (${r.interval})`);
      }
    });
  }

  if (Array.isArray(data.savingsGoals)) {
    (data.savingsGoals as unknown[]).forEach((raw, i) => {
      const g = raw as any;
      const label = `savingsGoals[${i}]`;
      if (!isFiniteNumber(g?.targetAmount) || g.targetAmount <= 0) {
        errors.push(`${label} : montant cible invalide (${g?.targetAmount})`);
      }
      if (!isNonEmptyString(g?.name)) errors.push(`${label} : nom manquant`);
      if (!VALID_OWNERS.includes(g?.owner)) errors.push(`${label} : profil invalide (${g?.owner})`);
      (g?.contributions || []).forEach((raw2: unknown, j: number) => {
        const c = raw2 as any;
        const label2 = `${label}.contributions[${j}]`;
        if (!isFiniteNumber(c?.amount) || c.amount <= 0) errors.push(`${label2} : montant invalide (${c?.amount})`);
        if (!isNonEmptyString(c?.date) || !DATE_RE.test(c.date)) errors.push(`${label2} : date invalide (${c?.date})`);
      });
    });
  }

  if (Array.isArray(data.creditCardPayments)) {
    (data.creditCardPayments as unknown[]).forEach((raw, i) => {
      const p = raw as any;
      const label = `creditCardPayments[${i}]`;
      if (!isFiniteNumber(p?.amount) || p.amount <= 0) errors.push(`${label} : montant invalide (${p?.amount})`);
      if (!isNonEmptyString(p?.date) || !DATE_RE.test(p.date)) errors.push(`${label} : date invalide (${p?.date})`);
      if (!VALID_OWNERS.includes(p?.owner)) errors.push(`${label} : profil invalide (${p?.owner})`);
    });
  }

  return errors;
}

// Store central : équivalent de l'ancien objet `state` + `renderAll()`.
// Toute vue qui lit ces signals se met à jour automatiquement — pas besoin
// d'appeler manuellement un "render" comme dans l'ancienne app.
// Note dédiée pour identifier les ajustements confirmés depuis "Mes
// contributions du mois" — permet de les distinguer d'un versement reçu
// ou d'un ajout manuel générique (voir monthlyContributionReminders).
const MONTHLY_REMINDER_NOTE = 'Contribution mensuelle (rappel)';

// Note dédiée pour identifier un report automatique de surplus lors d'un
// recalage (voir syncProvisionsFromExpense) — distingue ce report d'un
// ajout manuel classique, pour qu'on puisse comprendre d'où il vient en
// le consultant dans l'historique de la provision.
const SURPLUS_CARRY_NOTE = 'Surplus reporté du cycle précédent';

@Injectable({ providedIn: 'root' })
export class BudgetStore {
  readonly expenses = signal<Expense[]>([]);
  readonly incomes = signal<Income[]>([]);
  readonly provisions = signal<Provision[]>([]);
  // Paiements faits pour rembourser la carte de crédit — volontairement
  // indépendant des provisions (voir CreditCardPayment dans budget.models.ts).
  readonly creditCardPayments = signal<CreditCardPayment[]>([]);
  readonly savingsGoals = signal<SavingsGoal[]>([]);
  readonly recurringExpenses = signal<RecurringExpense[]>([]);
  // Modèles de revenus récurrents ("paies") — voir RecurringIncome dans
  // budget.models.ts. Les occurrences réelles vivent dans `incomes`
  // (Income.recurringSourceId), générées automatiquement par
  // syncRecurringIncomes() à chaque chargement.
  readonly recurringIncomes = signal<RecurringIncome[]>([]);
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
      recurringIncomesRes,
      savingsGoalsRes,
      savingsContributionsRes,
      closedMonthsRes,
      creditCardPaymentsRes,
    ] = await Promise.all([
      client.from('expenses').select('*').order('date'),
      client.from('incomes').select('*').order('date'),
      client.from('budgets').select('*'),
      client.from('category_budgets').select('*'),
      client.from('rollovers').select('*'),
      client.from('provisions').select('*'),
      client.from('provision_adjustments').select('*'),
      client.from('recurring_expenses').select('*').order('day_of_month'),
      client.from('recurring_incomes').select('*').order('day_of_month'),
      client.from('savings_goals').select('*'),
      client.from('savings_goal_contributions').select('*'),
      client.from('closed_months').select('*'),
      client.from('credit_card_payments').select('*').order('date'),
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
        ['recurring_incomes', recurringIncomesRes],
        ['savings_goals', savingsGoalsRes],
        ['savings_goal_contributions', savingsContributionsRes],
        ['closed_months', closedMonthsRes],
        ['credit_card_payments', creditCardPaymentsRes],
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
    if (!recurringIncomesRes.error) {
      this.recurringIncomes.set((recurringIncomesRes.data ?? []).map(rowToRecurringIncome));
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
    if (!creditCardPaymentsRes.error) {
      this.creditCardPayments.set((creditCardPaymentsRes.data ?? []).map(rowToCreditCardPayment));
    }
    this.loading.set(false);

    // Génère les paies manquantes (aujourd'hui ou avant) pour tous les
    // modèles de revenus récurrents actifs — voir syncRecurringIncomes().
    // Seulement si les deux tables concernées ont bien chargé, pour ne pas
    // insérer sur la base d'un état partiel/obsolète.
    if (!incomesRes.error && !recurringIncomesRes.error) {
      this.syncRecurringIncomes().catch((err) =>
        console.error('syncRecurringIncomes() a échoué :', err),
      );
    }
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
          nextLabel: formatProvisionUpcomingHit(p, ym),
        };
      })
      .filter((row) => row.dueThisMonth || row.daysUntil <= 30 || row.status === 'deficit')
      .sort((a, b) => a.daysUntil - b.daysUntil);
  });

  // Provisions ayant un rappel de contribution mensuelle configuré
  // (voir Provision.monthlyReminder) et pas encore ajouté ce mois-ci.
  // "Pas encore ajouté" est vérifié via une note dédiée (MONTHLY_REMINDER_NOTE)
  // plutôt que "n'importe quel ajustement ce mois-ci" : un versement reçu
  // (ex. la part de Madame) crée AUSSI un ajustement ce mois-ci, mais ce
  // n'est pas la même contribution que ce rappel — les deux doivent
  // pouvoir coexister sans se masquer l'un l'autre. Ce n'est qu'un
  // pense-bête : rien n'est jamais ajouté automatiquement, l'utilisateur
  // confirme lui-même.
  readonly monthlyContributionReminders = computed(() => {
    const ym = this.current();
    return this.visibleProvisions()
      .filter((p) => p.monthlyReminder != null && p.monthlyReminder > 0)
      .filter(
        (p) => !p.adjustments.some((a) => a.date.startsWith(ym) && a.note === MONTHLY_REMINDER_NOTE),
      )
      .map((p) => ({ provision: p, amount: p.monthlyReminder as number }));
  });

  // Provisions à afficher dans la liste principale, une fois celles déjà
  // montrées dans "À payer bientôt" retirées. Bug rapporté par
  // l'utilisateur : sans cette exclusion, une provision due apparaissait
  // deux fois sur le même tableau de bord (une fois dans "À payer
  // bientôt", une fois dans "Provisions" juste en dessous) — avec la même
  // carte identique et les mêmes boutons, ce qui donnait l'impression
  // qu'une deuxième provision venait d'être créée automatiquement.
  readonly otherProvisions = computed(() => {
    const upcomingIds = new Set(this.upcomingProvisions().map((row) => row.provision.id));
    return this.visibleProvisions().filter((p) => !upcomingIds.has(p.id));
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
    // Même correctif que provisionedCategories()/countedExpenses() dans
    // provision.utils.ts (audit BUG-008/BUG-017) : clé owner+catégorie,
    // pas la catégorie seule — sinon en vue Global, la dépense réelle de
    // Madame dans une catégorie où seul Moi a une provision serait à tort
    // comptée comme "provision payée".
    const provisionCategories = new Set(
      relevantProvisions.map((p) => `${p.owner}|${p.category}`),
    );

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

      // Même correctif que countedExpenses() (audit BUG-009) : borné par
      // le début du cycle en cours (provisionAdjustmentsUpTo), pas
      // seulement par le mois calendaire — un ajout fait avant un
      // recalage (ancien cycle déjà réglé) ne doit pas gonfler
      // l'accumulation affichée pour ce mois.
      const provisionsAccumulated = relevantProvisions.reduce(
        (s, p) =>
          s +
          provisionAdjustmentsUpTo(p, ym)
            .filter((a) => a.date.startsWith(ym))
            .reduce((s2, a) => s2 + a.amount, 0),
        0,
      );
      const provisionsPaid = expenses
        .filter(
          (e) =>
            provisionCategories.has(`${e.owner}|${e.category}`) &&
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
      // "Remboursement Carte Crédit" n'apparaît déjà plus via
      // countedExpensesList() (exclue de countedExpenses() pour éviter un
      // double comptage) — cette exclusion explicite couvre en plus le
      // cas d'un budget de catégorie déjà enregistré dessus avant ce
      // changement, pour qu'elle ne réapparaisse pas via cette voie-là.
      .filter((r) => r.category !== 'Remboursement Carte Crédit')
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
    // Défense en profondeur (audit BUG-013) : les formulaires empêchent
    // déjà les montants négatifs, mais ces méthodes du store restent
    // directement appelables (import, futur appel API...). 0 reste permis
    // ici (catégorie volontairement gelée, voir le correctif précédent).
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Montant de budget invalide : ${amount}. Doit être un nombre ≥ 0.`);
    }
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
    // Défense en profondeur (audit BUG-013) — voir setCategoryBudget().
    if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
      throw new Error(`Montant de dépense invalide : ${expense.amount}. Doit être un nombre > 0.`);
    }
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
    // Recale (ou pas) les provisions concernées par la dépense supprimée
    // — voir recalibrateProvisionCycleFromHistory ci-dessous (BUG-006).
    // Volontairement non bloquant : si ce recalage rétroactif échoue, la
    // suppression de la dépense elle-même reste acquise (elle a déjà
    // réussi juste au-dessus) — seule la provision garde temporairement
    // son ancienne ancre, ce qui est un état bien moins grave qu'annuler
    // une suppression déjà effectuée en base.
    if (existing) {
      await this.recalibrateProvisionCycleFromHistory(existing.category, existing.owner);
    }
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
    // Défense en profondeur (audit BUG-013).
    if (
      changes.amount !== undefined &&
      (!Number.isFinite(changes.amount) || changes.amount <= 0)
    ) {
      throw new Error(`Montant de dépense invalide : ${changes.amount}. Doit être un nombre > 0.`);
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

    // BUG-006 : si la catégorie ou le profil a changé, une provision qui
    // matchait l'ANCIENNE combinaison catégorie/profil peut être restée
    // recalée sur cette dépense alors qu'elle n'en fait plus partie.
    // syncProvisionsFromExpense() ci-dessus ne s'occupe que de la NOUVELLE
    // combinaison — on redérive donc aussi l'ancienne, depuis l'historique
    // réel restant (voir recalibrateProvisionCycleFromHistory).
    // Volontairement non bloquant (comme pour removeExpense) : l'édition
    // elle-même a déjà réussi, seule une provision annexe pourrait garder
    // temporairement une ancre obsolète en cas d'échec ici.
    if (existing.category !== updated.category || existing.owner !== updated.owner) {
      await this.recalibrateProvisionCycleFromHistory(existing.category, existing.owner);
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

    const currentYM = expense.date.slice(0, 7);

    // Valeurs d'avant recalage, conservées pour pouvoir compenser un échec
    // partiel (audit BUG-007) : sans transaction SQL disponible côté
    // client, on ne peut pas garantir que les N UPDATE réussissent ou
    // échouent tous ensemble. Si l'un d'eux échoue après que d'autres ont
    // déjà réussi, on les remet explicitement à leur valeur d'origine
    // avant de remonter l'erreur — sinon addExpense()/updateExpense()
    // annulerait la dépense déclenchante en laissant certaines provisions
    // recalées sur une dépense qui n'existe plus.
    const previousValues = new Map(matches.map((p) => [p.id, { startYM: p.startYM, startDate: p.startDate }]));

    // Bug rapporté par un utilisateur : si la cagnotte contenait plus que
    // le montant réellement payé (ex. 300 $ de côté, facture de 176 $),
    // le surplus (124 $) disparaissait purement et simplement — le
    // recalage déplace l'ancre du cycle à la date du paiement, et tout
    // ajustement antérieur à cette nouvelle ancre devient orphelin (exclu
    // du nouveau cycle par le correctif anti-pollution d'un ancien cycle,
    // voir provisionAdjustmentsUpTo). Pire : la cagnotte affichait un faux
    // déficit juste après un paiement qui aurait dû laisser un surplus.
    //
    // On calcule le surplus RÉEL (net, après ce paiement précis) pour
    // décider SI un report est nécessaire — mais on reporte le montant
    // D'AVANT ce paiement (pas le net) : une fois l'ancre déplacée sur la
    // date de ce paiement, le nouveau cycle va lui-même soustraire ce
    // même paiement via son propre calcul de "dépensé depuis le début du
    // cycle" (puisqu'il tombe pile sur la nouvelle ancre). Reporter le
    // montant net referait cette soustraction une seconde fois.
    const expensesExcludingThis = this.expenses().filter((e) => e.id !== expense.id);
    const surplusByProvisionId = new Map<string, number>();
    matches.forEach((p) => {
      const potAfterThisPayment = provisionPot(p, currentYM, this.expenses());
      if (potAfterThisPayment > 0.004) {
        const potBeforeThisPayment = provisionPot(p, currentYM, expensesExcludingThis);
        surplusByProvisionId.set(p.id, round2(potBeforeThisPayment));
      }
    });

    const results = await Promise.all(
      matches.map((p) => {
        const updates: any = { start_ym: currentYM };
        if (provisionUnit(p) === 'days') updates.start_date = expense.date;
        return this.supabase.client.from('provisions').update(updates).eq('id', p.id);
      }),
    );
    const failed = results.filter((r) => r.error);
    const succeededProvisions = matches.filter((_, i) => !results[i].error);

    const revertRecalibration = (): Promise<{ error: any }[]> =>
      Promise.all(
        succeededProvisions.map((p) => {
          const prev = previousValues.get(p.id)!;
          const updates: any = { start_ym: prev.startYM };
          if (provisionUnit(p) === 'days') updates.start_date = prev.startDate;
          return this.supabase.client.from('provisions').update(updates).eq('id', p.id);
        }),
      );

    if (failed.length) {
      if (succeededProvisions.length) {
        const compensations = await revertRecalibration();
        const compensationFailed = compensations.filter((r) => r.error);
        if (compensationFailed.length) {
          throw new Error(
            `Échec du recalage de ${failed.length} provision(s) (${failed[0].error?.message}), et la compensation ` +
              `des provisions déjà mises à jour a elle-même échoué. Vérifie manuellement les provisions concernées ` +
              `dans Supabase — leur date de cycle peut être incohérente.`,
          );
        }
      }
      throw new Error(
        `Échec de mise à jour de ${failed.length} provision(s) : ${failed[0].error?.message}. ` +
          `Les autres provisions concernées ont été remises à leur état précédent.`,
      );
    }

    const matchIds = new Set(matches.map((p) => p.id));
    this.provisions.update((list) =>
      list.map((p) =>
        matchIds.has(p.id)
          ? {
              ...p,
              startYM: currentYM,
              startDate: provisionUnit(p) === 'days' ? expense.date : p.startDate,
            }
          : p,
      ),
    );

    // Reporte le surplus calculé plus haut, une fois le recalage acquis.
    const insertedSurplus: { provisionId: string; adjustmentId: string }[] = [];
    try {
      for (const p of matches) {
        const surplus = surplusByProvisionId.get(p.id);
        if (surplus && surplus > 0) {
          const adjustment = await this.addProvisionAdjustment(
            p.id,
            surplus,
            expense.date,
            SURPLUS_CARRY_NOTE,
          );
          insertedSurplus.push({ provisionId: p.id, adjustmentId: adjustment.id });
        }
      }
    } catch (err) {
      // Le report du surplus a échoué après que le recalage a réussi —
      // on annule tout (les reports déjà insérés, puis le recalage
      // lui-même) plutôt que de laisser une provision recalée sans son
      // surplus reporté, ce qui reproduirait exactement le bug corrigé.
      const rollbackErrors: string[] = [];
      for (const { provisionId, adjustmentId } of insertedSurplus) {
        try {
          await this.removeProvisionAdjustment(provisionId, adjustmentId);
        } catch (rollbackErr) {
          rollbackErrors.push((rollbackErr as Error).message ?? String(rollbackErr));
        }
      }
      const revertResults = await revertRecalibration();
      revertResults.filter((r) => r.error).forEach((r) => rollbackErrors.push(r.error.message));
      if (rollbackErrors.length) {
        throw new Error(
          `Échec du report du surplus (${(err as Error).message ?? err}), et l'annulation automatique n'a pas ` +
            `pu tout défaire (${rollbackErrors.join('; ')}). Vérifie manuellement les provisions concernées dans Supabase.`,
        );
      }
      throw new Error(
        `Échec du report du surplus vers le nouveau cycle : ${(err as Error).message ?? err}. Le recalage a été annulé.`,
      );
    }
  }

  // Bug rapporté par l'audit (BUG-006) : addExpense()/updateExpense()
  // recalent une provision quand une dépense réelle matche sa catégorie/
  // profil, mais rien ne faisait l'inverse quand cette dépense était
  // supprimée, ou déplacée hors de cette catégorie/profil (removeExpense
  // ne touchait à aucune provision ; updateExpense ne gérait que la
  // NOUVELLE catégorie via syncProvisionsFromExpense, jamais l'ancienne).
  // Résultat concret : une provision pouvait rester recalée sur la date
  // d'une dépense qui n'existe plus.
  //
  // Correctif : après une suppression/un changement de catégorie/profil,
  // on redérive l'ancre depuis la dépense réelle la plus RÉCENTE encore
  // présente dans cette catégorie/profil (pas depuis une "date d'origine"
  // qui n'est plus stockée nulle part une fois qu'un recalage a eu lieu).
  // S'il n'en reste aucune, on laisse l'ancre actuelle inchangée plutôt
  // que de deviner une valeur — un recul silencieux vers une date
  // arbitraire serait pire qu'une ancre légèrement obsolète mais connue.
  private async recalibrateProvisionCycleFromHistory(
    category: string,
    owner: Owner,
  ): Promise<void> {
    if (category === 'Revenu' || category === 'Versement') return;
    const matches = this.provisions().filter(
      (p) => p.category === category && p.owner === owner && p.autoRecalibrate,
    );
    if (matches.length === 0) return;

    const remaining = this.expenses()
      .filter((e) => e.category === category && e.owner === owner && e.amount > 0)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const lastExpense = remaining[0];
    if (!lastExpense) return;

    const results = await Promise.all(
      matches.map((p) => {
        const updates: any = { start_ym: lastExpense.date.slice(0, 7) };
        if (provisionUnit(p) === 'days') updates.start_date = lastExpense.date;
        return this.supabase.client.from('provisions').update(updates).eq('id', p.id);
      }),
    );
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      throw new Error(
        `Échec du recalage rétroactif de ${failed.length} provision(s) : ${failed[0].error?.message}`,
      );
    }

    const matchIds = new Set(matches.map((p) => p.id));
    this.provisions.update((list) =>
      list.map((p) =>
        matchIds.has(p.id)
          ? {
              ...p,
              startYM: lastExpense.date.slice(0, 7),
              startDate: provisionUnit(p) === 'days' ? lastExpense.date : p.startDate,
            }
          : p,
      ),
    );
  }

  async addProvision(provision: Omit<Provision, 'id' | 'adjustments'>): Promise<void> {
    // Défense en profondeur (audit BUG-013).
    if (!Number.isFinite(provision.amount) || provision.amount <= 0) {
      throw new Error(`Montant de provision invalide : ${provision.amount}. Doit être un nombre > 0.`);
    }
    if (!Number.isFinite(provision.everyN) || provision.everyN <= 0) {
      throw new Error(`Cycle invalide : ${provision.everyN}. Doit être un nombre > 0.`);
    }
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

  // Question posée par un utilisateur : "si je crée une provision pour
  // une seule fois, le reste de l'argent mis retourne-t-il dans le
  // budget ?" — vérifié : non, pas avec removeProvision() seule. Les
  // ajustements sont supprimés en cascade avec la provision (schema.sql,
  // on delete cascade), et rien ne recrédite jamais ce montant nulle
  // part — il disparaît simplement de la comptabilité, sans jamais
  // redevenir de l'argent disponible.
  //
  // closeProvision() comble ce manque : si la cagnotte est positive au
  // moment de la clôture, on crée un revenu ponctuel clairement étiqueté
  // ("Solde de provision terminée") pour ce montant, avant de supprimer
  // la provision — l'argent redevient donc réellement disponible dans le
  // budget du mois, au lieu de s'évaporer silencieusement. Un déficit
  // (cagnotte négative ou nulle) ne crée rien : il n'y a rien à rendre.
  async closeProvision(id: string): Promise<number> {
    const p = this.provisions().find((x) => x.id === id);
    if (!p) throw new Error('Provision introuvable.');
    const surplus = round2(provisionPot(p, this.current(), this.expenses()));
    if (surplus > 0.004) {
      await this.addIncome({
        amount: surplus,
        type: 'Solde de provision terminée',
        date: isoOfDate(new Date()),
        owner: p.owner,
        note: `Provision "${p.name}" terminée — solde reversé au budget`,
        recurring: false,
        recurringInterval: 'once',
        recurringStartMonth: this.current(),
      });
    }
    await this.removeProvision(id);
    return surplus > 0.004 ? surplus : 0;
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
    // Défense en profondeur (audit BUG-013) : ces méthodes restent
    // directement appelables (import, futur appel API...) même si les
    // formulaires empêchent déjà les valeurs incohérentes en pratique.
    if (
      changes.amount !== undefined &&
      (!Number.isFinite(changes.amount) || changes.amount <= 0)
    ) {
      throw new Error(`Montant de provision invalide : ${changes.amount}. Doit être un nombre > 0.`);
    }
    if (changes.everyN !== undefined && (!Number.isFinite(changes.everyN) || changes.everyN <= 0)) {
      throw new Error(`Cycle invalide : ${changes.everyN}. Doit être un nombre > 0.`);
    }
    if (
      changes.allocationPercent !== undefined &&
      (!Number.isFinite(changes.allocationPercent) ||
        changes.allocationPercent < 0 ||
        changes.allocationPercent > 100)
    ) {
      throw new Error(`Pourcentage invalide : ${changes.allocationPercent}. Doit être entre 0 et 100.`);
    }
    if (
      changes.rollingCount !== undefined &&
      (!Number.isFinite(changes.rollingCount) || changes.rollingCount < 0)
    ) {
      throw new Error(`Nombre de factures à moyenner invalide : ${changes.rollingCount}. Doit être ≥ 0.`);
    }
    if (
      changes.monthlyReminder != null &&
      (!Number.isFinite(changes.monthlyReminder) || changes.monthlyReminder < 0)
    ) {
      throw new Error(`Rappel mensuel invalide : ${changes.monthlyReminder}. Doit être ≥ 0.`);
    }

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
    if (changes.monthlyReminder !== undefined) row['monthly_reminder'] = changes.monthlyReminder;

    // Même bug que syncProvisionsFromExpense (recalage automatique),
    // mais côté modification MANUELLE de l'ancre (bouton ✏️ sur "Dernier
    // prélèvement") : déplacer la date de départ orpheline tout ajout
    // antérieur à cette nouvelle date, quel que soit le réglage de
    // recalage automatique — cette protection s'applique donc dans les
    // deux cas, pas seulement au paiement automatique. On calcule le
    // surplus AVANT la modification, avec l'ancre actuelle (this.current(),
    // le mois affiché au moment de l'édition).
    const before = this.provisions().find((p) => p.id === id);
    const movingAnchor = !!before && (changes.startYM !== undefined || changes.startDate !== undefined);
    let surplusToCarry = 0;
    if (movingAnchor) {
      const potBefore = provisionPot(before!, this.current(), this.expenses());
      if (potBefore > 0.004) surplusToCarry = round2(potBefore);
    }

    const { data, error } = await this.supabase.client
      .from('provisions')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const existing = this.provisions().find((p) => p.id === id);
    // Bug corrigé (audit BUG-012) : la reconstruction oubliait
    // versement_expense_id, donc le lien "cet ajout vient de tel
    // versement" disparaissait du state en mémoire (mais pas de la base)
    // dès qu'on modifiait N'IMPORTE QUOI sur la provision — y compris via
    // les boutons d'édition (%, date d'ancrage, recalage auto, jours du
    // cycle). Le versement pouvait alors réapparaître à tort comme "non
    // réparti", jusqu'au prochain rechargement complet.
    const updated = rowToProvision(data, existing ? existing.adjustments.map((a) => ({
      id: a.id,
      provision_id: id,
      amount: a.amount,
      date: a.date,
      note: a.note,
      versement_expense_id: a.versementExpenseId ?? null,
    })) : []);
    this.provisions.update((list) => list.map((p) => (p.id === id ? updated : p)));

    // Reporte le surplus calculé plus haut, une fois la nouvelle ancre
    // acquise — même logique que syncProvisionsFromExpense(), datée sur
    // le nouveau départ pour rester dans les bornes du nouveau cycle.
    if (surplusToCarry > 0) {
      const newAnchorDate = provisionStart(updated);
      try {
        await this.addProvisionAdjustment(id, surplusToCarry, newAnchorDate, SURPLUS_CARRY_NOTE);
      } catch (err) {
        throw new Error(
          `La date a bien été modifiée, mais le report automatique du surplus (${fmt(surplusToCarry)}) a échoué : ` +
            `${(err as Error).message ?? err}. Ajoute-le manuellement via "+$" si besoin.`,
        );
      }
    }
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

    // Utilisé pour la compensation en cas d'échec partiel : on ne
    // supprime le versement que si CET appel l'a créé — un versement déjà
    // existant (existingExpenseId fourni) n'est pas notre responsabilité.
    const createdVersementHere = !existingExpenseId;

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

    // Bug corrigé (audit BUG-010) : chaque répartition est un INSERT
    // indépendant — si l'une d'elles échoue après que d'autres ont déjà
    // réussi, l'opération restait auparavant partiellement appliquée
    // (versement créé, certaines provisions déjà réparties, d'autres
    // non, sans qu'aucun message ne le signale clairement). On garde la
    // trace de ce qui a été inséré pour tout annuler en cas d'échec —
    // équivalent applicatif d'une transaction, faute de RPC SQL dédiée.
    const inserted: { provisionId: string; adjustmentId: string }[] = [];
    try {
      for (const a of allocations) {
        if (a.amount > 0) {
          const adjustment = await this.addProvisionAdjustment(
            a.provisionId,
            a.amount,
            date,
            `Versement de ${senderLabel}`,
            versementExpenseId,
          );
          inserted.push({ provisionId: a.provisionId, adjustmentId: adjustment.id });
        }
      }
    } catch (err) {
      const rollbackErrors: string[] = [];
      for (const { provisionId, adjustmentId } of inserted) {
        try {
          await this.removeProvisionAdjustment(provisionId, adjustmentId);
        } catch (rollbackErr) {
          rollbackErrors.push((rollbackErr as Error).message ?? String(rollbackErr));
        }
      }
      if (createdVersementHere) {
        try {
          await this.removeExpense(versementExpenseId);
        } catch (rollbackErr) {
          rollbackErrors.push((rollbackErr as Error).message ?? String(rollbackErr));
        }
      }
      if (rollbackErrors.length) {
        throw new Error(
          `Échec de la répartition du versement (${(err as Error).message ?? err}), et l'annulation automatique ` +
            `n'a pas pu tout défaire (${rollbackErrors.join('; ')}). Vérifie manuellement les provisions et le ` +
            `versement dans Supabase.`,
        );
      }
      throw new Error(
        `Échec de la répartition du versement : ${(err as Error).message ?? err}. Tout a été annulé` +
          `${createdVersementHere ? ' (y compris le versement lui-même)' : ''}, tu peux réessayer.`,
      );
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
  ): Promise<ProvisionAdjustment> {
    this.assertMonthOpen(date.slice(0, 7));
    // Défense en profondeur (audit BUG-013) : c'est précisément l'exemple
    // cité dans l'audit (addProvisionAdjustment(id, -500, ...) serait
    // accepté sans cette garde).
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Montant d'ajout de provision invalide : ${amount}. Doit être un nombre > 0.`);
    }
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
    return adjustment;
  }

  // Confirme un rappel de contribution mensuelle (voir
  // monthlyContributionReminders) : ajoute le montant configuré à la
  // cagnotte, daté d'aujourd'hui, avec la note dédiée qui permet de
  // reconnaître que CE rappel précis est fait pour le mois en cours.
  async confirmMonthlyReminder(provisionId: string, amount: number): Promise<void> {
    await this.addProvisionAdjustment(
      provisionId,
      amount,
      isoOfDate(new Date()),
      MONTHLY_REMINDER_NOTE,
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
    // Chaque ligne `incomes` est désormais une vraie transaction datée —
    // qu'elle soit ponctuelle ou générée par un modèle récurrent (voir
    // RecurringIncome/syncRecurringIncomes) — donc toujours verrouillée par
    // la clôture de son mois, comme une dépense.
    this.assertMonthOpen(income.date.slice(0, 7));
    // Défense en profondeur (audit BUG-013).
    if (!Number.isFinite(income.amount) || income.amount <= 0) {
      throw new Error(`Montant de revenu invalide : ${income.amount}. Doit être un nombre > 0.`);
    }
    const { data, error } = await this.supabase.client
      .from('incomes')
      .insert(incomeToRow(income))
      .select()
      .single();
    if (error) throw error;
    this.incomes.update((list) => [...list, rowToIncome(data)]);
  }

  // Modifie une occurrence de revenu existante (ex. ajuster le montant
  // d'une paie générée automatiquement si le vrai montant diffère). Ne
  // touche jamais le modèle récurrent d'origine ni les autres occurrences.
  async updateIncome(id: string, changes: Partial<Omit<Income, 'id'>>): Promise<void> {
    const existing = this.incomes().find((i) => i.id === id);
    if (!existing) throw new Error('Revenu introuvable.');
    this.assertMonthOpen(existing.date.slice(0, 7));
    if (changes.date !== undefined) this.assertMonthOpen(changes.date.slice(0, 7));
    if (changes.amount !== undefined && (!Number.isFinite(changes.amount) || changes.amount <= 0)) {
      throw new Error(`Montant de revenu invalide : ${changes.amount}. Doit être un nombre > 0.`);
    }
    const row: Record<string, unknown> = {};
    if (changes.amount !== undefined) row['amount'] = changes.amount;
    if (changes.type !== undefined) row['type'] = changes.type;
    if (changes.date !== undefined) row['date'] = changes.date;
    if (changes.note !== undefined) row['note'] = changes.note;

    const { data, error } = await this.supabase.client
      .from('incomes')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = rowToIncome(data);
    this.incomes.update((list) => list.map((i) => (i.id === id ? updated : i)));
  }

  // Supprime UNE occurrence de revenu (ponctuelle ou générée). Si elle
  // vient d'un modèle récurrent, seule cette paie disparaît — le modèle
  // continue de générer les suivantes (pour l'arrêter, voir
  // removeRecurringIncome ci-dessous).
  async removeIncome(id: string): Promise<void> {
    const existing = this.incomes().find((i) => i.id === id);
    if (existing) this.assertMonthOpen(existing.date.slice(0, 7));
    const { error } = await this.supabase.client
      .from('incomes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.incomes.update((list) => list.filter((i) => i.id !== id));
  }

  // --- Revenus récurrents (modèles de paie) -------------------------------
  //
  // Même principe que RecurringExpense/Expense : un modèle décrit la
  // fréquence, et de vraies occurrences (Income.recurringSourceId) sont
  // générées automatiquement — voir syncRecurringIncomes(). Contrairement
  // aux dépenses récurrentes (confirmation manuelle, pour éviter les
  // doublons avec une facture qui varie), les revenus sont générés SANS
  // confirmation : le montant est ensuite modifiable via updateIncome() si
  // une paie précise diffère du modèle.

  readonly visibleRecurringIncomes = computed(() => {
    const owner = this.activeOwner();
    return owner === 'global'
      ? this.recurringIncomes()
      : this.recurringIncomes().filter((r) => r.owner === owner);
  });

  async addRecurringIncome(r: Omit<RecurringIncome, 'id'>): Promise<RecurringIncome> {
    const { data, error } = await this.supabase.client
      .from('recurring_incomes')
      .insert(recurringIncomeToRow(r))
      .select()
      .single();
    if (error) throw error;
    const created = rowToRecurringIncome(data);
    this.recurringIncomes.update((list) => [...list, created]);
    // Génère tout de suite la/les première(s) paie(s) déjà passées, sans
    // attendre le prochain chargement complet de l'app.
    await this.syncRecurringIncomes();
    return created;
  }

  async updateRecurringIncome(
    id: string,
    changes: Partial<Omit<RecurringIncome, 'id'>>,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (changes.amount !== undefined) row['amount'] = changes.amount;
    if (changes.type !== undefined) row['type'] = changes.type;
    if (changes.owner !== undefined) row['owner'] = changes.owner;
    if (changes.note !== undefined) row['note'] = changes.note;
    if (changes.dayOfMonth !== undefined) row['day_of_month'] = changes.dayOfMonth;
    if (changes.secondDayOfMonth !== undefined) row['second_day_of_month'] = changes.secondDayOfMonth;
    if (changes.active !== undefined) row['active'] = changes.active;

    const { data, error } = await this.supabase.client
      .from('recurring_incomes')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const updated = rowToRecurringIncome(data);
    this.recurringIncomes.update((list) => list.map((r) => (r.id === id ? updated : r)));
  }

  // Arrête un revenu récurrent : supprime seulement le MODÈLE, jamais les
  // paies déjà générées (elles restent des lignes `incomes` indépendantes,
  // recurring_source_id passe juste à NULL via la contrainte "on delete set
  // null" — voir migration-014). L'historique des mois passés ne change
  // donc jamais après coup, seules les prochaines paies s'arrêtent.
  async removeRecurringIncome(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('recurring_incomes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.recurringIncomes.update((list) => list.filter((r) => r.id !== id));
  }

  // Génère les paies manquantes (dont la date est déjà arrivée) pour tous
  // les modèles actifs, du mois de départ du modèle jusqu'au mois courant
  // réel — jamais dans le futur, jamais dans un mois clôturé. Correspondance
  // par COMPTE plutôt que par date exacte (même logique que
  // expectedThisMonth() pour les dépenses) : si le modèle attend K
  // occurrences ce mois-ci et que C existent déjà, seules les K-C
  // manquantes sont créées — un montant ou une date ajustés manuellement
  // via updateIncome() ne provoquent donc jamais de doublon.
  async syncRecurringIncomes(): Promise<void> {
    const todayISO = isoOfDate(new Date());
    const todayYM = todayISO.slice(0, 7);

    for (const template of this.recurringIncomes()) {
      if (!template.active) continue;
      let ym = template.startDate.slice(0, 7);
      while (ym <= todayYM) {
        if (!this.isMonthClosed(ym)) {
          const occurrences = occurrencesInMonth(template, ym).filter((d) => d <= todayISO);
          const confirmedCount = this.incomes().filter(
            (i) => i.recurringSourceId === template.id && i.date.startsWith(ym),
          ).length;
          const missing = occurrences.slice(confirmedCount);
          for (const date of missing) {
            await this.addIncome({
              amount: template.amount,
              type: template.type,
              date,
              owner: template.owner,
              note: template.note,
              recurring: true,
              recurringInterval: template.interval,
              recurringStartMonth: template.startDate.slice(0, 7),
              recurringSourceId: template.id,
            });
          }
        }
        ym = nextYM(ym);
      }
    }
  }

  // En vue Global, retire le report des DEUX profils pour ce mois (le report
  // Global affiché n'est que leur somme, jamais stocké séparément).
  async removeRollover(owner: OwnerOrGlobal, ym: string): Promise<void> {
    this.assertMonthOpen(ym);
    const owners: Owner[] = owner === 'global' ? ['moi', 'madame'] : [owner];
    const results = await Promise.all(
      owners.map((o) =>
        this.supabase.client
          .from('rollovers')
          .delete()
          .eq('owner', o)
          .eq('ym', ym),
      ),
    );
    // Bug corrigé (audit BUG-011) : les erreurs n'étaient jamais
    // vérifiées, donc le signal local pouvait supprimer le report des
    // deux profils (vue Global) même si un seul des deux DELETE avait
    // réellement réussi en base — UI et base divergeaient silencieusement.
    // On ne retire du signal que les profils dont la suppression a
    // réellement réussi.
    const succeededOwners = owners.filter((_, i) => !results[i].error);
    const failed = results.filter((r) => r.error);

    this.rollovers.update((map) => {
      const copy: MonthlyAmountMap = {
        moi: { ...map.moi },
        madame: { ...map.madame },
      };
      succeededOwners.forEach((o) => delete copy[o][ym]);
      return copy;
    });

    if (failed.length) {
      throw new Error(
        `Échec de la suppression du report pour ${failed.length} profil(s) : ${failed[0].error?.message}. ` +
          `${succeededOwners.length ? `Le report de ${succeededOwners.join(', ')} a bien été retiré.` : ''}`,
      );
    }
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
    this.recurringIncomes.set([]);
    this.budgets.set(emptyMonthlyMap());
    this.categoryBudgets.set(emptyCategoryBudgetMap());
    this.rollovers.set(emptyMonthlyMap());
    this.creditCardPayments.set([]);
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

    // Bug corrigé (audit BUG-014) : la validation ne vérifiait auparavant
    // que la PRÉSENCE des tableaux (Array.isArray), pas le contenu de
    // chaque élément — un JSON syntaxiquement valide mais avec
    // amount:"bonjour" ou date:"pas-une-date" passait ce garde-fou et
    // n'échouait qu'au moment de l'insertion en base, APRÈS que
    // resetEverything() ait déjà vidé les données existantes. On valide
    // maintenant le contenu en profondeur AVANT tout reset, pour qu'un
    // fichier invalide échoue sans avoir touché à quoi que ce soit.
    const validationErrors = validateImportPayload(data);
    if (validationErrors.length) {
      const shown = validationErrors.slice(0, 10);
      const more = validationErrors.length > shown.length ? ` (et ${validationErrors.length - shown.length} autre(s))` : '';
      throw new Error(
        `Fichier invalide, import annulé — aucune donnée n'a été touchée :\n` +
          shown.map((e) => `• ${e}`).join('\n') +
          more,
      );
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

    // Doit être inséré AVANT incomes : incomes.recurring_source_id
    // référence recurring_incomes(id).
    if (Array.isArray(data.recurringIncomes) && data.recurringIncomes.length) {
      const rows = data.recurringIncomes.map((r: RecurringIncome) => ({
        id: idFor(r.id),
        ...recurringIncomeToRow(r),
      }));
      const { error } = await this.supabase.client.from('recurring_incomes').insert(rows);
      if (error) throw error;
    }

    // Optionnel : absent des sauvegardes exportées avant l'ajout du suivi
    // de carte de crédit (migration-012).
    if (Array.isArray(data.creditCardPayments) && data.creditCardPayments.length) {
      const rows = data.creditCardPayments.map((p: CreditCardPayment) => ({
        id: idFor(p.id),
        ...creditCardPaymentToRow(p),
      }));
      const { error } = await this.supabase.client.from('credit_card_payments').insert(rows);
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

  // --- Carte de crédit (solde dû, indépendant des provisions) -------------
  //
  // Approche demandée par un utilisateur pour remplacer l'ancien système
  // (catégorie spéciale "Remboursement Carte Crédit" + case cc) : le
  // solde dû se calcule comme une dette qui s'accumule, symétrique à une
  // provision qui s'épargne — mais avec son propre modèle de données
  // (CreditCardPayment, table credit_card_payments), volontairement SANS
  // aucun lien avec Provision/ProvisionAdjustment.
  //
  // Solde = (dépenses réelles marquées "carte", jamais bornées à un seul
  // mois — une dette de carte se reporte tant qu'elle n'est pas payée)
  // moins (paiements enregistrés). Exclut aussi l'ancienne catégorie
  // "Remboursement Carte Crédit" pour ne pas mélanger l'historique de
  // l'ancien système avec le nouveau solde.
  creditCardBalance(owner: OwnerOrGlobal): number {
    const owners: Owner[] = owner === 'global' ? ['moi', 'madame'] : [owner];
    const charged = this.expenses()
      .filter(
        (e) =>
          owners.includes(e.owner) &&
          e.cc &&
          e.category !== 'Versement' &&
          e.category !== 'Remboursement Carte Crédit',
      )
      .reduce((s, e) => s + e.amount, 0);
    const paid = this.creditCardPayments()
      .filter((p) => owners.includes(p.owner))
      .reduce((s, p) => s + p.amount, 0);
    return round2(charged - paid);
  }

  async addCreditCardPayment(
    owner: Owner,
    amount: number,
    date: string,
    note: string,
  ): Promise<CreditCardPayment> {
    // Défense en profondeur (audit BUG-013).
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Montant de paiement invalide : ${amount}. Doit être un nombre > 0.`);
    }
    const { data, error } = await this.supabase.client
      .from('credit_card_payments')
      .insert(creditCardPaymentToRow({ owner, amount, date, note }))
      .select()
      .single();
    if (error) throw error;
    const payment = rowToCreditCardPayment(data);
    this.creditCardPayments.update((list) => [...list, payment]);
    return payment;
  }

  async removeCreditCardPayment(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('credit_card_payments')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.creditCardPayments.update((list) => list.filter((p) => p.id !== id));
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
      recurringIncomes: this.recurringIncomes(),
      budgets: this.budgets(),
      categoryBudgets: this.categoryBudgets(),
      rollovers: this.rollovers(),
      creditCardPayments: this.creditCardPayments(),
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
