import { Component } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ProvisionCard } from '../provision-card/provision-card';

@Component({
  selector: 'app-provision-list',
  imports: [ProvisionCard],
  templateUrl: './provision-list.html',
  styleUrl: './provision-list.scss',
})
export class ProvisionList {
  constructor(public store: BudgetStore) {}
}
