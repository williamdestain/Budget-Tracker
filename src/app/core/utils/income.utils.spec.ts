import { describe, it, expect } from 'vitest';
import { incomeAppliesToMonth, incomeForMonth } from './income.utils';
import { Income } from '../models/budget.models';

function makeIncome(overrides: Partial<Income> = {}): Income {
  return {
    id: 'inc-1',
    amount: 1000,
    type: 'Salaire',
    date: '2026-07-15',
    owner: 'moi',
    note: '',
    recurring: false,
    recurringInterval: 'once',
    recurringStartMonth: '2026-07',
    recurringSourceId: null,
    ...overrides,
  };
}

// Depuis le passage aux revenus récurrents "façon dépenses récurrentes"
// (voir RecurringIncome dans budget.models.ts), un revenu récurrent n'est
// plus un seul modèle compté en moyenne mensuelle dans chaque mois : c'est
// une vraie occurrence datée, générée automatiquement par
// syncRecurringIncomes() (voir budget-store.service.ts), exactement comme
// une dépense. `incomeAppliesToMonth`/`incomeForMonth` n'ont donc plus
// besoin de connaître `recurring`/`recurringInterval` du tout — seule la
// date compte, que le revenu soit ponctuel ou une paie générée.
describe('income.utils', () => {
  describe('incomeAppliesToMonth', () => {
    it("s'applique au mois exact de sa date", () => {
      const income = makeIncome({ recurring: false, date: '2026-07-15' });
      expect(incomeAppliesToMonth(income, '2026-07')).toBe(true);
    });

    it("ne s'applique à aucun autre mois", () => {
      const income = makeIncome({ recurring: false, date: '2026-07-15' });
      expect(incomeAppliesToMonth(income, '2026-06')).toBe(false);
      expect(incomeAppliesToMonth(income, '2026-08')).toBe(false);
    });

    it('une occurrence générée par un modèle récurrent ne s’applique QUE au mois de sa propre date, pas indéfiniment', () => {
      // Chaque paie est sa propre ligne : contrairement à l'ancien système,
      // une seule occurrence ne "s'applique" plus à tous les mois suivants.
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'weekly',
        recurringSourceId: 'rec-1',
        date: '2026-03-06',
      });
      expect(incomeAppliesToMonth(income, '2026-03')).toBe(true);
      expect(incomeAppliesToMonth(income, '2026-04')).toBe(false);
      expect(incomeAppliesToMonth(income, '2027-06')).toBe(false);
    });
  });

  describe('incomeForMonth', () => {
    it('renvoie 0 si le revenu ne s’applique pas à ce mois', () => {
      const income = makeIncome({ date: '2026-07-15' });
      expect(incomeForMonth(income, '2026-08')).toBe(0);
    });

    it('renvoie le montant plein (jamais de moyenne) pour un revenu ponctuel', () => {
      const income = makeIncome({ recurring: false, date: '2026-07-15', amount: 500 });
      expect(incomeForMonth(income, '2026-07')).toBe(500);
    });

    it('renvoie le montant plein (jamais de moyenne) pour une occurrence générée par un modèle récurrent', () => {
      // Chaque paie porte son propre montant réel — modifiable
      // individuellement (voir updateIncome) sans affecter le modèle ni
      // les autres occurrences. Plus de conversion hebdo/bihebdo/bimensuel
      // en moyenne mensuelle : c'est le modèle RecurringIncome (voir
      // occurrencesInMonth dans recurring-expense.utils.ts) qui décide
      // QUAND générer les paies, pas incomeForMonth qui décide COMBIEN
      // compter par mois.
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'biweekly',
        recurringSourceId: 'rec-1',
        date: '2026-07-10',
        amount: 800,
      });
      expect(incomeForMonth(income, '2026-07')).toBe(800);
    });
  });
});
