import { Component, OnInit } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmt } from '../../../core/utils/currency.utils';
import { monthLabel } from '../../../core/utils/date.utils';
import { CategoryBudgets } from '../category-budgets/category-budgets';
import { LoadErrorBanner } from '../../dashboard/load-error-banner/load-error-banner';
import { MonthlyReminders } from '../../provisions/monthly-reminders/monthly-reminders';
import { ProvisionForm } from '../../provisions/provision-form/provision-form';
import { ProvisionList } from '../../provisions/provision-list/provision-list';
import { UpcomingProvisions } from '../../provisions/upcoming-provisions/upcoming-provisions';
import { VersementSplitter } from '../../provisions/versement-splitter/versement-splitter';

@Component({
  selector: 'app-budget-page',
  imports: [
    CategoryBudgets,
    LoadErrorBanner,
    MonthlyReminders,
    ProvisionForm,
    ProvisionList,
    UpcomingProvisions,
    VersementSplitter,
  ],
  templateUrl: './budget-page.html',
  styleUrl: './budget-page.scss',
})
export class BudgetPage implements OnInit {
  readonly fmt = fmt;
  readonly monthLabel = monthLabel;

  constructor(public store: BudgetStore) {}

  ngOnInit(): void {
    this.store.loadAll();
  }
}
