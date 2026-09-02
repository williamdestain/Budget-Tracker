import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { Category } from '../../../core/models/budget.models';

@Component({
  selector: 'app-categories-manage',
  imports: [FormsModule],
  templateUrl: './categories-manage.html',
  styleUrl: './categories-manage.scss',
})
export class CategoriesManage {
  readonly open = signal(false);
  readonly saving = signal(false);
  readonly showArchived = signal(false);

  newName = '';

  readonly editingId = signal<string | null>(null);
  editName = '';

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
    this.editingId.set(null);
    this.newName = '';
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  get activeList(): Category[] {
    return [...this.store.categories()]
      .filter((c) => !c.archived)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  get archivedList(): Category[] {
    return [...this.store.categories()]
      .filter((c) => c.archived)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  async add(): Promise<void> {
    const name = this.newName.trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    try {
      await this.store.addCategory(name);
      this.newName = '';
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.saving.set(false);
    }
  }

  startEdit(c: Category): void {
    this.editingId.set(c.id);
    this.editName = c.name;
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  // Renommer met à jour le texte partout où c'est utilisé (dépenses,
  // provisions, dépenses récurrentes, budgets par catégorie) — SAUF dans
  // les mois clôturés, jamais modifiés (voir renameCategory() dans le
  // store pour le détail complet).
  async saveEdit(id: string): Promise<void> {
    const name = this.editName.trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    try {
      await this.store.renameCategory(id, name);
      this.editingId.set(null);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.saving.set(false);
    }
  }

  // "Supprimer" une catégorie déjà utilisée = l'archiver : elle disparaît
  // des menus déroulants, mais aucune donnée existante n'est jamais
  // touchée. Réversible via "Restaurer".
  async archive(c: Category): Promise<void> {
    if (
      !confirm(
        `Retirer "${c.name}" des listes ? L'historique existant (dépenses, provisions...) n'est jamais touché — tu pourras la restaurer plus tard depuis "Catégories archivées".`,
      )
    ) {
      return;
    }
    try {
      await this.store.archiveCategory(c.id);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  }

  async unarchive(c: Category): Promise<void> {
    try {
      await this.store.unarchiveCategory(c.id);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  }

  // Suppression réelle : le store refuse si la catégorie est encore
  // utilisée quelque part (protection anti-régression) — voir
  // deleteCategoryPermanently().
  async deleteForever(c: Category): Promise<void> {
    if (!confirm(`Supprimer définitivement "${c.name}" ? Cette action est irréversible.`)) return;
    try {
      await this.store.deleteCategoryPermanently(c.id);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  }
}
