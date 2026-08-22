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
    ...overrides,
  };
}

describe('income.utils', () => {
  describe('incomeAppliesToMonth — revenu ponctuel', () => {
    it("s'applique au mois exact de sa date", () => {
      const income = makeIncome({ recurring: false, date: '2026-07-15' });
      expect(incomeAppliesToMonth(income, '2026-07')).toBe(true);
    });

    it("ne s'applique à aucun autre mois", () => {
      const income = makeIncome({ recurring: false, date: '2026-07-15' });
      expect(incomeAppliesToMonth(income, '2026-06')).toBe(false);
      expect(incomeAppliesToMonth(income, '2026-08')).toBe(false);
    });
  });

  describe('incomeAppliesToMonth — revenu récurrent', () => {
    it("ne s'applique pas avant le mois de départ", () => {
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'monthly',
        recurringStartMonth: '2026-07',
      });
      expect(incomeAppliesToMonth(income, '2026-06')).toBe(false);
    });

    it('s’applique dès le mois de départ, inclus', () => {
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'monthly',
        recurringStartMonth: '2026-07',
      });
      expect(incomeAppliesToMonth(income, '2026-07')).toBe(true);
    });

    it('continue de s’appliquer indéfiniment après le départ (mensuel/hebdo/etc.)', () => {
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'weekly',
        recurringStartMonth: '2026-01',
      });
      expect(incomeAppliesToMonth(income, '2027-06')).toBe(true);
    });

    it('renvoie faux pour un intervalle récurrent inconnu (garde-fou)', () => {
      const income = makeIncome({
        recurring: true,
        // @ts-expect-error valeur volontairement invalide pour tester le defaut du switch
        recurringInterval: 'yearly',
        recurringStartMonth: '2026-01',
      });
      expect(incomeAppliesToMonth(income, '2026-06')).toBe(false);
    });
  });

  describe('incomeForMonth', () => {
    it('renvoie 0 si le revenu ne s’applique pas à ce mois', () => {
      const income = makeIncome({ recurring: false, date: '2026-07-15' });
      expect(incomeForMonth(income, '2026-08')).toBe(0);
    });

    it('renvoie le montant plein pour un revenu ponctuel', () => {
      const income = makeIncome({ recurring: false, date: '2026-07-15', amount: 500 });
      expect(incomeForMonth(income, '2026-07')).toBe(500);
    });

    it('renvoie le montant plein pour un revenu mensuel', () => {
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'monthly',
        recurringStartMonth: '2026-01',
        amount: 3000,
      });
      expect(incomeForMonth(income, '2026-07')).toBe(3000);
    });

    it('convertit un revenu hebdomadaire en moyenne mensuelle (52/12)', () => {
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'weekly',
        recurringStartMonth: '2026-01',
        amount: 100,
      });
      // 100 * 52 / 12 = 433.33...
      expect(incomeForMonth(income, '2026-07')).toBeCloseTo(433.33, 2);
    });

    it('convertit un revenu bihebdomadaire en moyenne mensuelle (26/12)', () => {
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'biweekly',
        recurringStartMonth: '2026-01',
        amount: 800,
      });
      // 800 * 26 / 12 = 1733.33...
      expect(incomeForMonth(income, '2026-07')).toBeCloseTo(1733.33, 2);
    });

    it('double un revenu bimensuel (2 paies par mois)', () => {
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'semimonthly',
        recurringStartMonth: '2026-01',
        amount: 1500,
      });
      expect(incomeForMonth(income, '2026-07')).toBe(3000);
    });

    it('arrondit à 2 décimales sans dérive flottante visible', () => {
      const income = makeIncome({
        recurring: true,
        recurringInterval: 'weekly',
        recurringStartMonth: '2026-01',
        amount: 333,
      });
      const result = incomeForMonth(income, '2026-07');
      // Vérifie qu'on a bien au plus 2 décimales (pas de 0.30000000000001 etc.)
      expect(Math.round(result * 100) / 100).toBe(result);
    });
  });
});
