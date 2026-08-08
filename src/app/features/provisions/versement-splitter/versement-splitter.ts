import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { COLOR_MAP } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';
import { isoOfDate } from '../../../core/utils/date.utils';
import { provisionPot, effectiveProvisionAmount } from '../../../core/utils/provision.utils';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type SplitMethod = 'equal' | 'proportional' | 'manual';

@Component({
  selector: 'app-versement-splitter',
  imports: [FormsModule],
  templateUrl: './versement-splitter.html',
  styleUrl: './versement-splitter.scss',
})
export class VersementSplitter {
  readonly open = signal(false);
  readonly saving = signal(false);

  totalAmount: number | null = null;
  date = isoOfDate(new Date());
  splitMethod: SplitMethod = 'equal';
  selected = new Set<string>();
  manualAmounts: Record<string, number | undefined> = {};

  constructor(public store: BudgetStore) {}

  get isGlobal(): boolean {
    return this.store.activeOwner() === 'global';
  }

  get senderLabel(): string {
    return this.store.activeOwner() === 'moi' ? 'Madame' : 'Moi';
  }

  // Provisions du profil actif qui ont encore besoin d'argent — seules
  // candidates pertinentes pour répartir un versement reçu.
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
        return { provision: p, missing: Math.max(target - pot, 0) };
      })
      .filter((row) => row.missing > 0)
      .sort((a, b) => b.missing - a.missing);
  });

  colorFor(category: string): string {
    return COLOR_MAP[category] || '#94a3b8';
  }

  fmt(n: number): string {
    return fmt(n);
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) {
      this.totalAmount = null;
      this.splitMethod = 'equal';
      this.manualAmounts = {};
      this.selected = new Set(this.candidates().map((c) => c.provision.id));
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

  // Montant attribué à une provision selon la méthode choisie (avant
  // ajustement d'arrondi final).
  allocationFor(provisionId: string, missing: number): number {
    const rows = this.selectedRows;
    if (rows.length === 0) return 0;
    const amount = this.totalAmount ?? 0;

    if (this.splitMethod === 'manual') {
      return this.manualAmounts[provisionId] ?? 0;
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
      (s, r) => s + this.allocationFor(r.provision.id, r.missing),
      0,
    );
  }

  get remaining(): number {
    return round2((this.totalAmount ?? 0) - this.allocatedSum);
  }

  get canSubmit(): boolean {
    return (
      !!this.totalAmount &&
      this.totalAmount > 0 &&
      !!this.date &&
      this.selectedRows.length > 0 &&
      Math.abs(this.remaining) < 0.01
    );
  }

  async submit(): Promise<void> {
    if (!this.canSubmit || !this.totalAmount) return;
    this.saving.set(true);
    try {
      const rows = this.selectedRows;
      // Arrondit chaque part à 2 décimales, puis corrige la dernière pour
      // que la somme corresponde exactement au montant total (évite les
      // écarts de centimes dus aux arrondis).
      const allocations = rows.map((r) => ({
        provisionId: r.provision.id,
        amount: round2(this.allocationFor(r.provision.id, r.missing)),
      }));
      const sum = allocations.reduce((s, a) => s + a.amount, 0);
      const drift = round2(this.totalAmount - sum);
      if (allocations.length > 0 && drift !== 0) {
        allocations[allocations.length - 1].amount = round2(
          allocations[allocations.length - 1].amount + drift,
        );
      }

      await this.store.splitVersementIntoProvisions(this.totalAmount, this.date, allocations);
      this.open.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
