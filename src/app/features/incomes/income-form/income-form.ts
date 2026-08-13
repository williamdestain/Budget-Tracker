import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { Owner, RecurringInterval } from '../../../core/models/budget.models';
import { isoOfDate } from '../../../core/utils/date.utils';
import {
  INCOME_TYPE_LABELS,
  RECURRING_INTERVAL_LABELS,
} from '../../../core/utils/income.utils';

@Component({
  selector: 'app-income-form',
  imports: [FormsModule],
  templateUrl: './income-form.html',
  styleUrl: './income-form.scss',
})
export class IncomeForm {
  readonly typeOptions = Object.keys(INCOME_TYPE_LABELS);
  readonly intervalOptions = Object.entries(RECURRING_INTERVAL_LABELS).filter(
    ([key]) => key !== 'once',
  );
  readonly typeLabels = INCOME_TYPE_LABELS;

  amount: number | null = null;
  type = this.typeOptions[0];
  date = isoOfDate(new Date());
  owner: Owner = 'moi';
  note = '';
  recurring = false;
  recurringInterval: RecurringInterval = 'monthly';

  readonly saving = signal(false);

  constructor(private store: BudgetStore) {
    // Garde le profil du formulaire aligné sur l'onglet actif (Moi/Madame),
    // y compris si on change d'onglet après l'ouverture de la page — pas
    // seulement au premier chargement.
    effect(() => {
      const active = this.store.activeOwner();
      if (active === 'moi' || active === 'madame') this.owner = active;
    });
  }

  async submit(): Promise<void> {
    if (!this.amount || this.amount <= 0 || !this.date) return;
    this.saving.set(true);
    try {
      await this.store.addIncome({
        amount: this.amount,
        type: this.type,
        date: this.date,
        owner: this.owner,
        note: this.note,
        recurring: this.recurring,
        recurringInterval: this.recurring ? this.recurringInterval : 'once',
        recurringStartMonth: this.store.current(),
      });
      this.amount = null;
      this.note = '';
      this.recurring = false;
    } finally {
      this.saving.set(false);
    }
  }
}
