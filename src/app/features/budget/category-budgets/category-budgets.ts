import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { COLOR_MAP, CATEGORIES, sortedAlpha } from '../../../core/utils/categories';
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
  // "Remboursement Carte Crédit" est exclue : ce n'est pas une catégorie
  // de dépense discrétionnaire qu'on budgète (voir countedExpenses(), qui
  // l'exclut aussi du calcul du budget pour éviter un double comptage
  // avec l'achat déjà compté au moment de la charge sur la carte).
  readonly availableCategories = computed(() => {
    const used = new Set(this.store.categoryBudgetRows().map((r) => r.category));
    return sortedAlpha(
      CATEGORIES.filter(
        (c) => c !== 'Revenu' && c !== 'Versement' && c !== 'Remboursement Carte Crédit' && !used.has(c),
      ),
    );
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
    // ?? et pas || : un budget déjà à 0 doit s'afficher "0" dans le champ,
    // pas vide (0 || null donnait null, à tort — 0 est une valeur
    // valide, pas "rien").
    this.editAmount = current ?? null;
  }

  cancelEdit(): void {
    this.editingCategory.set(null);
  }

  // Enregistre toujours le montant saisi (0 compris) comme un budget
  // explicite pour ce mois. Bug corrigé : ceci appelait auparavant
  // removeCategoryBudget() dès que le montant était 0, ce qui ne mettait
  // PAS le budget à 0 — ça supprimait la ligne du mois, et le budget
  // réapparaissait hérité d'un mois précédent (voir
  // effectiveCategoryBudget) au lieu de rester à 0 comme voulu. Mettre
  // explicitement 0 (=blocage volontaire de la catégorie ce mois-ci) et
  // "retirer le budget" (=revenir à l'héritage) sont deux actions
  // différentes ; seul le bouton ✕ dédié doit faire la seconde.
  async saveEdit(category: string): Promise<void> {
    if (this.isGlobal) return;
    const owner = this.store.activeOwner() as Owner;
    const amount = this.editAmount ?? 0;
    if (amount < 0) return;
    await this.store.setCategoryBudget(owner, this.store.current(), category, amount);
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
    // 0 doit être accepté (catégorie volontairement gelée ce mois-ci) —
    // seuls "rien saisi" et les montants négatifs sont refusés.
    if (this.isGlobal || !this.newCategory || this.newAmount == null || this.newAmount < 0) return;
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
