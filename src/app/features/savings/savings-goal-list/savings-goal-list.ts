import { Component } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { SavingsGoalCard } from '../savings-goal-card/savings-goal-card';

@Component({
  selector: 'app-savings-goal-list',
  imports: [SavingsGoalCard],
  templateUrl: './savings-goal-list.html',
  styleUrl: './savings-goal-list.scss',
})
export class SavingsGoalList {
  constructor(public store: BudgetStore) {}
}
