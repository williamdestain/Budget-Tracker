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
import { SavingsGoalList } from '../savings/savings-goal-list/savings-goal-list';
import { CreditCard } from '../credit-card/credit-card/credit-card';
import { BudgetProgress } from '../budget/budget-progress/budget-progress';
import { SpendingChart } from '../budget/spending-chart/spending-chart';
import { CategoryBudgets } from '../budget/category-budgets/category-budgets';
import { MonthForecast } from '../budget/month-forecast/month-forecast';
import { MonthComparison } from '../budget/month-comparison/month-comparison';
import { YearlyView } from '../budget/yearly-view/yearly-view';
import { SmartAlerts } from './smart-alerts/smart-alerts';
import { MoneyPulse } from './money-pulse/money-pulse';
import { LoadErrorBanner } from './load-error-banner/load-error-banner';
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
    SavingsGoalList,
    CreditCard,
    BudgetProgress,
    SpendingChart,
    CategoryBudgets,
    MonthForecast,
    MonthComparison,
    YearlyView,
    SmartAlerts,
    MoneyPulse,
    LoadErrorBanner,
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

  // Clôture le mois affiché, avec ou sans report du solde vers le mois
  // suivant :
  // - carryForward = true  (bouton "Clôturer le mois") : comportement
  //   d'origine, reporte le solde net.
  // - carryForward = false (bouton "Clôturer sans reporter") : le solde
  //   n'est PAS reporté — le report du mois suivant est explicitement mis
  //   à 0 (et pas seulement laissé tel quel), pour repartir sur une base
  //   propre même si un report avait déjà été calculé lors d'une clôture
  //   précédente (ex. clôturé → rouvert → reclôturé sans report).
  //
  // Dans les deux cas, le mois est ensuite verrouillé (store.closeMonth) :
  // aucune dépense, revenu ponctuel, ajustement de provision, contribution
  // d'épargne, budget par catégorie ou report ne peut plus être ajouté/
  // modifié/supprimé dans ce mois. Depuis Moi/Madame : agit uniquement sur
  // ce profil. Depuis Global : agit sur Moi ET Madame en une seule action
  // (le report Global affiché n'est que leur somme, jamais stocké à part)
  // — mais le verrou, lui, est global (pas par profil) : il s'applique aux
  // deux profils dès qu'une clôture est demandée, peu importe le mode.
  async closeMonth(): Promise<void> {
    await this.performClose(true);
  }

  async closeMonthFresh(): Promise<void> {
    await this.performClose(false);
  }

  private async performClose(carryForward: boolean): Promise<void> {
    const ym = this.store.current();
    const target = nextYM(ym);
    const owner = this.store.activeOwner();

    if (owner === 'global') {
      const soldeMoi = this.store.soldeNetForOwner('moi');
      const soldeMadame = this.store.soldeNetForOwner('madame');
      const existingMoi = this.store.rolloverFor('moi', target);
      const existingMadame = this.store.rolloverFor('madame', target);
      const rolloverMoi = carryForward ? soldeMoi : 0;
      const rolloverMadame = carryForward ? soldeMadame : 0;

      let msg = carryForward
        ? `Clôturer ${monthLabel(ym)} et reporter vers ${monthLabel(target)} :\n\n` +
          `• Moi : ${this.fmtSigned(soldeMoi)}\n` +
          `• Madame : ${this.fmtSigned(soldeMadame)}\n\n` +
          `Plus aucune modification ne sera possible dans ${monthLabel(ym)} après la clôture.`
        : `Clôturer ${monthLabel(ym)} SANS reporter le solde ?\n\n` +
          `• Solde de Moi (${this.fmtSigned(soldeMoi)}) et de Madame (${this.fmtSigned(soldeMadame)}) : perdu, pas reporté.\n` +
          `• ${monthLabel(target)} démarrera à 0, comme un nouveau départ.\n\n` +
          `Plus aucune modification ne sera possible dans ${monthLabel(ym)} après la clôture.`;
      if (existingMoi || existingMadame) {
        msg += carryForward
          ? `\n\n⚠ Des reports existent déjà pour ${monthLabel(target)} — ils seront remplacés.`
          : `\n\n⚠ Des reports existent déjà pour ${monthLabel(target)} — ils seront remis à 0.`;
      }
      if (!confirm(msg)) return;

      await Promise.all([
        this.store.setRollover('moi', target, rolloverMoi),
        this.store.setRollover('madame', target, rolloverMadame),
      ]);
      await this.store.closeMonth(ym);
      // Bascule automatiquement sur le mois cible : sans ça, le tableau de
      // bord reste affiché sur le mois qu'on vient de verrouiller (rien n'y
      // change visuellement), et il faut cliquer "Suivant" pour voir le
      // report apparaître — au premier coup d'œil, ça donne l'impression
      // que le report n'a pas fonctionné alors qu'il est bien enregistré.
      this.store.current.set(target);
      this.toast.show(
        carryForward
          ? `🔒 ${monthLabel(ym)} clôturé — reporté vers ${monthLabel(target)} : Moi ${this.fmtSigned(soldeMoi)}, Madame ${this.fmtSigned(soldeMadame)}.`
          : `🔒 ${monthLabel(ym)} clôturé sans report — ${monthLabel(target)} démarre à 0.`,
      );
      return;
    }

    const solde = this.store.budgetSummary().soldeNet;
    const existing = this.store.rolloverFor(owner, target);
    const rolloverAmount = carryForward ? solde : 0;
    let msg = carryForward
      ? `Reporter ${this.fmtSigned(solde)} de ${monthLabel(ym)} vers ${monthLabel(target)} (${OWNERS[owner]}) ?\n\n` +
        `Plus aucune modification ne sera possible dans ${monthLabel(ym)} après la clôture.`
      : `Clôturer ${monthLabel(ym)} (${OWNERS[owner]}) SANS reporter le solde (${this.fmtSigned(solde)}) ?\n\n` +
        `${monthLabel(target)} démarrera à 0, comme un nouveau départ.\n\n` +
        `Plus aucune modification ne sera possible dans ${monthLabel(ym)} après la clôture.`;
    if (existing) {
      msg += carryForward
        ? `\n\n⚠ Un report de ${fmt(existing)} existe déjà pour ${monthLabel(target)} — il sera remplacé.`
        : `\n\n⚠ Un report de ${fmt(existing)} existe déjà pour ${monthLabel(target)} — il sera remis à 0.`;
    }
    if (!confirm(msg)) return;

    await this.store.setRollover(owner as Owner, target, rolloverAmount);
    await this.store.closeMonth(ym);
    this.store.current.set(target);
    this.toast.show(
      carryForward
        ? `🔒 ${monthLabel(ym)} clôturé — ${this.fmtSigned(solde)} reporté vers ${monthLabel(target)}.`
        : `🔒 ${monthLabel(ym)} clôturé sans report — ${monthLabel(target)} démarre à 0.`,
    );
  }

  // Rouvre le mois affiché : lève le verrou, sans toucher au report déjà
  // effectué (l'utilisateur peut le corriger manuellement si besoin après
  // avoir modifié les données du mois rouvert).
  async reopenMonth(): Promise<void> {
    const ym = this.store.current();
    if (!confirm(`Rouvrir ${monthLabel(ym)} ? Les modifications seront de nouveau possibles pour ce mois.`)) {
      return;
    }
    await this.store.reopenMonth(ym);
    this.toast.show(`🔓 ${monthLabel(ym)} rouvert.`);
  }
}
