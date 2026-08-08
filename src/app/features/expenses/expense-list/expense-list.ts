import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { COLOR_MAP, OWNERS, OWNERS_SHORT, CATEGORIES } from '../../../core/utils/categories';
import { fmtDate } from '../../../core/utils/date.utils';
import { fmt } from '../../../core/utils/currency.utils';
import { Expense, Owner } from '../../../core/models/budget.models';
import { CountedExpense } from '../../../core/utils/provision.utils';

@Component({
  selector: 'app-expense-list',
  imports: [FormsModule],
  templateUrl: './expense-list.html',
  styleUrl: './expense-list.scss',
})
export class ExpenseList {
  readonly categories = CATEGORIES.filter((c) => c !== 'Revenu');

  readonly editingId = signal<string | null>(null);
  readonly savingEdit = signal(false);

  editAmount: number | null = null;
  editCategory = '';
  editDate = '';
  editOwner: Owner = 'moi';
  editCc = false;

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

  // Édition : les réserves synthétiques de provision (id "prov-...") ne
  // sont jamais éditables — elles n'existent pas vraiment en base, ce sont
  // des lignes calculées. On ne propose donc le bouton crayon que sur les
  // vraies dépenses (le template s'en charge déjà en excluant cette branche).
  startEdit(e: CountedExpense): void {
    this.editingId.set(e.id);
    this.editAmount = e.amount;
    this.editCategory = e.category;
    this.editDate = e.date;
    this.editOwner = e.owner;
    this.editCc = e.cc;
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  async saveEdit(id: string): Promise<void> {
    if (!this.editAmount || this.editAmount <= 0 || !this.editDate) return;
    this.savingEdit.set(true);
    try {
      const changes: Partial<Omit<Expense, 'id'>> = {
        amount: this.editAmount,
        category: this.editCategory,
        date: this.editDate,
        owner: this.editOwner,
        cc: this.editCc,
      };
      await this.store.updateExpense(id, changes);
      this.editingId.set(null);
    } finally {
      this.savingEdit.set(false);
    }
  }
}
