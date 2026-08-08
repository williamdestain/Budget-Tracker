import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { CATEGORIES, COLOR_MAP } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';
import { Owner } from '../../../core/models/budget.models';

@Component({
  selector: 'app-recurring-expenses-manage',
  imports: [FormsModule],
  templateUrl: './recurring-expenses-manage.html',
  styleUrl: './recurring-expenses-manage.scss',
})
export class RecurringExpensesManage {
  readonly categories = CATEGORIES.filter((c) => c !== 'Revenu');
  readonly open = signal(false);
  readonly saving = signal(false);

  name = '';
  amount: number | null = null;
  category = this.categories[0];
  dayOfMonth = 1;
  owner: Owner = 'moi';
  cc = false;

  constructor(public store: BudgetStore) {}

  colorFor(category: string): string {
    return COLOR_MAP[category] || '#94a3b8';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  async submit(): Promise<void> {
    if (!this.name.trim() || !this.amount || this.amount <= 0) return;
    this.saving.set(true);
    try {
      await this.store.addRecurringExpense({
        name: this.name.trim(),
        amount: this.amount,
        category: this.category,
        owner: this.owner,
        dayOfMonth: this.dayOfMonth,
        cc: this.cc,
        active: true,
      });
      this.name = '';
      this.amount = null;
      this.dayOfMonth = 1;
      this.cc = false;
      this.open.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  toggleActive(id: string, active: boolean): void {
    this.store.updateRecurringExpense(id, { active: !active });
  }

  remove(id: string): void {
    this.store.removeRecurringExpense(id);
  }
}
