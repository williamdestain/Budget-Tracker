import { SavingsGoal } from '../models/budget.models';
import { parseISODate } from './date.utils';

// Cagnotte actuelle = somme de tous les ajouts ponctuels. Pas de notion de
// "dépensé" ici (contrairement aux provisions) : un objectif d'épargne ne
// finance pas une facture précise, il accumule vers une cible.
export function goalPot(g: SavingsGoal): number {
  return g.contributions.reduce((s, c) => s + c.amount, 0);
}

export function goalProgressPct(g: SavingsGoal): number {
  if (g.targetAmount <= 0) return 0;
  return Math.min((goalPot(g) / g.targetAmount) * 100, 100);
}

export function goalReached(g: SavingsGoal): boolean {
  return goalPot(g) >= g.targetAmount;
}

// Jours restants avant la date cible (négatif si dépassée). Null si pas de
// date cible définie — l'objectif n'a alors aucune contrainte de temps.
export function goalDaysLeft(g: SavingsGoal): number | null {
  if (!g.targetDate) return null;
  const target = parseISODate(g.targetDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
