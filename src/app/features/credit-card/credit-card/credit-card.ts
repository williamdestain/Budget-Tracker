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

  // Total combiné (Moi + Madame), affiché en plus du récap du profil
  // actif — demandé par un utilisateur pour voir le total de toutes les
  // cartes sans devoir basculer sur l'onglet Global (qui remplacerait la
  // vue par profil au lieu de s'y ajouter). Indépendant de activeOwner().
  //
  // Additionne les CHARGES (achats mis sur la carte, cc=true, hors
  // Versement/Remboursement) ET les REMBOURSEMENTS (catégorie dédiée) —
  // pas seulement les charges. Un utilisateur a signalé, avec des
  // chiffres précis (207,88 $ de charges + 24,45 $ de remboursement =
  // 232,33 $ attendus), que ce total doit refléter TOUT ce qui a
  // transité par une carte ce mois-ci, remboursement compris — pas
  // seulement les nouvelles charges pas encore remboursées.
  readonly totalAllOwners = computed(() => {
    const ym = this.store.current();
    return this.store
      .expenses()
      .filter((e) => e.date.startsWith(ym))
      .filter(
        (e) =>
          (e.cc && e.category !== 'Versement' && e.category !== 'Remboursement Carte Crédit') ||
          e.category === 'Remboursement Carte Crédit',
      )
      .reduce((s, e) => s + e.amount, 0);
  });

  // Toujours affichée maintenant : contrairement à avant, ce total inclut
  // les remboursements en plus des charges, donc il diffère de "Chargé ce
  // mois" (qui ne montre que les charges) même en vue Global.
  get showCombinedTotal(): boolean {
    return true;
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
