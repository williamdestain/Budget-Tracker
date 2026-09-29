import { describe, expect, it } from 'vitest';
import {
  accountToRow,
  adjustmentToRow,
  categoryToRow,
  creditCardPaymentToRow,
  expenseToRow,
  incomeToRow,
  provisionToRow,
  recurringExpenseToRow,
  recurringIncomeToRow,
  rowToAccount,
  rowToAccountBalanceSnapshot,
  rowToCategory,
  rowToCreditCardPayment,
  rowToExpense,
  rowToIncome,
  rowToProvision,
  rowToRecurringExpense,
  rowToRecurringIncome,
  rowToSavingsGoal,
  rowsToCategoryBudgetMap,
  rowsToMonthlyMap,
  savingsContributionToRow,
  savingsGoalToRow,
} from './supabase-mappers';

describe('supabase-mappers', () => {
  it('mappe un compte et un snapshot de solde', () => {
    expect(
      rowToAccount({
        id: 'a1',
        member_id: null,
        name: 'Chèque',
        institution: null,
        type: 'bank',
        archived: false,
      }),
    ).toEqual({
      id: 'a1',
      memberId: null,
      name: 'Chèque',
      institution: null,
      type: 'bank',
      archived: false,
    });
    expect(
      accountToRow({
        memberId: 'moi',
        name: 'Chèque',
        institution: 'Desjardins',
        type: 'bank',
        archived: false,
      }),
    ).toMatchObject({ member_id: 'moi', institution: 'Desjardins' });
    expect(
      rowToAccountBalanceSnapshot({
        id: 's1',
        account_id: 'a1',
        date: '2026-09-01',
        balance: '12.5',
        note: null,
      }),
    ).toEqual({
      id: 's1',
      accountId: 'a1',
      date: '2026-09-01',
      balance: 12.5,
      note: null,
    });
  });

  it('mappe dépenses et revenus depuis member_id (colonne SQL) vers memberId', () => {
    const expense = rowToExpense({
      id: 'e1',
      amount: '10',
      category: 'Courses',
      date: '2026-09-02',
      member_id: 'moi',
      cc: true,
      recurring_source_id: null,
      versement_to_member_id: 'madame',
    });
    expect(expense.memberId).toBe('moi');
    expect(expense.versementToMemberId).toBe('madame');
    // Écriture en sens inverse : memberId (TS) -> member_id (colonne SQL),
    // sans aucun repli — `owner` n'existe plus comme champ séparé depuis le
    // nettoyage owner/memberId (voir MODELE.md §9.5.2).
    expect(expenseToRow({ ...expense, memberId: 'madame' }).member_id).toBe('madame');

    const income = rowToIncome({
      id: 'i1',
      amount: '2000',
      type: 'Salaire',
      date: '2026-09-01',
      member_id: 'moi',
      note: null,
      recurring: false,
      recurring_interval: 'once',
      recurring_start_month: '2026-09',
      recurring_source_id: null,
    });
    expect(income.note).toBe('');
    expect(incomeToRow(income).note).toBe('');
  });

  it('préserve l’intervalle monthly par défaut sur une dépense récurrente ancienne', () => {
    const rec = rowToRecurringExpense({
      id: 'r1',
      name: 'Loyer',
      amount: '900',
      category: 'Logement',
      member_id: 'moi',
      day_of_month: 1,
      second_day_of_month: null,
      start_date: null,
      cc: false,
      active: true,
    });
    expect(rec.interval).toBe('monthly');
    expect(recurringExpenseToRow(rec).interval).toBe('monthly');
  });

  it('mappe catégories, revenus récurrents et paiements de carte', () => {
    expect(
      rowToCategory({ id: 'c1', name: 'Courses', color: '#000', archived: false, sort_order: 2 }),
    ).toEqual({ id: 'c1', name: 'Courses', color: '#000', archived: false, sortOrder: 2 });
    expect(categoryToRow({ name: 'Courses', color: '#000', archived: false, sortOrder: 2 })).toEqual({
      name: 'Courses',
      color: '#000',
      archived: false,
      sort_order: 2,
    });

    const ri = rowToRecurringIncome({
      id: 'ri1',
      amount: '1000',
      type: 'Salaire',
      member_id: 'moi',
      note: null,
      interval: 'monthly',
      day_of_month: 1,
      second_day_of_month: null,
      start_date: '2026-01-01',
      active: true,
    });
    expect(ri.note).toBe('');
    expect(recurringIncomeToRow(ri).day_of_month).toBe(1);

    const pay = rowToCreditCardPayment({
      id: 'p1',
      member_id: 'moi',
      amount: '50',
      date: '2026-09-10',
      note: null,
    });
    expect(pay.amount).toBe(50);
    expect(creditCardPaymentToRow({ memberId: 'moi', amount: 50, date: '2026-09-10', note: '' })).toEqual(
      { member_id: 'moi', amount: 50, date: '2026-09-10', note: '' },
    );
  });

  it('agrège les maps mensuelles et ignore les lignes sans membre', () => {
    expect(
      rowsToMonthlyMap([
        { member_id: 'moi', ym: '2026-09', amount: '10' },
        { member_id: null, ym: '2026-09', amount: '99' },
        { member_id: 'alex', ym: '2026-09', amount: '5' },
      ]),
    ).toEqual({ moi: { '2026-09': 10 }, alex: { '2026-09': 5 } });

    expect(
      rowsToCategoryBudgetMap([
        { member_id: 'moi', ym: '2026-09', category: 'Courses', amount: '100' },
        { member_id: null, ym: '2026-09', category: 'X', amount: '1' },
      ]),
    ).toEqual({ moi: { '2026-09': { Courses: 100 } } });
  });

  it('reconstitue provisions et objectifs avec leurs lignes liées', () => {
    const provision = rowToProvision(
      {
        id: 'prov1',
        name: 'Taxes',
        amount: '1200',
        every_n: 12,
        interval_unit: 'months',
        start_ym: '2026-01',
        start_date: '',
        category: 'Taxes',
        member_id: 'moi',
        auto_recalibrate: true,
        allocation_percent: '0',
        rolling_count: 0,
        monthly_reminder: null,
      },
      [
        {
          id: 'adj1',
          provision_id: 'prov1',
          amount: '10',
          date: '2026-09-01',
          note: null,
          versement_expense_id: null,
        },
        { id: 'adj2', provision_id: 'other', amount: '99', date: '2026-09-01', note: '' },
      ],
    );
    expect(provision.adjustments).toHaveLength(1);
    expect(provision.monthlyReminder).toBeNull();
    expect(provisionToRow(provision).start_ym).toBe('2026-01');
    expect(adjustmentToRow('prov1', { amount: 10, date: '2026-09-01', note: '' })).toMatchObject({
      provision_id: 'prov1',
      versement_expense_id: null,
    });

    const goal = rowToSavingsGoal(
      {
        id: 'g1',
        name: 'Urgence',
        target_amount: '1000',
        target_date: null,
        member_id: 'moi',
      },
      [
        { id: 'c1', savings_goal_id: 'g1', amount: '100', date: '2026-09-01', note: null },
        { id: 'c2', savings_goal_id: 'other', amount: '1', date: '2026-09-01', note: '' },
      ],
    );
    expect(goal.contributions).toHaveLength(1);
    expect(savingsGoalToRow(goal).target_date).toBeNull();
    expect(savingsContributionToRow('g1', { amount: 100, date: '2026-09-01', note: '' })).toEqual({
      savings_goal_id: 'g1',
      amount: 100,
      date: '2026-09-01',
      note: '',
    });
  });
});
