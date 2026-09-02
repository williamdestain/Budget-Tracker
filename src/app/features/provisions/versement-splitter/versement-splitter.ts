import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmt } from '../../../core/utils/currency.utils';
import { isoOfDate, fmtDate } from '../../../core/utils/date.utils';
import { provisionPot, effectiveProvisionAmount } from '../../../core/utils/provision.utils';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type SplitMethod = 'percent' | 'equal' | 'proportional' | 'manual';
type SourceMode = 'new' | 'existing';

@Component({
  selector: 'app-versement-splitter',
  imports: [FormsModule],
  templateUrl: './versement-splitter.html',
  styleUrl: './versement-splitter.scss',
})
export class VersementSplitter {
  readonly open = signal(false);
  readonly saving = signal(false);

  sourceMode: SourceMode = 'new';
  existingExpenseId: string | null = null;
  totalAmount: number | null = null;
  date = isoOfDate(new Date());
  splitMethod: SplitMethod = 'percent';
  selected = new Set<string>();
  manualAmounts: Record<string, number | undefined> = {};
  keepRemainderInBudget = false;

  constructor(public store: BudgetStore) {}

  get isGlobal(): boolean {
    return this.store.activeOwner() === 'global';
  }

  get senderLabel(): string {
    return this.store.activeOwner() === 'moi' ? 'Madame' : 'Moi';
  }

  get existingVersements() {
    return this.store.unsplitVersements();
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }

  // Choisir "Versement existant" : préremplit montant + date depuis la
  // dépense sélectionnée, et les verrouille (c'est cette dépense-là qu'on
  // répartit, pas un nouveau montant).
  selectExisting(id: string): void {
    this.existingExpenseId = id;
    const e = this.existingVersements.find((v) => v.id === id);
    if (e) {
      this.totalAmount = e.amount;
      this.date = e.date;
    }
  }

  setSourceMode(mode: SourceMode): void {
    this.sourceMode = mode;
    if (mode === 'new') {
      this.existingExpenseId = null;
      this.totalAmount = null;
      this.date = isoOfDate(new Date());
    } else if (this.existingVersements.length > 0) {
      this.selectExisting(this.existingVersements[0].id);
    }
  }

  // Provisions candidates : celles qui manquent encore d'argent, ET celles
  // qui ont une part (%) définie même si déjà couvertes pour l'instant (pour
  // que la répartition automatique reste disponible mois après mois).
  readonly candidates = computed(() => {
    const ym = this.store.current();
    const expenses = this.store.expenses();
    const owner = this.store.activeOwner();
    if (owner === 'global') return [];
    return this.store
      .visibleProvisions()
      .filter((p) => p.owner === owner)
      .map((p) => {
        const pot = provisionPot(p, ym, expenses);
        const target = effectiveProvisionAmount(p, expenses);
        return {
          provision: p,
          missing: Math.max(target - pot, 0),
          percent: p.allocationPercent || 0,
        };
      })
      .filter((row) => row.missing > 0 || row.percent > 0)
      .sort((a, b) => b.percent - a.percent || b.missing - a.missing);
  });

  get hasPercentDefined(): boolean {
    return this.candidates().some((c) => c.percent > 0);
  }

  colorFor(category: string): string {
    return this.store.colorFor(category);
  }

  fmt(n: number): string {
    return fmt(n);
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) {
      this.manualAmounts = {};
      this.keepRemainderInBudget = false;
      this.selected = new Set(this.candidates().map((c) => c.provision.id));
      // Si au moins une provision a une part définie, on part de ce mode
      // (le plus pratique au quotidien) ; sinon, égal par défaut.
      this.splitMethod = this.hasPercentDefined ? 'percent' : 'equal';
      // Un versement déjà enregistré (mais pas encore réparti) existe :
      // on part de là par défaut, pour éviter de le recompter par erreur.
      if (this.existingVersements.length > 0) {
        this.setSourceMode('existing');
      } else {
        this.setSourceMode('new');
      }
    }
  }

  isSelected(id: string): boolean {
    return this.selected.has(id);
  }

  toggleSelected(id: string, checked: boolean): void {
    const copy = new Set(this.selected);
    if (checked) copy.add(id);
    else copy.delete(id);
    this.selected = copy;
  }

  get selectedRows() {
    return this.candidates().filter((c) => this.selected.has(c.provision.id));
  }

  get totalMissingSelected(): number {
    return this.selectedRows.reduce((s, r) => s + r.missing, 0);
  }

  get totalPercentSelected(): number {
    return this.selectedRows.reduce((s, r) => s + r.percent, 0);
  }

  // Montant attribué à une provision selon la méthode choisie (avant
  // ajustement d'arrondi final).
  allocationFor(provisionId: string, missing: number, percent: number): number {
    const rows = this.selectedRows;
    if (rows.length === 0) return 0;
    const amount = this.totalAmount ?? 0;

    if (this.splitMethod === 'manual') {
      return this.manualAmounts[provisionId] ?? 0;
    }
    if (this.splitMethod === 'percent') {
      // Repli sur une répartition égale si aucune des provisions
      // sélectionnées n'a de part définie.
      if (this.totalPercentSelected <= 0) return amount / rows.length;
      return (percent / this.totalPercentSelected) * amount;
    }
    if (this.splitMethod === 'equal') {
      return amount / rows.length;
    }
    // proportionnel au manque
    if (this.totalMissingSelected <= 0) return amount / rows.length;
    return (missing / this.totalMissingSelected) * amount;
  }

  get allocatedSum(): number {
    return this.selectedRows.reduce(
      (s, r) => s + this.allocationFor(r.provision.id, r.missing, r.percent),
      0,
    );
  }

  get remaining(): number {
    return round2((this.totalAmount ?? 0) - this.allocatedSum);
  }

  get canSubmit(): boolean {
    if (!this.totalAmount || this.totalAmount <= 0 || !this.date || this.selectedRows.length === 0) {
      return false;
    }
    if (this.sourceMode === 'existing' && !this.existingExpenseId) return false;
    // Dépassement (plus assigné que le montant reçu) : jamais permis.
    if (this.remaining < -0.01) return false;
    // Reste non assigné : permis seulement si l'option est cochée — il
    // reste alors simplement dans le budget disponible (le versement au
    // complet est déjà compté comme revenu, seule la part assignée aux
    // provisions est mise de côté).
    if (this.remaining > 0.01 && !this.keepRemainderInBudget) return false;
    return true;
  }

  async submit(): Promise<void> {
    if (!this.canSubmit || !this.totalAmount) return;
    this.saving.set(true);
    try {
      const rows = this.selectedRows;
      // Arrondit chaque part à 2 décimales, puis corrige la dernière pour
      // que la somme corresponde exactement au montant total (évite les
      // écarts de centimes dus aux arrondis) — MAIS seulement quand le
      // montant complet est censé être réparti. Bug corrigé : cette
      // correction s'appliquait auparavant sans condition, donc quand
      // "Laisser le reste dans le budget" était coché, le reste
      // volontairement laissé de côté (pas juste quelques centimes) était
      // traité comme un écart d'arrondi et empilé sur la dernière
      // provision sélectionnée — au lieu de rester dans le budget comme
      // annoncé.
      const allocations = rows.map((r) => ({
        provisionId: r.provision.id,
        amount: round2(this.allocationFor(r.provision.id, r.missing, r.percent)),
      }));
      if (!this.keepRemainderInBudget) {
        const sum = allocations.reduce((s, a) => s + a.amount, 0);
        const drift = round2(this.totalAmount - sum);
        if (allocations.length > 0 && drift !== 0) {
          allocations[allocations.length - 1].amount = round2(
            allocations[allocations.length - 1].amount + drift,
          );
        }
      }

      await this.store.splitVersementIntoProvisions(
        this.totalAmount,
        this.date,
        allocations,
        this.sourceMode === 'existing' ? (this.existingExpenseId ?? undefined) : undefined,
      );
      this.open.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
