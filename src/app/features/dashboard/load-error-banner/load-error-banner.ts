import { Component, computed } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';

// Petit bandeau affiché quand loadAll() a échoué sur au moins une table
// (voir AUDIT_PRODUCTION_V2.md §3.5 et budget-store.service.ts::loadAll).
// Rend visible ce qui était auparavant un échec silencieux : sans ce
// composant, loadError() existerait sur le store mais personne ne le
// lirait jamais, ce qui revient exactement au même bug pour l'utilisateur.
//
// Volontairement minimal : pas de bouton "réessayer" pour l'instant (pas
// demandé, et un retry mal placé pourrait masquer un vrai problème réseau
// répété) — juste rendre l'échec visible plutôt que silencieux.
@Component({
  selector: 'app-load-error-banner',
  imports: [],
  templateUrl: './load-error-banner.html',
  styleUrl: './load-error-banner.scss',
})
export class LoadErrorBanner {
  constructor(public store: BudgetStore) {}

  readonly failedTables = computed(() => this.store.loadError() ?? []);

  readonly visible = computed(() => this.failedTables().length > 0);

  // Traduction affichable des noms techniques de table — pour que le
  // bandeau parle à l'utilisateur plutôt que d'exposer le schéma SQL.
  readonly labels = computed(() =>
    this.failedTables().map((t) => TABLE_LABELS[t] ?? t).join(', '),
  );
}

const TABLE_LABELS: Record<string, string> = {
  expenses: 'dépenses',
  incomes: 'revenus',
  budgets: 'budgets',
  category_budgets: 'budgets par catégorie',
  rollovers: 'reports',
  provisions: 'provisions',
  provision_adjustments: 'ajustements de provisions',
  recurring_expenses: 'dépenses récurrentes',
  savings_goals: "objectifs d'épargne",
  savings_goal_contributions: "contributions d'épargne",
  closed_months: 'mois clôturés',
};
