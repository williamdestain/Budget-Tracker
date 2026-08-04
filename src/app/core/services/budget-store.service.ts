import { Injectable, computed, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  Expense,
  Income,
  MonthlyAmountMap,
  Owner,
  OwnerOrGlobal,
  Provision,
} from '../models/budget.models';
import { incomeAppliesToMonth, incomeForMonth } from '../utils/income.utils';
import { ymOf, prevYM, monthLabel, fmtDate } from '../utils/date.utils';
import {
  provisionUnit,
  countedExpenses,
  CountedExpense,
  lastDayOfMonthYM,
} from '../utils/provision.utils';
import {
  rowToExpense,
  expenseToRow,
  rowToIncome,
  incomeToRow,
  rowsToMonthlyMap,
  rowToProvision,
  provisionToRow,
  rowToProvisionAdjustment,
  adjustmentToRow,
} from '../utils/supabase-mappers';

function emptyMonthlyMap(): MonthlyAmountMap {
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

// Store central : équivalent de l'ancien objet `state` + `renderAll()`.
// Toute vue qui lit ces signals se met à jour automatiquement — pas besoin
// d'appeler manuellement un "render" comme dans l'ancienne app.
@Injectable({ providedIn: 'root' })
export class BudgetStore {
  readonly expenses = signal<Expense[]>([]);
  readonly incomes = signal<Income[]>([]);
  readonly provisions = signal<Provision[]>([]);
  readonly budgets = signal<MonthlyAmountMap>(emptyMonthlyMap());
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
      rolloversRes,
      provisionsRes,
      adjustmentsRes,
    ] = await Promise.all([
      client.from('expenses').select('*').order('date'),
      client.from('incomes').select('*').order('date'),
      client.from('budgets').select('*'),
      client.from('rollovers').select('*'),
      client.from('provisions').select('*'),
      client.from('provision_adjustments').select('*'),
    ]);

    this.expenses.set((expensesRes.data ?? []).map(rowToExpense));
    this.incomes.set((incomesRes.data ?? []).map(rowToIncome));
    this.budgets.set(rowsToMonthlyMap(budgetsRes.data ?? []));
    this.rollovers.set(rowsToMonthlyMap(rolloversRes.data ?? []));
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
      this.supabase.client.from('rollovers').delete().neq('owner', ''),
    ]);
    this.expenses.set([]);
    this.incomes.set([]);
    this.provisions.set([]);
    this.budgets.set(emptyMonthlyMap());
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
