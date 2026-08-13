import { Component } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmtDate } from '../../../core/utils/date.utils';
import { fmt } from '../../../core/utils/currency.utils';
import {
  INCOME_TYPE_LABELS,
  RECURRING_INTERVAL_LABELS,
} from '../../../core/utils/income.utils';
import { Owner } from '../../../core/models/budget.models';

@Component({
  selector: 'app-income-list',
  imports: [],
  templateUrl: './income-list.html',
  styleUrl: './income-list.scss',
})
export class IncomeList {
  constructor(public store: BudgetStore) {}

  typeLabel(type: string): string {
    return INCOME_TYPE_LABELS[type] || type;
  }

  intervalLabel(interval: string): string {
    return RECURRING_INTERVAL_LABELS[interval] || interval;
  }

  ownerBadge(owner: Owner): string {
    return owner === 'moi' ? 'Moi' : 'Mme';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }

  remove(id: string): void {
    this.store.removeIncome(id);
  }
}
