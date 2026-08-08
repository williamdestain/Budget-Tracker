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
} from '../models/budget.models';
import { incomeAppliesToMonth, incomeForMonth } from '../utils/income.utils';
import { ymOf, prevYM, monthLabel, fmtDate } from '../utils/date.utils';
import { fmt } from '../utils/currency.utils';
import {
  provisionUnit,
  countedExpenses,
  CountedExpense,
  lastDayOfMonthYM,
  provisionNextHit,
  provisionDaysUntilNext,
  isHitMonth,
  provisionPot,
  effectiveProvisionAmount,
  provisionDueAlert,
  formatProvisionNextHit,
  ProvisionDueAlert,
  clampDayToMonth,
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

// Store central : équivalent de l'ancien objet `state` + `renderAll()`.
// Toute vue qui lit ces signals se met à jour automatiquement — pas besoin
// d'appeler manuellement un "render" comme dans l'ancienne app.
@Injectable({ providedIn: 'root' })
export class BudgetStore {
  readonly expenses = signal<Expense[]>([]);
  readonly incomes = signal<Income[]>([]);
  readonly provisions = signal<Provision[]>([]);
  readonly recurringExpenses = signal<RecurringExpense[]>([]);
  readonly budgets = signal<MonthlyAmountMap>(emptyMonthlyMap());
  readonly categoryBudgets = signal<CategoryBudgetMap>(emptyCategoryBudgetMap());
  readonly rollovers = signal<MonthlyAmountMap>(emptyMonthlyMap());

  readonly current = signal<string>(ymOf(new Date()));
  readonly activeOwner = signal<OwnerOrGlobal>('moi');
  readonly loading = signal(true);

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
    ] = await Promise.all([
      client.from('expenses').select('*').order('date'),
      client.from('incomes').select('*').order('date'),
      client.from('budgets').select('*'),
      client.from('category_budgets').select('*'),
      client.from('rollovers').select('*'),
      client.from('provisions').select('*'),
      client.from('provision_adjustments').select('*'),
      client.from('recurring_expenses').select('*').order('day_of_month'),
    ]);

    this.expenses.set((expensesRes.data ?? []).map(rowToExpense));
    this.incomes.set((incomesRes.data ?? []).map(rowToIncome));
    this.budgets.set(rowsToMonthlyMap(budgetsRes.data ?? []));
    this.categoryBudgets.set(rowsToCategoryBudgetMap(categoryBudgetsRes.data ?? []));
    this.rollovers.set(rowsToMonthlyMap(rolloversRes.data ?? []));
    this.recurringExpenses.set(
      (recurringExpensesRes.data ?? []).map(rowToRecurringExpense),
    );
    this.provisions.set(
      (provisionsRes.data ?? []).map((row: any) =>
        rowToProvision(row, adjustmentsRes.data ?? []),
      ),
    );
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

  // Provisions pertinentes pour le profil actif (Global = toutes).
  readonly visibleProvisions = computed(() => {
    const owner = this.activeOwner();
    return owner === 'global'
      ? this.provisions()
      : this.provisions().filter((p) => p.owner === owner);
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

  // Revenus du profil/mois affichés (+ versements reçus, sauf au Global où
  // les versements sont de simples transferts internes qui s'annulent).
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

  // Résumé budget + solde net du mois/profil affichés.
  readonly budgetSummary = computed(() => {
    const owner = this.activeOwner();
    const ym = this.current();
    const spent = this.countedExpensesList().reduce((s, e) => s + e.amount, 0);
    const budget = this.revenueBase();
    const rollover = this.rolloverFor(owner, ym);
    const versementsIn = owner === 'global' ? 0 : this.versementsRecus(owner, ym);
    return {
      spent,
      budget,
      rollover,
      versementsIn,
      soldeNet: budget - spent + rollover,
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

    const { budget, rollover } = this.budgetSummary();
    const projectedSoldeNet = budget - projectedSpend + rollover;

    return {
      dayOfMonth,
      daysInMonth,
      spentSoFar: provisionPart + variablePart,
      projectedSpend,
      projectedSoldeNet,
    };
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
      if (pct >= 100) {
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
        if (r.pct >= 100) {
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
        return { category, budget, spent, remaining: budget - spent, pct };
      })
      .filter((r) => r.budget > 0 || r.spent > 0)
      .sort((a, b) => b.spent - a.spent || b.budget - a.budget);
  });

  async setCategoryBudget(
    owner: Owner,
    ym: string,
    category: string,
    amount: number,
  ): Promise<void> {
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

  async addExpense(expense: Omit<Expense, 'id'>): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('expenses')
      .insert(expenseToRow(expense))
      .select()
      .single();
    if (error) throw error;
    const newExpense = rowToExpense(data);
    this.expenses.update((list) => [...list, newExpense]);
    await this.syncProvisionsFromExpense(newExpense);
  }

  async removeExpense(id: string): Promise<void> {
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
    await this.syncProvisionsFromExpense(updated);
  }

  readonly visibleRecurringExpenses = computed(() => {
    const owner = this.activeOwner();
    return owner === 'global'
      ? this.recurringExpenses()
      : this.recurringExpenses().filter((r) => r.owner === owner);
  });

  // "Dépenses attendues ce mois-ci" : modèles actifs qui n'ont pas encore
  // été confirmés pour le mois affiché (aucune dépense réelle liée
  // trouvée). Option B du document de roadmap : on suggère, on ne crée
  // jamais automatiquement — évite les doublons avec une saisie manuelle.
  readonly expectedThisMonth = computed(() => {
    const ym = this.current();
    const confirmedIds = new Set(
      this.expenses()
        .filter((e) => e.recurringSourceId && e.date.startsWith(ym))
        .map((e) => e.recurringSourceId),
    );
    return this.visibleRecurringExpenses()
      .filter((r) => r.active && !confirmedIds.has(r.id))
      .map((r) => ({
        template: r,
        suggestedDate: clampDayToMonth(ym, r.dayOfMonth),
      }));
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

    await Promise.all(
      matches.map((p) => {
        const updates: any = { start_ym: expense.date.slice(0, 7) };
        if (provisionUnit(p) === 'days') updates.start_date = expense.date;
        return this.supabase.client.from('provisions').update(updates).eq('id', p.id);
      }),
    );

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

  // Marque une provision comme payée : crée la dépense réelle correspondante.
  // Réutilise addExpense() tel quel (création + recalage automatique via
  // syncProvisionsFromExpense) — rien n'est dupliqué ici.
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
  ): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('provision_adjustments')
      .insert(adjustmentToRow(provisionId, { amount, date, note }))
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
    const { data, error } = await this.supabase.client
      .from('incomes')
      .insert(incomeToRow(income))
      .select()
      .single();
    if (error) throw error;
    this.incomes.update((list) => [...list, rowToIncome(data)]);
  }

  async removeIncome(id: string): Promise<void> {
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

  // Réinitialisation complète : efface tout, tous les profils, tous les mois.
  async resetEverything(): Promise<void> {
    await Promise.all([
      this.supabase.client.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      this.supabase.client.from('incomes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      this.supabase.client.from('provisions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      this.supabase.client.from('budgets').delete().neq('owner', ''),
      this.supabase.client.from('category_budgets').delete().neq('owner', ''),
      this.supabase.client.from('rollovers').delete().neq('owner', ''),
    ]);
    this.expenses.set([]);
    this.incomes.set([]);
    this.provisions.set([]);
    this.budgets.set(emptyMonthlyMap());
    this.categoryBudgets.set(emptyCategoryBudgetMap());
    this.rollovers.set(emptyMonthlyMap());
  }

  // Restaure une sauvegarde .json exportée précédemment : remplace TOUTES
  // les données actuelles. Les identifiants d'origine sont conservés pour
  // que les ajustements de provisions restent liés à la bonne provision.
  async importData(data: any): Promise<void> {
    if (
      !data ||
      !Array.isArray(data.expenses) ||
      !Array.isArray(data.incomes) ||
      !Array.isArray(data.provisions)
    ) {
      throw new Error('Format de fichier non reconnu.');
    }

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

    await this.resetEverything();

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

    await this.loadAll();
  }

  // Sauvegarde complète en .json (téléchargement local), pour archive
  // manuelle ou avant une réinitialisation.
  exportData(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      expenses: this.expenses(),
      incomes: this.incomes(),
      provisions: this.provisions(),
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
