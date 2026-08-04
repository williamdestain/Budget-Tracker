import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { Owner } from '../../../core/models/budget.models';
import { CATEGORIES } from '../../../core/utils/categories';
import { isoOfDate } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-expense-form',
  imports: [FormsModule],
  templateUrl: './expense-form.html',
  styleUrl: './expense-form.scss',
})
export class ExpenseForm {
  readonly categories = CATEGORIES.filter((c) => c !== 'Revenu');

  amount: number | null = null;
  category = this.categories[0];
  date = isoOfDate(new Date());
  owner: Owner = 'moi';
  cc = false;

  readonly saving = signal(false);

  constructor(private store: BudgetStore) {
    const active = this.store.activeOwner();
    if (active === 'moi' || active === 'madame') this.owner = active;
  }

  async submit(): Promise<void> {
    if (!this.amount || this.amount <= 0 || !this.date) return;
    this.saving.set(true);
    try {
      await this.store.addExpense({
        amount: this.amount,
        category: this.category,
        date: this.date,
        owner: this.owner,
        cc: this.cc,
      });
      this.amount = null;
      this.cc = false;
    } finally {
      this.saving.set(false);
    }
  }
}
