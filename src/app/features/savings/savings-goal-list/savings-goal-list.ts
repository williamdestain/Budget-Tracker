import { Component, signal } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { SavingsGoalCard } from '../savings-goal-card/savings-goal-card';
import { SavingsGoalForm } from '../savings-goal-form/savings-goal-form';

@Component({
  selector: 'app-savings-goal-list',
  imports: [SavingsGoalCard, SavingsGoalForm],
  templateUrl: './savings-goal-list.html',
  styleUrl: './savings-goal-list.scss',
})
export class SavingsGoalList {
  readonly open = signal(false);

  constructor(public store: BudgetStore) {}

  toggle(): void {
    this.open.update((v) => !v);
  }
}
