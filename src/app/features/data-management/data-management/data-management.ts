import { Component, ElementRef, signal, ViewChild } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { monthLabel } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-data-management',
  imports: [],
  templateUrl: './data-management.html',
  styleUrl: './data-management.scss',
})
export class DataManagement {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly open = signal(false);
  readonly step = signal<'choice' | 'confirm'>('choice');
  readonly saving = signal(false);
  readonly importing = signal(false);

  readonly rcExpenses = signal(false);
  readonly rcIncomes = signal(false);
  readonly rcAll = signal(false);
  readonly rcFull = signal(false);

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  get monthLabel(): string {
    return monthLabel(this.store.current());
  }

  openModal(): void {
    this.rcExpenses.set(false);
    this.rcIncomes.set(false);
    this.rcAll.set(false);
    this.rcFull.set(false);
    this.step.set('choice');
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }

  // Ferme la modale uniquement si le clic a eu lieu sur le fond lui-même
  // (pas sur son contenu). Écrite comme une vraie méthode plutôt qu'une
  // expression "a === b && close()" dans le template : Angular annule
  // l'action par défaut de l'événement quand un binding (click) renvoie
  // `false`, ce qui empêchait au passage les cases à cocher de basculer.
  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  export(): void {
    this.store.exportData();
    this.toast.show('💾 Sauvegarde téléchargée.');
  }

  triggerImport(): void {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de réimporter le même fichier ensuite
    if (!file) return;

    let data: any;
    try {
      data = JSON.parse(await file.text());
    } catch {
      this.toast.show('⚠️ Fichier illisible (JSON invalide).');
      return;
    }

    const nExp = Array.isArray(data?.expenses) ? data.expenses.length : 0;
    const nInc = Array.isArray(data?.incomes) ? data.incomes.length : 0;
    const nProv = Array.isArray(data?.provisions) ? data.provisions.length : 0;
    if (
      !confirm(
        `Remplacer TOUTES les données actuelles par ce fichier ?\n${nExp} dépense(s), ${nInc} revenu(s), ${nProv} provision(s).\n\nCette action est irréversible (sauf si tu as toi-même une sauvegarde de l'état actuel).`,
      )
    ) {
      return;
    }

    this.importing.set(true);
    try {
      await this.store.importData(data);
      this.toast.show('✅ Données restaurées.');
      this.open.set(false);
    } catch (err: any) {
      console.error(err);
      const detail = err?.message ? ` (${err.message})` : '';
      this.toast.show(`⚠️ Échec de la restauration${detail}`);
    } finally {
      this.importing.set(false);
    }
  }

  // Chaque case a son propre gestionnaire explicite (checked -> set signal),
  // plutôt que ngModel + (change) sur le même élément, pour éviter tout
  // problème d'ordre entre les deux écouteurs sur l'événement "change".
  toggleExpenses(checked: boolean): void {
    this.rcExpenses.set(checked);
    this.syncAllFromTargeted();
  }

  toggleIncomes(checked: boolean): void {
    this.rcIncomes.set(checked);
    this.syncAllFromTargeted();
  }

  toggleAll(checked: boolean): void {
    this.rcAll.set(checked);
    if (checked) {
      this.rcExpenses.set(true);
      this.rcIncomes.set(true);
    }
  }

  toggleFull(checked: boolean): void {
    this.rcFull.set(checked);
    if (checked) {
      this.rcExpenses.set(false);
      this.rcIncomes.set(false);
      this.rcAll.set(false);
    }
  }

  private syncAllFromTargeted(): void {
    this.rcAll.set(this.rcExpenses() && this.rcIncomes());
  }

  get anyChecked(): boolean {
    return this.rcFull() || this.rcAll() || this.rcExpenses() || this.rcIncomes();
  }

  get stats() {
    return this.store.monthStats(this.store.current());
  }

  goConfirm(): void {
    if (!this.anyChecked) {
      this.toast.show('⚠️ Sélectionne au moins une option.');
      return;
    }
    this.step.set('confirm');
  }

  goBack(): void {
    this.step.set('choice');
  }

  async confirmReset(): Promise<void> {
    this.saving.set(true);
    try {
      // Sauvegarde automatique avant toute suppression.
      this.store.exportData();

      if (this.rcFull()) {
        await this.store.resetEverything();
      } else {
        const ym = this.store.current();
        if (this.rcAll() || this.rcExpenses()) await this.store.resetExpensesForMonth(ym);
        if (this.rcAll() || this.rcIncomes()) await this.store.resetIncomesForMonth(ym);
      }

      this.open.set(false);
      this.toast.show('🗑 Données supprimées. Sauvegarde téléchargée.');
    } finally {
      this.saving.set(false);
    }
  }
}
