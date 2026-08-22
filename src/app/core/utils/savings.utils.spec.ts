import { describe, it, expect, vi, afterEach } from 'vitest';
import { goalPot, goalProgressPct, goalReached, goalDaysLeft } from './savings.utils';
import { SavingsGoal } from '../models/budget.models';

function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'goal-1',
    name: 'Fonds d’urgence',
    targetAmount: 1000,
    targetDate: null,
    owner: 'moi',
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
  });
});
