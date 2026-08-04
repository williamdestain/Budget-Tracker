import { Component, computed, signal } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { COLOR_MAP } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';

interface ChartSegment {
  category: string;
  amount: number;
  pct: number;
  color: string;
  dash: number;
  gap: number;
  offset: number;
}

const R = 80;
const CX = 110;
const CY = 110;
const CIRC = 2 * Math.PI * R;

@Component({
  selector: 'app-spending-chart',
  imports: [],
  templateUrl: './spending-chart.html',
  styleUrl: './spending-chart.scss',
})
export class SpendingChart {
  readonly hovered = signal<string | null>(null);
  readonly cx = CX;
  readonly cy = CY;
  readonly r = R;

  constructor(public store: BudgetStore) {}

  readonly data = computed(() => {
    const list = this.store.countedExpensesList();
    const parCat: Record<string, number> = {};
    list.forEach((e) => {
      parCat[e.category] = (parCat[e.category] || 0) + e.amount;
    });
    const sorted = Object.entries(parCat)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);

    const gap = sorted.length > 1 ? 1.2 : 0;
    let offset = 0;
    const segments: ChartSegment[] = sorted.map(([category, amount]) => {
      const pct = total > 0 ? (amount / total) * 100 : 0;
      const length = (amount / total) * CIRC;
      const seg: ChartSegment = {
        category,
        amount,
        pct,
        color: COLOR_MAP[category] || '#94a3b8',
        dash: Math.max(length - gap, 0.5),
        gap: CIRC - Math.max(length - gap, 0.5),
        offset,
      };
      offset += length;
      return seg;
    });

    return { segments, total, count: list.length };
  });

  get centerTitle(): string {
    return this.hovered() || 'Total du mois';
  }

  get centerValue(): string {
    const h = this.hovered();
    if (h) {
      const seg = this.data().segments.find((s) => s.category === h);
      return seg ? fmt(seg.amount) : fmt(this.data().total);
    }
    return fmt(this.data().total);
  }

  get centerSub(): string {
    const h = this.hovered();
    if (h) {
      const seg = this.data().segments.find((s) => s.category === h);
      return seg ? `${seg.pct.toFixed(1)} %` : '';
    }
    const c = this.data().count;
    return c ? `${c} dépense${c > 1 ? 's' : ''}` : '';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  setHover(category: string | null): void {
    this.hovered.set(category);
  }
}
