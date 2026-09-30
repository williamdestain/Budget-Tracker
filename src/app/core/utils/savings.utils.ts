import { SavingsGoal } from '../models/budget.models';
import { parseISODate, prevYM } from './date.utils';

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

// --- Écran /epargne : évolution récente et rythme ---------------------------
//
// Décision (29 sept. 2026) : ni « ce mois-ci » ni le rythme ne sont stockés.
// Le plan prévoyait « un petit changement de schéma », mais les deux se
// déduisent des contributions déjà enregistrées ; les stocker créerait une
// seconde source de vérité qui divergerait dès qu'une contribution est
// ajoutée ou supprimée. Voir plan-industrialisation.md (vague B, Épargne).

const ymOfDate = (isoDate: string): string => isoDate.slice(0, 7);

// Somme des contributions datées du mois `ym` ("YYYY-MM") — l'« évolution
// récente » affichée (« +200,00 $ ce mois-ci »).
export function contributedInMonth(g: SavingsGoal, ym: string): number {
  const total = g.contributions
    .filter((c) => ymOfDate(c.date) === ym)
    .reduce((s, c) => s + c.amount, 0);
  return Math.round(total * 100) / 100;
}

// Rythme mensuel moyen : moyenne des contributions sur les (au plus) 3 mois
// COMPLETS précédant le mois courant, sans compter les mois antérieurs à la
// première contribution (sinon un objectif tout neuf serait dilué par des
// mois où il n'existait pas). Le mois courant est exclu : il est incomplet,
// et il est déjà montré à part. `null` = pas encore assez d'historique (aucune
// contribution, ou la première date du mois courant) — à ne pas confondre
// avec 0, qui signifie « des mois complets sans aucune contribution ».
export function goalMonthlyRhythm(g: SavingsGoal, todayIso: string): number | null {
  if (g.contributions.length === 0) return null;
  const firstYM = g.contributions.map((c) => ymOfDate(c.date)).sort()[0];

  const window: string[] = [];
  let ym = ymOfDate(todayIso);
  for (let i = 0; i < 3; i++) {
    ym = prevYM(ym);
    if (ym >= firstYM) window.push(ym);
  }
  if (window.length === 0) return null;

  const total = g.contributions
    .filter((c) => window.includes(ymOfDate(c.date)))
    .reduce((s, c) => s + c.amount, 0);
  return Math.round((total / window.length) * 100) / 100;
}

export type GoalStatusKind = 'reached' | 'overdue' | 'soon' | 'open';

export interface GoalStatus {
  kind: GoalStatusKind;
  remaining: number;
  daysLeft: number | null;
}

// 'soon' = date cible dans les 30 jours ; 'overdue' = date cible dépassée
// et objectif pas atteint. Un objectif atteint reste 'reached' même si sa
// date cible est passée.
export function goalStatus(g: SavingsGoal): GoalStatus {
  const remaining = Math.max(g.targetAmount - goalPot(g), 0);
  const daysLeft = goalDaysLeft(g);
  if (goalReached(g)) return { kind: 'reached', remaining: 0, daysLeft };
  if (daysLeft !== null && daysLeft < 0) return { kind: 'overdue', remaining, daysLeft };
  if (daysLeft !== null && daysLeft <= 30) return { kind: 'soon', remaining, daysLeft };
  return { kind: 'open', remaining, daysLeft };
}
