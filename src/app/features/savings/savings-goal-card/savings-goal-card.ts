import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { SavingsGoal } from '../../../core/models/budget.models';
import { fmt } from '../../../core/utils/currency.utils';
import { fmtDate, isoOfDate } from '../../../core/utils/date.utils';
import { goalPot, goalProgressPct, goalReached, goalDaysLeft } from '../../../core/utils/savings.utils';

@Component({
  selector: 'app-savings-goal-card',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './savings-goal-card.html',
  styleUrl: './savings-goal-card.scss',
})
export class SavingsGoalCard {
  goal = input.required<SavingsGoal>();

  readonly addOpen = signal(false);
  readonly saving = signal(false);

  addAmount: number | null = null;
  addDate = isoOfDate(new Date());
  addNote = '';

  constructor(public store: BudgetStore) {}

  readonly stats = computed(() => {
    const g = this.goal();
    const pot = goalPot(g);
    const pct = goalProgressPct(g);
    const reached = goalReached(g);
    const daysLeft = goalDaysLeft(g);
    const remaining = Math.max(g.targetAmount - pot, 0);

    let statusText: string;
    let statusClass: 'ok' | 'warn' | 'overdue';
    if (reached) {
      statusText = '🎉 Objectif atteint';
      statusClass = 'ok';
    } else if (daysLeft !== null && daysLeft < 0) {
      statusText = `⚠️ Date cible dépassée — il manque ${fmt(remaining)}`;
      statusClass = 'overdue';
    } else if (daysLeft !== null && daysLeft <= 30) {
      statusText = `Dans ${daysLeft} j — il manque ${fmt(remaining)}`;
      statusClass = 'warn';
    } else {
      statusText = `Il manque ${fmt(remaining)}`;
      statusClass = 'warn';
    }

    const contributions = [...g.contributions].sort(
      (a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)),
    );

    return { pot, pct, reached, daysLeft, remaining, statusText, statusClass, contributions };
  });

  fmt(n: number): string {
    return fmt(n);
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }

  barWidth(): number {
    return Math.max(this.stats().pct, 2);
  }

  toggleAdd(): void {
    this.addOpen.update((v) => !v);
  }

  async submitAdd(): Promise<void> {
    if (!this.addAmount || this.addAmount <= 0 || !this.addDate) return;
    this.saving.set(true);
    try {
      await this.store.addSavingsGoalContribution(
        this.goal().id,
        this.addAmount,
        this.addDate,
        this.addNote,
      );
      this.addOpen.set(false);
      this.addAmount = null;
      this.addNote = '';
    } finally {
      this.saving.set(false);
    }
  }

  removeContribution(contributionId: string): void {
    this.store.removeSavingsGoalContribution(this.goal().id, contributionId);
  }

  remove(): void {
    this.store.removeSavingsGoal(this.goal().id);
  }
}
