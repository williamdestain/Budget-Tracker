import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { MoneyPulse } from './money-pulse';
import { BudgetStore, SmartAlert, RemainingBudget } from '../../../core/services/budget-store.service';

// Tests unitaires du composant en isolation : on injecte un faux
// BudgetStore (simples fonctions renvoyant des valeurs fixes, comme le
// ferait un computed signal une fois lu) plutôt que le BudgetStore réel.
// La logique métier de remainingBudget()/remainingBudgetPerDay()/
// smartAlerts() est déjà couverte par budget-store.service.spec.ts —
// ici on vérifie uniquement que MoneyPulse compose correctement CES
// signaux, sans dépendre de la date réelle du jour.

interface FakeStoreConfig {
  remainingBudget: RemainingBudget;
  remainingBudgetPerDay?: number | null;
  // monthForecast() sert uniquement de repère "mois réel en cours" pour
  // le libellé — sa forme complète n'importe pas ici.
  isCurrentMonth?: boolean;
  alerts?: SmartAlert[];
}

function makeFakeStore(cfg: FakeStoreConfig) {
  return {
    remainingBudget: () => cfg.remainingBudget,
    remainingBudgetPerDay: () => cfg.remainingBudgetPerDay ?? null,
    monthForecast: () => (cfg.isCurrentMonth ? {} : null),
    smartAlerts: () => cfg.alerts ?? [],
  } as unknown as BudgetStore;
}

function createComponent(cfg: FakeStoreConfig): MoneyPulse {
  TestBed.configureTestingModule({
    providers: [{ provide: BudgetStore, useValue: makeFakeStore(cfg) }],
  });
  return TestBed.createComponent(MoneyPulse).componentInstance;
}

function rb(overrides: Partial<RemainingBudget>): RemainingBudget {
  return {
    amount: 0,
    budget: 0,
    spent: 0,
    recurringRemaining: 0,
    provisionsRemaining: 0,
    ...overrides,
  };
}

describe('MoneyPulse', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('pulse() — sévérité', () => {
    it('est "ok" (🟢) quand moins de 80% du budget est engagé', () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: 3900, budget: 5800, spent: 1200, recurringRemaining: 400, provisionsRemaining: 300 }),
        remainingBudgetPerDay: 130,
        isCurrentMonth: true,
      });

      const p = comp.pulse();
      expect(p.severity).toBe('ok');
      expect(p.icon).toBe('🟢');
    });

    it('est "warn" (⚠️) quand 80% ou plus du budget est déjà engagé (dépensé + à venir)', () => {
      // committed = 3000 + 700 + 500 = 4200, budget = 5000 -> 84%
      const comp = createComponent({
        remainingBudget: rb({ amount: 800, budget: 5000, spent: 3000, recurringRemaining: 700, provisionsRemaining: 500 }),
        remainingBudgetPerDay: 53,
        isCurrentMonth: true,
      });

      const p = comp.pulse();
      expect(p.severity).toBe('warn');
      expect(p.icon).toBe('⚠️');
    });

    it('est "critical" (🔴) quand remainingBudget.amount est négatif', () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: -300, budget: 3000, spent: 2000, recurringRemaining: 800, provisionsRemaining: 500 }),
        remainingBudgetPerDay: -20,
        isCurrentMonth: true,
      });

      const p = comp.pulse();
      expect(p.severity).toBe('critical');
      expect(p.icon).toBe('🔴');
    });

    it('gère budget=0 avec du committed sans diviser par zéro (pct forcé à 100)', () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: -50, budget: 0, spent: 50, recurringRemaining: 0, provisionsRemaining: 0 }),
        isCurrentMonth: true,
      });

      expect(comp.pulse().severity).toBe('critical'); // amount < 0 suffit de toute façon
    });
  });

  describe('pulse() — headline selon le mois affiché', () => {
    it('mois réel en cours : "Tu peux encore dépenser..."', () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: 1380, budget: 5800 }),
        remainingBudgetPerDay: 92,
        isCurrentMonth: true,
      });

      expect(comp.pulse().headline).toContain('encore dépenser');
      expect(comp.pulse().headline).toContain('1');
    });

    it('mois passé/futur : libellé neutre, pas de "par jour"', () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: 450, budget: 3000 }),
        remainingBudgetPerDay: null,
        isCurrentMonth: false,
      });

      const p = comp.pulse();
      expect(p.headline).toContain('Disponible dans le budget');
      expect(p.headline).not.toContain('encore');
      expect(p.perDayText).toBeNull();
    });
  });

  describe('pulse() — sub (explication de la composition)', () => {
    it('mentionne récurrents et provisions quand ils sont non nuls', () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: 1150, budget: 4000, spent: 2100, recurringRemaining: 450, provisionsRemaining: 300 }),
        remainingBudgetPerDay: 77,
        isCurrentMonth: true,
      });

      const sub = comp.pulse().sub;
      expect(sub).toContain('450');
      expect(sub).toContain('récurrentes');
      expect(sub).toContain('300');
      expect(sub).toContain('provisions');
    });

    it('sub est null quand récurrents ET provisions sont à zéro', () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: 2500, budget: 3000, spent: 500, recurringRemaining: 0, provisionsRemaining: 0 }),
        remainingBudgetPerDay: 166,
        isCurrentMonth: true,
      });

      expect(comp.pulse().sub).toBeNull();
    });

    it("n'inclut pas la composante récurrents dans le texte quand elle est à zéro (mais provisions oui)", () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: 2700, budget: 3000, spent: 300, recurringRemaining: 0, provisionsRemaining: 300 }),
        remainingBudgetPerDay: 90,
        isCurrentMonth: true,
      });

      const sub = comp.pulse().sub;
      expect(sub).not.toContain('récurrentes');
      expect(sub).toContain('provisions');
    });
  });

  describe('pulse() — perDayText', () => {
    it('reprend directement remainingBudgetPerDay() sans le recalculer', () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: 1380, budget: 5800 }),
        remainingBudgetPerDay: 92,
        isCurrentMonth: true,
      });

      expect(comp.pulse().perDayText).toContain('92');
    });

    it('est null quand remainingBudgetPerDay() est null (dernier jour du mois)', () => {
      const comp = createComponent({
        remainingBudget: rb({ amount: 200, budget: 3000 }),
        remainingBudgetPerDay: null,
        isCurrentMonth: true,
      });

      expect(comp.pulse().perDayText).toBeNull();
    });
  });

  describe('topAlerts()', () => {
    it('ne garde que les 2 premières alertes du store (déjà triées par gravité)', () => {
      const alerts: SmartAlert[] = [
        { severity: 'critical', icon: '🔴', message: 'A' },
        { severity: 'warning', icon: '⚠️', message: 'B' },
        { severity: 'info', icon: 'ℹ️', message: 'C' },
      ];
      const comp = createComponent({ remainingBudget: rb({}), alerts });

      expect(comp.topAlerts()).toHaveLength(2);
      expect(comp.topAlerts().map((a) => a.message)).toEqual(['A', 'B']);
    });

    it("renvoie un tableau vide quand le store n'a aucune alerte", () => {
      const comp = createComponent({ remainingBudget: rb({}), alerts: [] });
      expect(comp.topAlerts()).toEqual([]);
    });
  });
});
