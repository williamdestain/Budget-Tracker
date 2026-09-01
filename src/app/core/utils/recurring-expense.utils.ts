import { addDays, clampDayToMonth, lastDayOfMonthYM } from './provision.utils';
import { daysBetween } from './date.utils';

// Forme minimale requise pour calculer des échéances — RecurringExpense et
// RecurringIncome partagent tous les deux ces champs, donc occurrencesInMonth
// fonctionne pour les deux sans dupliquer la logique.
export interface Schedulable {
  interval: 'monthly' | 'weekly' | 'biweekly' | 'semimonthly';
  dayOfMonth: number;
  secondDayOfMonth?: number | null;
  startDate?: string | null;
}

export const RECURRING_EXPENSE_INTERVAL_LABELS: Record<string, string> = {
  monthly: 'Chaque mois',
  weekly: 'Chaque semaine',
  biweekly: 'Aux 2 semaines',
  semimonthly: '2x par mois',
};

// Toutes les dates d'échéance (YYYY-MM-DD) d'une dépense récurrente qui
// tombent dans le mois `ym` donné.
//
// - 'monthly'     : une seule échéance, à dayOfMonth (comportement
//                    d'origine, inchangé).
// - 'semimonthly' : deux échéances fixes, dayOfMonth et secondDayOfMonth
//                    (si les deux jours clampés coïncident — ex. mois
//                    court — une seule échéance est renvoyée pour éviter
//                    un doublon).
// - 'weekly'/'biweekly' : calées sur startDate, par pas de 7 ou 14 jours.
//                    Peut renvoyer 0 échéance (mois avant le début du
//                    cycle), ou 2 à 3 selon comment le cycle tombe dans
//                    le mois — c'est le cas qui justifie que
//                    expectedThisMonth() gère plusieurs suggestions pour
//                    un même gabarit.
export function occurrencesInMonth(r: Schedulable, ym: string): string[] {
  switch (r.interval) {
    case 'semimonthly': {
      const d1 = clampDayToMonth(ym, r.dayOfMonth);
      const d2 = clampDayToMonth(ym, r.secondDayOfMonth ?? r.dayOfMonth);
      return d1 === d2 ? [d1] : [d1, d2].sort();
    }
    case 'weekly':
      return occurrencesForStep(r.startDate || `${ym}-01`, 7, ym);
    case 'biweekly':
      return occurrencesForStep(r.startDate || `${ym}-01`, 14, ym);
    case 'monthly':
    default:
      return [clampDayToMonth(ym, r.dayOfMonth)];
  }
}

function occurrencesForStep(anchorISO: string, stepDays: number, ym: string): string[] {
  const monthStart = `${ym}-01`;
  const monthEnd = lastDayOfMonthYM(ym);
  if (monthEnd < anchorISO) return []; // le mois entier précède le début du cycle

  // Nombre de pas à faire depuis l'ancrage pour atteindre (ou dépasser)
  // le début du mois affiché.
  const diffToStart = daysBetween(anchorISO, monthStart);
  const steps = Math.max(0, Math.ceil(diffToStart / stepDays));

  const dates: string[] = [];
  let current = addDays(anchorISO, steps * stepDays);
  while (current <= monthEnd) {
    if (current >= monthStart) dates.push(current);
    current = addDays(current, stepDays);
  }
  return dates;
}
