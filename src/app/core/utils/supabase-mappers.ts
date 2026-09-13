import {
  Expense,
  Income,
  MonthlyAmountMap,
  CategoryBudgetMap,
  Owner,
  Provision,
  ProvisionAdjustment,
  RecurringExpense,
  RecurringIncome,
  Category,
  SavingsGoal,
  SavingsContribution,
  CreditCardPayment,
  Account,
  AccountBalanceSnapshot,
} from '../models/budget.models';

const rowMemberId = (row: any): string => row.member_id ?? row.owner;

function memberColumn(value: { memberId?: string; owner?: string }, useMemberSchema: boolean): any {
  return useMemberSchema
    ? { member_id: value.memberId ?? value.owner }
    : { owner: value.owner ?? value.memberId };
}

export function rowToAccount(row: any): Account {
  return {
    id: row.id,
    memberId: row.member_id ?? null,
    name: row.name,
    institution: row.institution ?? null,
    type: row.type,
    archived: row.archived,
  };
}

export function accountToRow(account: Omit<Account, 'id'>): any {
  return {
    member_id: account.memberId,
    name: account.name,
    institution: account.institution,
    type: account.type,
    archived: account.archived,
  };
}

export function rowToAccountBalanceSnapshot(row: any): AccountBalanceSnapshot {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    balance: Number(row.balance),
    note: row.note ?? null,
  };
}

export function rowToExpense(row: any): Expense {
  const memberId = rowMemberId(row);
  return {
    id: row.id,
    amount: Number(row.amount),
    category: row.category,
    date: row.date,
    owner: memberId,
    memberId,
    cc: row.cc,
    recurringSourceId: row.recurring_source_id ?? null,
    versementToMemberId: row.versement_to_member_id ?? null,
  };
}

export function expenseToRow(e: Omit<Expense, 'id'> | Expense, useMemberSchema = false): any {
  return {
    amount: e.amount,
    category: e.category,
    date: e.date,
    ...memberColumn(e, useMemberSchema),
    cc: e.cc,
    recurring_source_id: e.recurringSourceId ?? null,
    ...(useMemberSchema ? { versement_to_member_id: e.versementToMemberId ?? null } : {}),
  };
}

export function rowToRecurringExpense(row: any): RecurringExpense {
  const memberId = rowMemberId(row);
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    category: row.category,
    owner: memberId,
    memberId,
    // Rétrocompatibilité : les lignes créées avant la migration-009
    // n'ont pas encore cette colonne — 'monthly' préserve leur
    // comportement d'origine à l'identique.
    interval: row.interval ?? 'monthly',
    dayOfMonth: row.day_of_month,
    secondDayOfMonth: row.second_day_of_month ?? null,
    startDate: row.start_date ?? null,
    cc: row.cc,
    active: row.active,
  };
}

export function recurringExpenseToRow(
  r: Omit<RecurringExpense, 'id'> | RecurringExpense,
  useMemberSchema = false,
): any {
  return {
    name: r.name,
    amount: r.amount,
    category: r.category,
    ...memberColumn(r, useMemberSchema),
    interval: r.interval,
    day_of_month: r.dayOfMonth,
    second_day_of_month: r.secondDayOfMonth ?? null,
    start_date: r.startDate ?? null,
    cc: r.cc,
    active: r.active,
  };
}

export function rowToIncome(row: any): Income {
  const memberId = rowMemberId(row);
  return {
    id: row.id,
    amount: Number(row.amount),
    type: row.type,
    date: row.date,
    owner: memberId,
    memberId,
    note: row.note ?? '',
    recurring: row.recurring,
    recurringInterval: row.recurring_interval,
    recurringStartMonth: row.recurring_start_month,
    recurringSourceId: row.recurring_source_id ?? null,
  };
}

export function incomeToRow(i: Omit<Income, 'id'> | Income, useMemberSchema = false): any {
  return {
    amount: i.amount,
    type: i.type,
    date: i.date,
    ...memberColumn(i, useMemberSchema),
    note: i.note,
    recurring: i.recurring,
    recurring_interval: i.recurringInterval,
    recurring_start_month: i.recurringStartMonth,
    recurring_source_id: i.recurringSourceId ?? null,
  };
}

export function rowToCategory(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archived: row.archived,
    sortOrder: row.sort_order,
  };
}

export function categoryToRow(c: Omit<Category, 'id'> | Category): any {
  return {
    name: c.name,
    color: c.color,
    archived: c.archived,
    sort_order: c.sortOrder,
  };
}

export function rowToRecurringIncome(row: any): RecurringIncome {
  const memberId = rowMemberId(row);
  return {
    id: row.id,
    amount: Number(row.amount),
    type: row.type,
    owner: memberId,
    memberId,
    note: row.note ?? '',
    interval: row.interval,
    dayOfMonth: row.day_of_month,
    secondDayOfMonth: row.second_day_of_month ?? null,
    startDate: row.start_date,
    active: row.active,
  };
}

export function recurringIncomeToRow(
  r: Omit<RecurringIncome, 'id'> | RecurringIncome,
  useMemberSchema = false,
): any {
  return {
    amount: r.amount,
    type: r.type,
    ...memberColumn(r, useMemberSchema),
    note: r.note,
    interval: r.interval,
    day_of_month: r.dayOfMonth,
    second_day_of_month: r.secondDayOfMonth ?? null,
    start_date: r.startDate,
    active: r.active,
  };
}

// { owner, ym, amount }[] -> { moi: { ym: amount }, madame: { ym: amount } }
export function rowsToMonthlyMap(rows: any[]): MonthlyAmountMap {
  const map: MonthlyAmountMap = { moi: {}, madame: {} };
  rows.forEach((row) => {
    const memberId = rowMemberId(row);
    if (!memberId) return;
    if (!map[memberId]) map[memberId] = {};
    map[memberId][row.ym] = Number(row.amount);
  });
  return map;
}

// { owner, ym, category, amount }[] -> { owner: { ym: { category: amount } } }
export function rowsToCategoryBudgetMap(rows: any[]): CategoryBudgetMap {
  const map: CategoryBudgetMap = { moi: {}, madame: {} };
  rows.forEach((row) => {
    const memberId = rowMemberId(row);
    if (!memberId) return;
    if (!map[memberId]) map[memberId] = {};
    if (!map[memberId][row.ym]) map[memberId][row.ym] = {};
    map[memberId][row.ym][row.category] = Number(row.amount);
  });
  return map;
}

export function rowToProvisionAdjustment(row: any): ProvisionAdjustment {
  return {
    id: row.id,
    amount: Number(row.amount),
    date: row.date,
    note: row.note ?? '',
    versementExpenseId: row.versement_expense_id ?? undefined,
  };
}

export function rowToCreditCardPayment(row: any): CreditCardPayment {
  const memberId = rowMemberId(row);
  return {
    id: row.id,
    owner: memberId,
    memberId,
    amount: Number(row.amount),
    date: row.date,
    note: row.note ?? '',
  };
}

export function creditCardPaymentToRow(
  p: Omit<CreditCardPayment, 'id'>,
  useMemberSchema = false,
): any {
  return {
    ...memberColumn(p, useMemberSchema),
    amount: p.amount,
    date: p.date,
    note: p.note,
  };
}

export function adjustmentToRow(
  provisionId: string,
  a: Omit<ProvisionAdjustment, 'id'>,
): any {
  return {
    provision_id: provisionId,
    amount: a.amount,
    date: a.date,
    note: a.note,
    versement_expense_id: a.versementExpenseId ?? null,
  };
}

// Une provision est reconstituée à partir de sa ligne `provisions` et de ses
// lignes `provision_adjustments` associées (jointes séparément).
export function rowToProvision(row: any, adjustmentRows: any[]): Provision {
  const memberId = rowMemberId(row);
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    everyN: row.every_n,
    intervalUnit: row.interval_unit,
    startYM: row.start_ym ?? '',
    startDate: row.start_date ?? '',
    category: row.category,
    owner: memberId,
    memberId,
    autoRecalibrate: row.auto_recalibrate,
    allocationPercent: Number(row.allocation_percent ?? 0),
    rollingCount: row.rolling_count,
    // Rétrocompatibilité : colonne absente sur les lignes créées avant
    // la migration-011.
    monthlyReminder: row.monthly_reminder != null ? Number(row.monthly_reminder) : null,
    adjustments: adjustmentRows
      .filter((a) => a.provision_id === row.id)
      .map(rowToProvisionAdjustment),
  };
}

export function provisionToRow(
  p: Omit<Provision, 'id' | 'adjustments'>,
  useMemberSchema = false,
): any {
  return {
    name: p.name,
    amount: p.amount,
    every_n: p.everyN,
    interval_unit: p.intervalUnit,
    start_ym: p.startYM || null,
    start_date: p.startDate || null,
    category: p.category,
    ...memberColumn(p, useMemberSchema),
    auto_recalibrate: p.autoRecalibrate,
    allocation_percent: p.allocationPercent,
    rolling_count: p.rollingCount,
    monthly_reminder: p.monthlyReminder ?? null,
  };
}

export function rowToSavingsContribution(row: any): SavingsContribution {
  return {
    id: row.id,
    amount: Number(row.amount),
    date: row.date,
    note: row.note ?? '',
  };
}

export function savingsContributionToRow(
  goalId: string,
  c: Omit<SavingsContribution, 'id'>,
): any {
  return {
    savings_goal_id: goalId,
    amount: c.amount,
    date: c.date,
    note: c.note,
  };
}

// Un objectif d'épargne est reconstitué à partir de sa ligne `savings_goals`
// et de ses lignes `savings_goal_contributions` associées (jointes
// séparément), comme les provisions et leurs ajustements.
export function rowToSavingsGoal(row: any, contributionRows: any[]): SavingsGoal {
  const memberId = rowMemberId(row);
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    targetDate: row.target_date ?? null,
    owner: memberId,
    memberId,
    contributions: contributionRows
      .filter((c) => c.savings_goal_id === row.id)
      .map(rowToSavingsContribution),
  };
}

export function savingsGoalToRow(
  g: Omit<SavingsGoal, 'id' | 'contributions'>,
  useMemberSchema = false,
): any {
  return {
    name: g.name,
    target_amount: g.targetAmount,
    target_date: g.targetDate || null,
    ...memberColumn(g, useMemberSchema),
  };
}
