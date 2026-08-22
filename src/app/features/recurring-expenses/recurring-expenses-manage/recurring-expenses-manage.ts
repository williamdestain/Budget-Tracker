import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { CATEGORIES, COLOR_MAP, sortedAlpha } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';
import { RECURRING_EXPENSE_INTERVAL_LABELS } from '../../../core/utils/recurring-expense.utils';
import { Owner, RecurringExpenseInterval } from '../../../core/models/budget.models';

@Component({
  selector: 'app-recurring-expenses-manage',
  imports: [FormsModule],
  templateUrl: './recurring-expenses-manage.html',
  styleUrl: './recurring-expenses-manage.scss',
})
export class RecurringExpensesManage {
  readonly categories = sortedAlpha(CATEGORIES.filter((c) => c !== 'Revenu'));
  readonly open = signal(false);
  readonly saving = signal(false);
  readonly intervalOptions: RecurringExpenseInterval[] = ['monthly', 'weekly', 'biweekly', 'semimonthly'];
  readonly intervalLabels = RECURRING_EXPENSE_INTERVAL_LABELS;

  name = '';
  amount: number | null = null;
  category = this.categories[0];
  interval: RecurringExpenseInterval = 'monthly';
  dayOfMonth = 1;
  secondDayOfMonth = 15;
  startDate = new Date().toISOString().slice(0, 10);
  owner: Owner = 'moi';
  cc = false;

  constructor(public store: BudgetStore) {
    // Garde le profil du formulaire aligné sur l'onglet actif (Moi/Madame).
    effect(() => {
      const active = this.store.activeOwner();
      if (active === 'moi' || active === 'madame') this.owner = active;
    });
  }

  colorFor(category: string): string {
    return COLOR_MAP[category] || '#94a3b8';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  // Résumé lisible de la fréquence pour la liste des gabarits existants
  // (ex. "jour 5" pour mensuel, "5 et 20" pour 2x/mois, "à partir du
  // 2026-07-10" pour hebdo/aux 2 semaines).
  frequencySummary(r: {
    interval: RecurringExpenseInterval;
    dayOfMonth: number;
    secondDayOfMonth?: number | null;
    startDate?: string | null;
  }): string {
    switch (r.interval) {
      case 'semimonthly':
        return `jours ${r.dayOfMonth} et ${r.secondDayOfMonth ?? r.dayOfMonth}`;
      case 'weekly':
      case 'biweekly':
        return `${this.intervalLabels[r.interval]} · dès le ${r.startDate ?? '?'}`;
      case 'monthly':
      default:
        return `jour ${r.dayOfMonth}`;
    }
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
        interval: this.interval,
        dayOfMonth: this.dayOfMonth,
        secondDayOfMonth: this.interval === 'semimonthly' ? this.secondDayOfMonth : null,
        startDate:
          this.interval === 'weekly' || this.interval === 'biweekly' ? this.startDate : null,
        cc: this.cc,
        active: true,
      });
      this.name = '';
      this.amount = null;
      this.interval = 'monthly';
      this.dayOfMonth = 1;
      this.secondDayOfMonth = 15;
      this.startDate = new Date().toISOString().slice(0, 10);
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
