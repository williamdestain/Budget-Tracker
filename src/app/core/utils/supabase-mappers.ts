import {
  Expense,
  Income,
  MonthlyAmountMap,
  CategoryBudgetMap,
  Owner,
  Provision,
  ProvisionAdjustment,
  RecurringExpense,
} from '../models/budget.models';

export function rowToExpense(row: any): Expense {
  return {
    id: row.id,
    amount: Number(row.amount),
    category: row.category,
    date: row.date,
    owner: row.owner,
    cc: row.cc,
    recurringSourceId: row.recurring_source_id ?? null,
  };
}

export function expenseToRow(e: Omit<Expense, 'id'> | Expense): any {
  return {
    amount: e.amount,
    category: e.category,
    date: e.date,
    owner: e.owner,
    cc: e.cc,
    recurring_source_id: e.recurringSourceId ?? null,
  };
}

export function rowToRecurringExpense(row: any): RecurringExpense {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    category: row.category,
    owner: row.owner,
    dayOfMonth: row.day_of_month,
    cc: row.cc,
    active: row.active,
  };
}

export function recurringExpenseToRow(
  r: Omit<RecurringExpense, 'id'> | RecurringExpense,
): any {
  return {
    name: r.name,
    amount: r.amount,
    category: r.category,
    owner: r.owner,
    day_of_month: r.dayOfMonth,
    cc: r.cc,
    active: r.active,
  };
}

export function rowToIncome(row: any): Income {
  return {
    id: row.id,
    amount: Number(row.amount),
    type: row.type,
    date: row.date,
    owner: row.owner,
    note: row.note ?? '',
    recurring: row.recurring,
    recurringInterval: row.recurring_interval,
    recurringStartMonth: row.recurring_start_month,
  };
}

export function incomeToRow(i: Omit<Income, 'id'> | Income): any {
  return {
    amount: i.amount,
    type: i.type,
    date: i.date,
    owner: i.owner,
    note: i.note,
    recurring: i.recurring,
    recurring_interval: i.recurringInterval,
    recurring_start_month: i.recurringStartMonth,
  };
}

// { owner, ym, amount }[] -> { moi: { ym: amount }, madame: { ym: amount } }
export function rowsToMonthlyMap(rows: any[]): MonthlyAmountMap {
  const map: MonthlyAmountMap = { moi: {}, madame: {} };
  rows.forEach((row) => {
    const owner = row.owner as Owner;
    map[owner][row.ym] = Number(row.amount);
  });
  return map;
}

// { owner, ym, category, amount }[] -> { owner: { ym: { category: amount } } }
export function rowsToCategoryBudgetMap(rows: any[]): CategoryBudgetMap {
  const map: CategoryBudgetMap = { moi: {}, madame: {} };
  rows.forEach((row) => {
    const owner = row.owner as Owner;
    if (!map[owner][row.ym]) map[owner][row.ym] = {};
    map[owner][row.ym][row.category] = Number(row.amount);
  });
  return map;
}

export function rowToProvisionAdjustment(row: any): ProvisionAdjustment {
  return {
    id: row.id,
    amount: Number(row.amount),
    date: row.date,
    note: row.note ?? '',
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
  };
}

// Une provision est reconstituée à partir de sa ligne `provisions` et de ses
// lignes `provision_adjustments` associées (jointes séparément).
export function rowToProvision(row: any, adjustmentRows: any[]): Provision {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    everyN: row.every_n,
    intervalUnit: row.interval_unit,
    startYM: row.start_ym ?? '',
    startDate: row.start_date ?? '',
    category: row.category,
    owner: row.owner,
    autoRecalibrate: row.auto_recalibrate,
    rollingCount: row.rolling_count,
    adjustments: adjustmentRows
      .filter((a) => a.provision_id === row.id)
      .map(rowToProvisionAdjustment),
  };
}

export function provisionToRow(p: Omit<Provision, 'id' | 'adjustments'>): any {
  return {
    name: p.name,
    amount: p.amount,
    every_n: p.everyN,
    interval_unit: p.intervalUnit,
    start_ym: p.startYM || null,
    start_date: p.startDate || null,
    category: p.category,
    owner: p.owner,
    auto_recalibrate: p.autoRecalibrate,
    rolling_count: p.rollingCount,
  };
}
