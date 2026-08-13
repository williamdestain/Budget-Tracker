import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { BudgetStore } from '../../core/services/budget-store.service';
import { ToastService } from '../../core/services/toast.service';
import { monthLabel, nextYM, prevYM } from '../../core/utils/date.utils';
import { fmt } from '../../core/utils/currency.utils';
import { OWNERS } from '../../core/utils/categories';
import { Owner } from '../../core/models/budget.models';
import { IncomeBar } from '../incomes/income-bar/income-bar';
import { IncomeForm } from '../incomes/income-form/income-form';
import { IncomeList } from '../incomes/income-list/income-list';
import { ExpenseForm } from '../expenses/expense-form/expense-form';
import { ExpenseList } from '../expenses/expense-list/expense-list';
import { ProvisionForm } from '../provisions/provision-form/provision-form';
import { ProvisionList } from '../provisions/provision-list/provision-list';
import { UpcomingProvisions } from '../provisions/upcoming-provisions/upcoming-provisions';
import { VersementSplitter } from '../provisions/versement-splitter/versement-splitter';
import { CreditCard } from '../credit-card/credit-card/credit-card';
import { BudgetProgress } from '../budget/budget-progress/budget-progress';
import { SpendingChart } from '../budget/spending-chart/spending-chart';
import { CategoryBudgets } from '../budget/category-budgets/category-budgets';
import { MonthForecast } from '../budget/month-forecast/month-forecast';
import { SmartAlerts } from './smart-alerts/smart-alerts';
import { ExpectedThisMonth } from '../recurring-expenses/expected-this-month/expected-this-month';
import { RecurringExpensesManage } from '../recurring-expenses/recurring-expenses-manage/recurring-expenses-manage';
import { DataManagement } from '../data-management/data-management/data-management';

@Component({
  selector: 'app-dashboard',
  imports: [
    IncomeBar,
    IncomeForm,
    IncomeList,
    ExpenseForm,
    ExpenseList,
    ProvisionForm,
    ProvisionList,
    UpcomingProvisions,
    VersementSplitter,
    CreditCard,
    BudgetProgress,
    SpendingChart,
    CategoryBudgets,
    MonthForecast,
    SmartAlerts,
    ExpectedThisMonth,
    RecurringExpensesManage,
    DataManagement,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  constructor(
    private auth: AuthService,
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.store.loadAll();
  }

  logout(): void {
    this.auth.signOut();
  }

  get monthLabel(): string {
    return monthLabel(this.store.current());
  }

  prevMonth(): void {
    this.store.current.set(prevYM(this.store.current()));
  }

  nextMonth(): void {
    this.store.current.set(nextYM(this.store.current()));
  }

  setOwner(owner: 'moi' | 'madame' | 'global'): void {
    this.store.activeOwner.set(owner);
  }

  private fmtSigned(n: number): string {
    return (n >= 0 ? '+' : '-') + fmt(Math.abs(n));
  }

  // Clôture le mois affiché et reporte son solde net sur le mois suivant.
  // Depuis Moi/Madame : reporte uniquement ce profil.
  // Depuis Global : calcule et reporte Moi ET Madame en une seule action
  // (le report Global affiché n'est que leur somme, jamais stocké à part).
  async closeMonth(): Promise<void> {
    const ym = this.store.current();
    const target = nextYM(ym);
    const owner = this.store.activeOwner();

    if (owner === 'global') {
      const soldeMoi = this.store.soldeNetForOwner('moi');
      const soldeMadame = this.store.soldeNetForOwner('madame');
      const existingMoi = this.store.rolloverFor('moi', target);
      const existingMadame = this.store.rolloverFor('madame', target);

      let msg =
        `Clôturer ${monthLabel(ym)} et reporter vers ${monthLabel(target)} :\n\n` +
        `• Moi : ${this.fmtSigned(soldeMoi)}\n` +
        `• Madame : ${this.fmtSigned(soldeMadame)}`;
      if (existingMoi || existingMadame) {
        msg += `\n\n⚠ Des reports existent déjà pour ${monthLabel(target)} — ils seront remplacés.`;
      }
      if (!confirm(msg)) return;

      await Promise.all([
        this.store.setRollover('moi', target, soldeMoi),
        this.store.setRollover('madame', target, soldeMadame),
      ]);
      this.toast.show(
        `🔒 Reporté vers ${monthLabel(target)} — Moi ${this.fmtSigned(soldeMoi)}, Madame ${this.fmtSigned(soldeMadame)}.`,
      );
      return;
    }

    const solde = this.store.budgetSummary().soldeNet;
    const existing = this.store.rolloverFor(owner, target);
    let msg = `Reporter ${this.fmtSigned(solde)} de ${monthLabel(ym)} vers ${monthLabel(target)} (${OWNERS[owner]}) ?`;
    if (existing) {
      msg += `\n\n⚠ Un report de ${fmt(existing)} existe déjà pour ${monthLabel(target)} — il sera remplacé.`;
    }
    if (!confirm(msg)) return;

    await this.store.setRollover(owner as Owner, target, solde);
    this.toast.show(`🔒 ${this.fmtSigned(solde)} reporté vers ${monthLabel(target)}.`);
  }
}
