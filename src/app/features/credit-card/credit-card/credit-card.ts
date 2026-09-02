import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { OWNERS } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';
import { fmtDate, isoOfDate } from '../../../core/utils/date.utils';
import { ToastService } from '../../../core/services/toast.service';
import { Owner } from '../../../core/models/budget.models';

interface CcBreakdownEntry {
  category: string;
  amount: number;
  pct: number;
}

// Modèle "solde dû" demandé par un utilisateur pour remplacer l'ancienne
// approche par catégorie spéciale ("Remboursement Carte Crédit" + case
// cc à retenir de cocher) — voir CreditCardPayment dans budget.models.ts
// et creditCardBalance() dans budget-store.service.ts. Volontairement
// dans sa propre section, indépendante des provisions.
@Component({
  selector: 'app-credit-card',
  imports: [FormsModule],
  templateUrl: './credit-card.html',
  styleUrl: './credit-card.scss',
})
export class CreditCard {
  readonly payOpen = signal(false);
  payAmount: number | null = null;
  payDate = isoOfDate(new Date());
  payNote = '';
  readonly saving = signal(false);

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  get title(): string {
    return '💳 Carte de crédit — ' + OWNERS[this.store.activeOwner()];
  }

  // Solde dû du profil affiché — une dette qui se reporte tant qu'elle
  // n'est pas payée, jamais bornée à un seul mois (contrairement à
  // "Chargé ce mois" ci-dessous, qui reste une vue mensuelle utile pour
  // voir où va l'argent).
  readonly balance = computed(() => this.store.creditCardBalance(this.store.activeOwner()));

  // Toujours affiché : le solde combiné (Moi + Madame), pour voir la
  // dette totale du foyer sans devoir changer d'onglet.
  readonly balanceAllOwners = computed(() => this.store.creditCardBalance('global'));

  get showCombinedBalance(): boolean {
    return this.store.activeOwner() !== 'global';
  }

  // Dépenses passées par la carte ce mois-ci (hors versements), classées
  // par catégorie — vue purement informative, indépendante du solde dû.
  readonly breakdown = computed(() => {
    const list = this.store
      .visibleExpenses()
      .filter((e) => e.cc && e.category !== 'Versement' && e.category !== 'Remboursement Carte Crédit');
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

  // Paiements faits ce mois-ci pour rembourser la carte — remplace
  // l'ancienne liste basée sur la catégorie "Remboursement Carte Crédit".
  readonly payments = computed(() => {
    const ym = this.store.current();
    const owner = this.store.activeOwner();
    return this.store
      .creditCardPayments()
      .filter((p) => (owner === 'global' || p.owner === owner) && p.date.startsWith(ym))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  colorFor(category: string): string {
    return this.store.colorFor(category);
  }

  fmt(n: number): string {
    return fmt(n);
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }

  togglePay(): void {
    const opening = !this.payOpen();
    this.payOpen.set(opening);
    if (opening) {
      // Préremplit avec le solde dû du profil actif, pour le cas courant
      // "je paie tout ce que je dois" — modifiable si le paiement diffère.
      const balance = this.balance();
      this.payAmount = balance > 0 ? balance : null;
      this.payDate = isoOfDate(new Date());
      this.payNote = '';
    }
  }

  async submitPay(): Promise<void> {
    if (!this.payAmount || this.payAmount <= 0 || !this.payDate) return;
    const owner = this.store.activeOwner();
    if (owner === 'global') {
      this.toast.show('Choisis le profil Moi ou Madame avant d’enregistrer un paiement.');
      return;
    }
    this.saving.set(true);
    const amountPaid = this.payAmount;
    try {
      await this.store.addCreditCardPayment(owner as Owner, this.payAmount, this.payDate, this.payNote);
      this.payOpen.set(false);
      this.payAmount = null;
      this.payNote = '';
      this.toast.show(`✅ Paiement de ${this.fmt(amountPaid)} enregistré.`);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.saving.set(false);
    }
  }

  async removePayment(id: string): Promise<void> {
    try {
      await this.store.removeCreditCardPayment(id);
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  }
}
