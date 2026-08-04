import { Component, signal } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { monthLabel } from '../../../core/utils/date.utils';
import { fmt } from '../../../core/utils/currency.utils';

@Component({
  selector: 'app-income-bar',
  imports: [],
  templateUrl: './income-bar.html',
  styleUrl: './income-bar.scss',
})
export class IncomeBar {
  readonly open = signal(false);

  constructor(public store: BudgetStore) {}

  get monthLabel(): string {
    return monthLabel(this.store.current());
  }

  fmt(n: number): string {
    return fmt(n);
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  removeRollover(): void {
    this.store.removeRollover(this.store.activeOwner(), this.store.current());
  }
}
