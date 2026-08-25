import { Component, signal } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { COLOR_MAP } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';

// Carte "Mes contributions du mois" — rappel pour les provisions où
// l'utilisateur s'engage à ajouter lui-même un montant fixe chaque mois,
// séparément de tout versement reçu (ex. sa propre moitié dans un
// partage 50/50 avec le conjoint). Rien n'est jamais ajouté
// automatiquement à la cagnotte : chaque ligne demande une confirmation
// explicite, comme "Dépenses attendues ce mois-ci" pour les récurrentes.
@Component({
  selector: 'app-monthly-reminders',
  imports: [],
  templateUrl: './monthly-reminders.html',
  styleUrl: './monthly-reminders.scss',
})
export class MonthlyReminders {
  readonly confirming = signal<Set<string>>(new Set());

  constructor(public store: BudgetStore) {}

  colorFor(category: string): string {
    return COLOR_MAP[category] || '#94a3b8';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  async confirm(provisionId: string, amount: number): Promise<void> {
    this.confirming.update((set) => new Set(set).add(provisionId));
    try {
      await this.store.confirmMonthlyReminder(provisionId, amount);
    } finally {
      this.confirming.update((set) => {
        const copy = new Set(set);
        copy.delete(provisionId);
        return copy;
      });
    }
  }
}
