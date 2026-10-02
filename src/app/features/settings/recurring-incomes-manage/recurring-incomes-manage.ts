import { Component, signal } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { RecurringIncome } from '../../../core/models/budget.models';
import { fmt } from '../../../core/utils/currency.utils';
import { INCOME_TYPE_LABELS, RECURRING_INTERVAL_LABELS } from '../../../core/utils/income.utils';
import { Button } from '../../../shared/ui/button/button';

// Liste des modèles de revenus récurrents (salaire, allocations…), avec leur
// arrêt. Les créer se fait depuis « Ajouter » → Revenu → récurrent ; les
// modifier = les arrêter puis en recréer un.
//
// « Arrêter » ne supprime QUE le modèle : les paies déjà reçues restent dans
// l'historique, seules les suivantes cessent. Remplace le window.confirm de
// l'ancienne IncomeList par la confirmation en deux temps du reste de l'appli.
// Même périmètre que cette ancienne liste : le profil actif (tout en vue Global).
@Component({
  selector: 'app-recurring-incomes-manage',
  imports: [Button],
  templateUrl: './recurring-incomes-manage.html',
  styleUrl: './recurring-incomes-manage.scss',
})
export class RecurringIncomesManage {
  readonly confirmId = signal<string | null>(null);

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  fmt(n: number): string {
    return fmt(n);
  }

  typeLabel(type: string): string {
    return INCOME_TYPE_LABELS[type] || type;
  }

  intervalLabel(interval: string): string {
    return RECURRING_INTERVAL_LABELS[interval] || interval;
  }

  async stop(income: RecurringIncome): Promise<void> {
    if (this.confirmId() !== income.id) {
      this.confirmId.set(income.id);
      return;
    }
    try {
      await this.store.removeRecurringIncome(income.id);
      this.toast.show('Revenu récurrent arrêté.');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.confirmId.set(null);
    }
  }
}
