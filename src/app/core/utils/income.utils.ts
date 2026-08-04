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

// Retourne vrai si un revenu (récurrent ou ponctuel) s'applique au mois consulté.
export function incomeAppliesToMonth(income: Income, ym: string): boolean {
  if (!income.recurring) {
    // Une seule fois : vérifier la date exacte
    return income.date.slice(0, 7) === ym;
  }
  const [y, m] = ym.split('-').map(Number);
  const [startY, startM] = income.recurringStartMonth.split('-').map(Number);
  const monthsAgo = (y - startY) * 12 + (m - startM);

  if (monthsAgo < 0) return false; // Avant le démarrage

  switch (income.recurringInterval) {
    case 'monthly':
    case 'weekly':
    case 'biweekly':
    case 'semimonthly':
      // Revenu comptabilisé chaque mois où il s'applique
      return true;
    default:
      return false;
  }
}

// Montant effectif d'un revenu pour un mois donné (moyenne mensuelle pour
// les fréquences hebdomadaire/bi-hebdomadaire/bimensuelle).
export function incomeForMonth(income: Income, ym: string): number {
  if (!incomeAppliesToMonth(income, ym)) return 0;

  if (income.recurring && income.recurringInterval === 'biweekly') {
    // 26 paiements par an => 2.167 paiements par mois
    return Math.round((income.amount * 26 * 100) / 12) / 100;
  }
  if (income.recurring && income.recurringInterval === 'semimonthly') {
    // 2 fois par mois = 24 paiements par an => 2 paiements par mois
    return income.amount * 2;
  }
  if (income.recurring && income.recurringInterval === 'weekly') {
    // 52 paiements par an => 4.333 paiements par mois
    return Math.round((income.amount * 52 * 100) / 12) / 100;
  }

  return income.amount; // monthly ou ponctuel
}
