import { Component, signal } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmt } from '../../../core/utils/currency.utils';

@Component({
  selector: 'app-month-comparison',
  imports: [],
  templateUrl: './month-comparison.html',
  styleUrl: './month-comparison.scss',
})
export class MonthComparison {
  readonly open = signal(false);

  constructor(public store: BudgetStore) {}

  toggle(): void {
    this.open.update((v) => !v);
  }

  fmt(n: number): string {
    return fmt(n);
  }

  colorFor(category: string): string {
    return this.store.colorFor(category);
  }

  // Signe + couleur d'une variation : plus dépensé = rouge (mauvaise
  // nouvelle), moins dépensé = vert (bonne nouvelle) — peu importe la
  // catégorie, dépenser plus n'est jamais présenté comme positif ici.
  deltaText(delta: number): string {
    return (delta > 0 ? '+' : delta < 0 ? '−' : '') + fmt(Math.abs(delta));
  }
}
