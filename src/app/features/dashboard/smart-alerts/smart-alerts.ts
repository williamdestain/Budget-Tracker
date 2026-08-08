import { Component } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';

@Component({
  selector: 'app-smart-alerts',
  imports: [],
  templateUrl: './smart-alerts.html',
  styleUrl: './smart-alerts.scss',
})
export class SmartAlerts {
  constructor(public store: BudgetStore) {}
}
