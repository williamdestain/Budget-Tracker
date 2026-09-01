import { Income } from '../models/budget.models';

export const INCOME_TYPE_LABELS: Record<string, string> = {
  Salaire: '💼 Salaire',
  Remboursement: '💰 Remboursement',
  Allocation: '📋 Allocation',
  Bonus: '🎁 Bonus',
  Report: '📅 Report',
  Ajustement: '⚙️ Ajustement',
  Autre: '📌 Autre',
};

export const RECURRING_INTERVAL_LABELS: Record<string, string> = {
  once: 'Une seule fois',
  weekly: 'Chaque semaine',
  biweekly: 'Aux 2 semaines',
  semimonthly: '2x par mois',
  monthly: 'Chaque mois',
};

// Retourne vrai si un revenu (occurrence générée ou ponctuel) tombe dans le
// mois consulté. Depuis le passage aux revenus récurrents "à la RecurringExpense"
// (voir RecurringIncome dans budget.models.ts), un revenu récurrent est une
// vraie ligne datée comme les autres : plus de moyenne mensuelle, on compare
// juste la date, exactement comme pour une dépense.
export function incomeAppliesToMonth(income: Income, ym: string): boolean {
  return income.date.slice(0, 7) === ym;
}

// Montant effectif d'un revenu pour un mois donné. Chaque occurrence porte
// déjà son propre montant réel (modifiable individuellement) — plus de
// calcul de moyenne ici.
export function incomeForMonth(income: Income, ym: string): number {
  return incomeAppliesToMonth(income, ym) ? income.amount : 0;
}
