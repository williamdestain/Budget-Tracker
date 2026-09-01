import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { fmtDate } from '../../../core/utils/date.utils';
import { fmt } from '../../../core/utils/currency.utils';
import {
  INCOME_TYPE_LABELS,
  RECURRING_INTERVAL_LABELS,
} from '../../../core/utils/income.utils';
import { Owner } from '../../../core/models/budget.models';

@Component({
  selector: 'app-income-list',
  imports: [FormsModule],
  templateUrl: './income-list.html',
  styleUrl: './income-list.scss',
})
export class IncomeList {
  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  // Ligne de revenu actuellement en édition (montant modifiable) — utile
  // pour corriger une paie générée automatiquement dont le vrai montant
  // diffère du modèle récurrent, sans toucher au modèle lui-même.
  readonly editingId = signal<string | null>(null);
  editAmount: number | null = null;

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

  startEdit(id: string, currentAmount: number): void {
    this.editingId.set(id);
    this.editAmount = currentAmount;
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editAmount = null;
  }

  async saveEdit(id: string): Promise<void> {
    if (!this.editAmount || this.editAmount <= 0) return;
    try {
      await this.store.updateIncome(id, { amount: this.editAmount });
      this.cancelEdit();
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.store.removeIncome(id);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  }

  // Arrête un revenu récurrent : ne supprime QUE le modèle — les paies déjà
  // générées restent intactes dans l'historique de chaque mois.
  async stopRecurring(id: string, type: string): Promise<void> {
    if (!confirm(`Arrêter "${this.typeLabel(type)}" ? Les paies déjà reçues restent dans l'historique — seules les prochaines s'arrêtent.`)) {
      return;
    }
    try {
      await this.store.removeRecurringIncome(id);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  }
}
