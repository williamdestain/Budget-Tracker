import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { COLOR_MAP } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';

@Component({
  selector: 'app-expected-this-month',
  imports: [FormsModule],
  templateUrl: './expected-this-month.html',
  styleUrl: './expected-this-month.scss',
})
export class ExpectedThisMonth {
  readonly confirming = signal<Set<string>>(new Set());

  // Valeurs éditables par ligne avant confirmation (montant/date/cc peuvent
  // varier légèrement d'un mois à l'autre pour une facture réelle).
  amounts: Record<string, number> = {};
  dates: Record<string, string> = {};
  ccs: Record<string, boolean> = {};

  constructor(public store: BudgetStore) {}

  colorFor(category: string): string {
    return COLOR_MAP[category] || '#94a3b8';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  amountFor(id: string, fallback: number): number {
    return this.amounts[id] ?? fallback;
  }

  dateFor(id: string, fallback: string): string {
    return this.dates[id] ?? fallback;
  }

  ccFor(id: string): boolean {
    return this.ccs[id] ?? false;
  }

  async confirm(templateId: string, fallbackAmount: number, fallbackDate: string): Promise<void> {
    const amount = this.amountFor(templateId, fallbackAmount);
    const date = this.dateFor(templateId, fallbackDate);
    if (!(amount > 0) || !date) return;

    this.confirming.update((set) => new Set(set).add(templateId));
    try {
      await this.store.confirmRecurringExpense(templateId, amount, date, this.ccFor(templateId));
    } finally {
      this.confirming.update((set) => {
        const copy = new Set(set);
        copy.delete(templateId);
        return copy;
      });
      delete this.amounts[templateId];
      delete this.dates[templateId];
      delete this.ccs[templateId];
    }
  }
}
