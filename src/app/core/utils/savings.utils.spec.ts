import { describe, it, expect, vi, afterEach } from 'vitest';
import { goalPot, goalProgressPct, goalReached, goalDaysLeft } from './savings.utils';
import { SavingsGoal } from '../models/budget.models';
import { DST_TIMEZONES, withTimezone } from '../testing/with-timezone';

function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'goal-1',
    name: 'Fonds d’urgence',
    targetAmount: 1000,
    targetDate: null,
    memberId: 'moi',
    contributions: [],
    ...overrides,
  };
}

describe('savings.utils', () => {
  describe('goalPot', () => {
    it('renvoie 0 sans aucun ajout', () => {
      expect(goalPot(makeGoal())).toBe(0);
    });

    it('additionne tous les ajouts', () => {
      const goal = makeGoal({
        contributions: [
          { id: 'c1', amount: 100, date: '2026-07-01', note: '' },
          { id: 'c2', amount: 250, date: '2026-07-15', note: '' },
        ],
      });
      expect(goalPot(goal)).toBe(350);
    });
  });

  describe('goalProgressPct', () => {
    it('renvoie 0% sans ajout', () => {
      expect(goalProgressPct(makeGoal({ targetAmount: 1000 }))).toBe(0);
    });

    it('calcule le pourcentage exact avant d’atteindre la cible', () => {
      const goal = makeGoal({
        targetAmount: 1000,
        contributions: [{ id: 'c1', amount: 250, date: '2026-07-01', note: '' }],
      });
      expect(goalProgressPct(goal)).toBe(25);
    });

    it('plafonne à 100% même si la cagnotte dépasse la cible', () => {
      const goal = makeGoal({
        targetAmount: 1000,
        contributions: [{ id: 'c1', amount: 1500, date: '2026-07-01', note: '' }],
      });
      expect(goalProgressPct(goal)).toBe(100);
    });

    it('renvoie 0 sans diviser par zéro si la cible est à 0', () => {
      const goal = makeGoal({ targetAmount: 0 });
      expect(goalProgressPct(goal)).toBe(0);
    });
  });

  describe('goalReached', () => {
    it('faux tant que la cagnotte est sous la cible', () => {
      const goal = makeGoal({
        targetAmount: 1000,
        contributions: [{ id: 'c1', amount: 999, date: '2026-07-01', note: '' }],
      });
      expect(goalReached(goal)).toBe(false);
    });

    it('vrai pile à la cible (limite incluse)', () => {
      const goal = makeGoal({
        targetAmount: 1000,
        contributions: [{ id: 'c1', amount: 1000, date: '2026-07-01', note: '' }],
      });
      expect(goalReached(goal)).toBe(true);
    });

    it('vrai au-delà de la cible', () => {
      const goal = makeGoal({
        targetAmount: 1000,
        contributions: [{ id: 'c1', amount: 1200, date: '2026-07-01', note: '' }],
      });
      expect(goalReached(goal)).toBe(true);
    });
  });

  describe('goalDaysLeft', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('renvoie null sans date cible', () => {
      expect(goalDaysLeft(makeGoal({ targetDate: null }))).toBeNull();
    });

    it('compte les jours restants jusqu’à une date cible future', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 1)); // 1er juillet 2026
      const goal = makeGoal({ targetDate: '2026-07-11' });
      expect(goalDaysLeft(goal)).toBe(10);
    });

    it('renvoie 0 si la date cible est aujourd’hui', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 1));
      const goal = makeGoal({ targetDate: '2026-07-01' });
      expect(goalDaysLeft(goal)).toBe(0);
    });

    it('renvoie un nombre négatif si la date cible est dépassée', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 15));
      const goal = makeGoal({ targetDate: '2026-07-10' });
      expect(goalDaysLeft(goal)).toBe(-5);
    });

    // goalDaysLeft() compare deux dates locales comme provisionDaysUntilNext()
    // le faisait, mais son Math.round absorbe l'heure perdue/gagnée au
    // changement d'heure (180,96 → 181). Ce test le PROUVE au lieu de le
    // supposer : il verrouille ce comportement si quelqu'un remplace un jour
    // Math.round par Math.floor/ceil.
    describe.each([
      { today: [2026, 0, 1], target: '2026-07-01', days: 181 },
      { today: [2026, 5, 1], target: '2027-01-01', days: 214 },
    ])('du $target, $days jours', ({ today, target, days }) => {
      it.each(DST_TIMEZONES)('donne le même résultat en %s', (tz) => {
        withTimezone(tz, () => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date(today[0], today[1], today[2]));
          expect(goalDaysLeft(makeGoal({ targetDate: target }))).toBe(days);
        });
      });
    });
  });
});
