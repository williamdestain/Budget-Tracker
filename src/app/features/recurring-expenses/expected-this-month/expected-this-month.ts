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
  //
  // Clé = occurrence (template.id + suggestedDate), PAS juste template.id :
  // un gabarit hebdomadaire/aux 2 semaines/2x par mois peut produire
  // plusieurs suggestions le même mois pour le même gabarit — les clefs
  // doivent rester distinctes entre elles, sinon éditer une ligne
  // écraserait l'état de l'autre.
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

  key(templateId: string, suggestedDate: string): string {
    return `${templateId}|${suggestedDate}`;
  }

  amountFor(key: string, fallback: number): number {
    return this.amounts[key] ?? fallback;
  }

  dateFor(key: string, fallback: string): string {
    return this.dates[key] ?? fallback;
  }

  ccFor(key: string): boolean {
    return this.ccs[key] ?? false;
  }

  async confirm(key: string, templateId: string, fallbackAmount: number, fallbackDate: string): Promise<void> {
    const amount = this.amountFor(key, fallbackAmount);
    const date = this.dateFor(key, fallbackDate);
    if (!(amount > 0) || !date) return;

    this.confirming.update((set) => new Set(set).add(key));
    try {
      await this.store.confirmRecurringExpense(templateId, amount, date, this.ccFor(key));
    } finally {
      this.confirming.update((set) => {
        const copy = new Set(set);
        copy.delete(key);
        return copy;
      });
      delete this.amounts[key];
      delete this.dates[key];
      delete this.ccs[key];
    }
  }
}
