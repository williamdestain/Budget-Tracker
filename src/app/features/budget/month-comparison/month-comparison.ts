import { Component } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmt } from '../../../core/utils/currency.utils';
import { COLOR_MAP } from '../../../core/utils/categories';

@Component({
  selector: 'app-month-comparison',
  imports: [],
  templateUrl: './month-comparison.html',
  styleUrl: './month-comparison.scss',
})
export class MonthComparison {
  constructor(public store: BudgetStore) {}

  fmt(n: number): string {
    return fmt(n);
  }

  colorFor(category: string): string {
    return COLOR_MAP[category] || '#94a3b8';
  }

  // Signe + couleur d'une variation : plus dépensé = rouge (mauvaise
  // nouvelle), moins dépensé = vert (bonne nouvelle) — peu importe la
  // catégorie, dépenser plus n'est jamais présenté comme positif ici.
  deltaText(delta: number): string {
    return (delta > 0 ? '+' : delta < 0 ? '−' : '') + fmt(Math.abs(delta));
  }
}
