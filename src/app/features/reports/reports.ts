import { Component, computed, OnInit } from '@angular/core';
import { BudgetStore } from '../../core/services/budget-store.service';
import { fmt } from '../../core/utils/currency.utils';
import { monthLabel } from '../../core/utils/date.utils';
import { BarLineChart, type ChartSeries } from '../../shared/ui/bar-line-chart/bar-line-chart';
import { DonutChart, type DonutSegment } from '../../shared/ui/donut-chart/donut-chart';

@Component({
  selector: 'app-reports',
  imports: [BarLineChart, DonutChart],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports implements OnInit {
  constructor(public store: BudgetStore) {}

  readonly monthLabel = computed(() => monthLabel(this.store.current()));

  readonly yearlySeries = computed<ChartSeries[]>(() => {
    const months = this.store.yearlyView().months;
    return [
      { name: 'Revenus', color: 'var(--green)', kind: 'bar', values: months.map((m) => m.revenus) },
      { name: 'Dépenses', color: 'var(--red)', kind: 'bar', values: months.map((m) => m.spent) },
      { name: 'Solde net', color: 'var(--accent)', kind: 'line', values: months.map((m) => m.soldeNet) },
    ];
  });

  readonly yearlyCategories = computed(() => this.store.yearlyView().months.map((m) => m.label));

  readonly categorySegments = computed<DonutSegment[]>(() => {
    const totals = new Map<string, number>();
    for (const expense of this.store.countedExpensesList()) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
    }
    const entries = [...totals.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
    return entries.map(([label, amount]) => ({
      label,
      color: this.store.colorFor(label),
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
    }));
  });

  readonly kpis = computed(() => {
    const view = this.store.yearlyView();
    return {
      revenues: view.totals.revenus,
      spent: view.totals.spent,
      net: view.totals.soldeNet,
      averageSpent: view.months.length ? view.totals.spent / view.months.length : 0,
    };
  });

  fmt(value: number): string {
    return fmt(value);
  }

  previousYear(): void {
    this.store.yearlyYear.update((year) => year - 1);
  }

  nextYear(): void {
    this.store.yearlyYear.update((year) => year + 1);
  }

  ngOnInit(): void {
    this.store.loadAll();
  }
}
