import { describe, it, expect } from 'vitest';
import { occurrencesInMonth } from './recurring-expense.utils';
import { RecurringExpense } from '../models/budget.models';

function makeRecurring(overrides: Partial<RecurringExpense> = {}): RecurringExpense {
  return {
    id: 'r1',
    name: 'Test',
    amount: 100,
    category: 'Autre',
    owner: 'moi',
    interval: 'monthly',
    dayOfMonth: 15,
    secondDayOfMonth: null,
    startDate: null,
    cc: false,
    active: true,
    ...overrides,
  };
}

describe('occurrencesInMonth()', () => {
  describe('monthly', () => {
    it('renvoie une seule occurrence, au dayOfMonth', () => {
      const r = makeRecurring({ interval: 'monthly', dayOfMonth: 5 });
      expect(occurrencesInMonth(r, '2026-07')).toEqual(['2026-07-05']);
    });

    it('ramène au dernier jour du mois si dayOfMonth le dépasse (ex. 31 en février)', () => {
      const r = makeRecurring({ interval: 'monthly', dayOfMonth: 31 });
      expect(occurrencesInMonth(r, '2026-02')).toEqual(['2026-02-28']);
    });
  });

  describe('semimonthly', () => {
    it('renvoie les deux jours configurés, triés', () => {
      const r = makeRecurring({ interval: 'semimonthly', dayOfMonth: 20, secondDayOfMonth: 5 });
      expect(occurrencesInMonth(r, '2026-07')).toEqual(['2026-07-05', '2026-07-20']);
    });

    it('ne renvoie qu’une seule date si les deux jours clampés coïncident (mois court)', () => {
      const r = makeRecurring({ interval: 'semimonthly', dayOfMonth: 30, secondDayOfMonth: 31 });
      // Février n'a que 28 jours en 2026 : les deux jours sont ramenés au 28.
      expect(occurrencesInMonth(r, '2026-02')).toEqual(['2026-02-28']);
    });

    it('retombe sur dayOfMonth si secondDayOfMonth est absent (rétrocompatibilité)', () => {
      const r = makeRecurring({ interval: 'semimonthly', dayOfMonth: 10, secondDayOfMonth: null });
      expect(occurrencesInMonth(r, '2026-07')).toEqual(['2026-07-10']);
    });
  });

  describe('biweekly', () => {
    it('renvoie toutes les échéances de 14 jours en 14 jours qui tombent dans le mois', () => {
      const r = makeRecurring({ interval: 'biweekly', startDate: '2026-07-03' });
      // 03, 17, 31 juillet — trois échéances possibles selon le calage.
      expect(occurrencesInMonth(r, '2026-07')).toEqual(['2026-07-03', '2026-07-17', '2026-07-31']);
    });

    it('renvoie un tableau vide si le mois précède entièrement le début du cycle', () => {
      const r = makeRecurring({ interval: 'biweekly', startDate: '2026-08-01' });
      expect(occurrencesInMonth(r, '2026-07')).toEqual([]);
    });

    it('continue de calculer correctement à cheval sur deux mois consécutifs', () => {
      const r = makeRecurring({ interval: 'biweekly', startDate: '2026-07-03' });
      const july = occurrencesInMonth(r, '2026-07');
      const august = occurrencesInMonth(r, '2026-08');
      // La dernière échéance de juillet (31) + 14 jours = 14 août.
      expect(july.at(-1)).toBe('2026-07-31');
      expect(august[0]).toBe('2026-08-14');
    });

    it('gère un ancrage postérieur au début du mois affiché (première échéance en cours de mois)', () => {
      const r = makeRecurring({ interval: 'biweekly', startDate: '2026-07-20' });
      expect(occurrencesInMonth(r, '2026-07')).toEqual(['2026-07-20']);
    });
  });

  describe('weekly', () => {
    it('renvoie toutes les échéances hebdomadaires du mois', () => {
      const r = makeRecurring({ interval: 'weekly', startDate: '2026-07-01' });
      expect(occurrencesInMonth(r, '2026-07')).toEqual([
        '2026-07-01', '2026-07-08', '2026-07-15', '2026-07-22', '2026-07-29',
      ]);
    });
  });
});
