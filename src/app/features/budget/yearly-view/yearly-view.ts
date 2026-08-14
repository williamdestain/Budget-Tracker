import { Component, signal } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmt } from '../../../core/utils/currency.utils';

@Component({
  selector: 'app-yearly-view',
  imports: [],
  templateUrl: './yearly-view.html',
  styleUrl: './yearly-view.scss',
})
export class YearlyView {
  readonly open = signal(false);

  constructor(public store: BudgetStore) {}

  fmt(n: number): string {
    return fmt(n);
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  prevYear(): void {
    this.store.yearlyYear.update((y) => y - 1);
  }

  nextYear(): void {
    this.store.yearlyYear.update((y) => y + 1);
  }
}
