import { Component, computed } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { COLOR_MAP, OWNERS, OWNERS_SHORT } from '../../../core/utils/categories';
import { fmtDate } from '../../../core/utils/date.utils';
import { fmt } from '../../../core/utils/currency.utils';
import { Owner } from '../../../core/models/budget.models';
import { CountedExpense } from '../../../core/utils/provision.utils';

@Component({
  selector: 'app-expense-list',
  imports: [],
  templateUrl: './expense-list.html',
  styleUrl: './expense-list.scss',
})
export class ExpenseList {
  constructor(public store: BudgetStore) {}

  // Dépenses réelles + réserves synthétiques des provisions (même logique
  // que l'ancienne app) : les réserves complètent la liste sans dupliquer
  // le paiement réel, qui reste affiché tel quel s'il existe.
  readonly mergedList = computed<CountedExpense[]>(() => {
    const real = this.store.visibleExpenses();
    const reserves = this.store.countedExpensesList().filter((e) => e.provision);
    return [...real, ...reserves].sort(
      (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
    );
  });

  get realCount(): number {
    return this.store.visibleExpenses().length;
  }

  colorFor(category: string): string {
    return COLOR_MAP[category] || '#94a3b8';
  }

  ownerShort(owner: Owner): string {
    return OWNERS_SHORT[owner];
  }

  otherOwner(owner: Owner): Owner {
    return owner === 'moi' ? 'madame' : 'moi';
  }

  get showBadge(): boolean {
    return this.store.activeOwner() === 'global';
  }

  get emptyMessage(): string {
    const owner = this.store.activeOwner();
    return `Aucune dépense pour ${owner === 'global' ? 'le foyer' : OWNERS[owner]} sur cette période.`;
  }

  reserveLabel(e: CountedExpense): string {
    return e.provisionAdjustment ? 'ajout au fonds' : 'réserve';
  }

  reserveTag(e: CountedExpense): string {
    return e.provisionAdjustment ? 'Ajout fonds' : 'Provision';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }

  remove(id: string): void {
    this.store.removeExpense(id);
  }
}
