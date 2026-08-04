import { Component, computed } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { COLOR_MAP, OWNERS } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';
import { fmtDate } from '../../../core/utils/date.utils';

interface CcBreakdownEntry {
  category: string;
  amount: number;
  pct: number;
}

@Component({
  selector: 'app-credit-card',
  imports: [],
  templateUrl: './credit-card.html',
  styleUrl: './credit-card.scss',
})
export class CreditCard {
  constructor(public store: BudgetStore) {}

  get title(): string {
    return '💳 Carte de crédit — ' + OWNERS[this.store.activeOwner()];
  }

  // Dépenses passées par la carte (hors versements et remboursements),
  // classées par catégorie.
  readonly breakdown = computed(() => {
    const list = this.store.visibleExpenses().filter(
      (e) =>
        e.cc && e.category !== 'Versement' && e.category !== 'Remboursement Carte Crédit',
    );
    const parCat: Record<string, number> = {};
    list.forEach((e) => {
      parCat[e.category] = (parCat[e.category] || 0) + e.amount;
    });
    const sorted = Object.entries(parCat).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const entries: CcBreakdownEntry[] = sorted.map(([category, amount]) => ({
      category,
      amount,
      pct: total > 0 ? (amount / total) * 100 : 0,
    }));
    return { entries, total };
  });

  // Remboursements de carte de crédit effectués (catégorie dédiée + case
  // "carte de crédit" cochée) — indépendant du récap ci-dessus.
  readonly reimbursements = computed(() =>
    this.store
      .visibleExpenses()
      .filter((e) => e.category === 'Remboursement Carte Crédit' && e.cc)
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  colorFor(category: string): string {
    return COLOR_MAP[category] || '#94a3b8';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }
}
