import { Component } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmt } from '../../../core/utils/currency.utils';
import { Icon } from '../../../shared/ui/icon/icon';

@Component({
  selector: 'app-month-forecast',
  imports: [Icon],
  templateUrl: './month-forecast.html',
  styleUrl: './month-forecast.scss',
})
export class MonthForecast {
  constructor(public store: BudgetStore) {}

  fmt(n: number): string {
    return fmt(n);
  }

  get positive(): boolean {
    return (this.store.monthForecast()?.projectedSoldeNet ?? 0) >= 0;
  }
}
