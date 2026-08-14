import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { COLOR_MAP, CATEGORIES } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';
import { Owner } from '../../../core/models/budget.models';

@Component({
  selector: 'app-category-budgets',
  imports: [FormsModule],
  templateUrl: './category-budgets.html',
  styleUrl: './category-budgets.scss',
})
export class CategoryBudgets {
  readonly open = signal(false);
  readonly editingCategory = signal<string | null>(null);
  editAmount: number | null = null;

  readonly addOpen = signal(false);
  newCategory = '';
  newAmount: number | null = null;

  constructor(public store: BudgetStore) {}

  toggle(): void {
    this.open.update((v) => !v);
  }

  get isGlobal(): boolean {
    return this.store.activeOwner() === 'global';
  }

  // Catégories pas encore suivies, disponibles pour "+ Ajouter".
  readonly availableCategories = computed(() => {
    const used = new Set(this.store.categoryBudgetRows().map((r) => r.category));
    return CATEGORIES.filter((c) => c !== 'Revenu' && c !== 'Versement' && !used.has(c));
  });

  colorFor(category: string): string {
    return COLOR_MAP[category] || '#94a3b8';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  barClass(pct: number): string {
    if (pct >= 100) return 'over';
    if (pct >= 80) return 'warn';
    return '';
  }

  startEdit(category: string, current: number): void {
    this.editingCategory.set(category);
    this.editAmount = current || null;
  }

  cancelEdit(): void {
    this.editingCategory.set(null);
  }

  async saveEdit(category: string): Promise<void> {
    if (this.isGlobal) return;
    const owner = this.store.activeOwner() as Owner;
    const amount = this.editAmount ?? 0;
    if (amount > 0) {
      await this.store.setCategoryBudget(owner, this.store.current(), category, amount);
    } else {
      await this.store.removeCategoryBudget(owner, this.store.current(), category);
    }
    this.editingCategory.set(null);
  }

  async removeBudget(category: string): Promise<void> {
    if (this.isGlobal) return;
    const owner = this.store.activeOwner() as Owner;
    await this.store.removeCategoryBudget(owner, this.store.current(), category);
  }

  toggleAdd(): void {
    this.addOpen.update((v) => !v);
    this.newCategory = this.availableCategories()[0] || '';
    this.newAmount = null;
  }

  async submitAdd(): Promise<void> {
    if (this.isGlobal || !this.newCategory || !this.newAmount || this.newAmount <= 0) return;
    const owner = this.store.activeOwner() as Owner;
    await this.store.setCategoryBudget(
      owner,
      this.store.current(),
      this.newCategory,
      this.newAmount,
    );
    this.addOpen.set(false);
  }
}
