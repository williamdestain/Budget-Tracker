import { afterEach, describe, expect, it, vi } from 'vitest';
import { SavingsGoal } from '../models/budget.models';
import { contributedInMonth, goalMonthlyRhythm, goalStatus } from './savings.utils';

function goal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return { id: 'g', name: 'Voyage', targetAmount: 1000, targetDate: null, memberId: 'm1', contributions: [], ...overrides };
}

const c = (date: string, amount: number, id = date + amount) => ({ id, amount, date, note: '' });

describe('savings.utils — évolution et rythme', () => {
  afterEach(() => vi.useRealTimers());

  describe('contributedInMonth', () => {
    it('additionne uniquement le mois demandé', () => {
      const g = goal({ contributions: [c('2026-09-01', 100), c('2026-09-28', 50.25), c('2026-08-31', 999), c('2026-10-01', 999)] });
      expect(contributedInMonth(g, '2026-09')).toBe(150.25);
    });

    it('renvoie 0 sans contribution ce mois-là', () => {
      expect(contributedInMonth(goal({ contributions: [c('2026-08-10', 100)] }), '2026-09')).toBe(0);
      expect(contributedInMonth(goal(), '2026-09')).toBe(0);
    });

    it('arrondit à 2 décimales', () => {
      const g = goal({ contributions: [c('2026-09-01', 0.1), c('2026-09-02', 0.2)] });
      expect(contributedInMonth(g, '2026-09')).toBe(0.3);
    });
  });

  describe('goalMonthlyRhythm', () => {
    const today = '2026-09-29';

    it('null sans contribution', () => {
      expect(goalMonthlyRhythm(goal(), today)).toBeNull();
    });

    it('null quand la première contribution date du mois courant (pas de mois complet)', () => {
      expect(goalMonthlyRhythm(goal({ contributions: [c('2026-09-05', 300)] }), today)).toBeNull();
    });

    it('moyenne sur 3 mois complets, mois courant exclu', () => {
      const g = goal({
        contributions: [c('2026-06-10', 100), c('2026-07-10', 200), c('2026-08-10', 300), c('2026-09-10', 9999)],
      });
      expect(goalMonthlyRhythm(g, today)).toBe(200);
    });

    it("un mois sans contribution compte pour 0 dans la moyenne (rythme irrégulier)", () => {
      const g = goal({ contributions: [c('2026-06-10', 300), c('2026-08-10', 300)] });
      expect(goalMonthlyRhythm(g, today)).toBe(200);
    });

    it("ne dilue pas un objectif récent avec des mois où il n'existait pas", () => {
      // Première contribution en août : la fenêtre ne contient qu'août (1 mois), pas 3.
      const g = goal({ contributions: [c('2026-08-15', 240)] });
      expect(goalMonthlyRhythm(g, today)).toBe(240);
    });

    it('ignore les contributions antérieures à la fenêtre de 3 mois', () => {
      const g = goal({ contributions: [c('2026-01-10', 5000), c('2026-06-10', 30), c('2026-07-10', 30), c('2026-08-10', 30)] });
      expect(goalMonthlyRhythm(g, today)).toBe(30);
    });

    it("franchit correctement le changement d'année", () => {
      const g = goal({ contributions: [c('2025-10-10', 100), c('2025-11-10', 100), c('2025-12-10', 100)] });
      expect(goalMonthlyRhythm(g, '2026-01-15')).toBe(100);
    });
  });

  describe('goalStatus', () => {
    const at = (iso: string) => vi.useFakeTimers().setSystemTime(new Date(`${iso}T12:00:00`));

    it("'reached' même si la date cible est passée", () => {
      at('2026-09-29');
      const s = goalStatus(goal({ targetAmount: 100, targetDate: '2026-01-01', contributions: [c('2026-01-01', 100)] }));
      expect(s).toMatchObject({ kind: 'reached', remaining: 0 });
    });

    it("'overdue' quand la date cible est dépassée et l'objectif non atteint", () => {
      at('2026-09-29');
      const s = goalStatus(goal({ targetDate: '2026-09-01', contributions: [c('2026-08-01', 400)] }));
      expect(s).toMatchObject({ kind: 'overdue', remaining: 600 });
      expect(s.daysLeft).toBeLessThan(0);
    });

    it("'soon' dans les 30 jours, y compris le jour même", () => {
      at('2026-09-29');
      expect(goalStatus(goal({ targetDate: '2026-09-29' })).kind).toBe('soon');
      expect(goalStatus(goal({ targetDate: '2026-10-29' })).kind).toBe('soon');
      expect(goalStatus(goal({ targetDate: '2026-10-30' })).kind).toBe('open');
    });

    it("'open' sans date cible", () => {
      at('2026-09-29');
      expect(goalStatus(goal())).toMatchObject({ kind: 'open', remaining: 1000, daysLeft: null });
    });
  });
});
