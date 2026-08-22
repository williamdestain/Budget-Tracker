import { Component, computed } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmt } from '../../../core/utils/currency.utils';

export type PulseSeverity = 'ok' | 'warn' | 'critical';

export interface PulseData {
  severity: PulseSeverity;
  icon: string;
  headline: string;
  sub: string | null;
  perDayText: string | null;
}

// Carte de synthèse en tête de dashboard : condense remainingBudget(),
// remainingBudgetPerDay() et les 2 pires smartAlerts() en une seule
// réponse à "où en suis-je / combien puis-je encore dépenser ?", plutôt
// que de laisser l'utilisateur recomposer l'info lui-même à partir de
// cartes séparées plus bas dans la page.
//
// Toute la logique métier (ce qui est déjà dépensé, ce qui reste à
// dépenser en récurrents/provisions, le "par jour") vit dans BudgetStore
// — ce composant se contente de formuler le résultat en phrases. Voir
// budget-tracker-positionnement-et-roadmap.md pour l'historique complet
// de ces décisions (remainingBudget vs safeToSpend, non-double-comptage,
// collision provision/récurrent).
@Component({
  selector: 'app-money-pulse',
  imports: [],
  templateUrl: './money-pulse.html',
  styleUrl: './money-pulse.scss',
})
export class MoneyPulse {
  constructor(public store: BudgetStore) {}

  fmt(n: number): string {
    return fmt(n);
  }

  // Les 2 alertes les plus graves (déjà triées par gravité dans le
  // store) — un sous-ensemble de app-smart-alerts, pas un doublon complet.
  readonly topAlerts = computed(() => this.store.smartAlerts().slice(0, 2));

  readonly pulse = computed<PulseData>(() => {
    const rb = this.store.remainingBudget();
    const perDay = this.store.remainingBudgetPerDay();
    // remainingBudgetPerDay() n'est non-null que pour le mois réel en
    // cours (voir sa garde dans le store) — on s'en sert aussi pour
    // distinguer le libellé "encore" (mois en cours) du libellé neutre
    // (mois passé/futur consulté), sans dupliquer cette logique de date.
    const isCurrentMonth = perDay !== null || this.store.monthForecast() !== null;

    // Sévérité basée sur la part du budget déjà engagée (dépensée +
    // récurrents à venir + provisions à financer), pas seulement sur ce
    // qui a été réellement dépensé — même seuil (80%) que le reste de
    // l'app (budget-progress, smartAlerts) pour rester cohérent.
    const committed = rb.spent + rb.recurringRemaining + rb.provisionsRemaining;
    const pct = rb.budget > 0 ? (committed / rb.budget) * 100 : committed > 0 ? 100 : 0;

    let severity: PulseSeverity;
    if (rb.amount < 0) {
      severity = 'critical';
    } else if (pct >= 80) {
      severity = 'warn';
    } else {
      severity = 'ok';
    }
    const icon = severity === 'critical' ? '🔴' : severity === 'warn' ? '⚠️' : '🟢';

    const headline = isCurrentMonth
      ? `Tu peux encore dépenser ${fmt(rb.amount)} ce mois-ci.`
      : `Disponible dans le budget : ${fmt(rb.amount)}.`;

    // N'explique que les composantes non nulles — pas de "0 $ de
    // récurrents à venir" qui n'apporte rien.
    const parts: string[] = [];
    if (rb.recurringRemaining > 0) {
      parts.push(`${fmt(rb.recurringRemaining)} de dépenses récurrentes à venir`);
    }
    if (rb.provisionsRemaining > 0) {
      parts.push(`${fmt(rb.provisionsRemaining)} de provisions à financer`);
    }
    const sub = parts.length > 0 ? `Après ${parts.join(' et ')}.` : null;

    const perDayText = perDay !== null ? `Environ ${fmt(perDay)}/jour jusqu'à la fin du mois.` : null;

    return { severity, icon, headline, sub, perDayText };
  });
}
