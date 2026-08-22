import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  provisionUnit,
  clampDayToMonth,
  provisionStart,
  provisionStartYM,
  effectiveProvisionAmount,
  provisionAdjustmentTotal,
  provisionSpent,
  provisionPot,
  provisionNextHit,
  isHitMonth,
  provisionDaysUntilNext,
  provisionDueAlert,
  provisionedCategories,
  countedExpenses,
} from './provision.utils';
import { Expense, Provision } from '../models/budget.models';

function makeProvision(overrides: Partial<Provision> = {}): Provision {
  return {
    id: 'prov-1',
    name: 'Électricité',
    amount: 600,
    everyN: 3,
    intervalUnit: 'months',
    startYM: '2026-01',
    startDate: '',
    category: 'Électricité',
    owner: 'moi',
    autoRecalibrate: true,
    allocationPercent: 0,
    rollingCount: 0,
    adjustments: [],
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    amount: 100,
    category: 'Électricité',
    date: '2026-01-15',
    owner: 'moi',
    cc: false,
    ...overrides,
  };
}

describe('provision.utils', () => {
  describe('provisionUnit', () => {
    it('renvoie "months" par défaut', () => {
      expect(provisionUnit(makeProvision({ intervalUnit: 'months' }))).toBe('months');
    });

    it('renvoie "days" si configuré ainsi', () => {
      expect(provisionUnit(makeProvision({ intervalUnit: 'days' }))).toBe('days');
    });
  });

  describe('clampDayToMonth', () => {
    it('garde un jour valide inchangé', () => {
      expect(clampDayToMonth('2026-07', 15)).toBe('2026-07-15');
    });

    it('ramène au dernier jour du mois si le jour dépasse (ex. 31 en février)', () => {
      expect(clampDayToMonth('2026-02', 31)).toBe('2026-02-28');
    });

    it('gère une année bissextile', () => {
      expect(clampDayToMonth('2028-02', 31)).toBe('2028-02-29');
    });

    it('ramène au minimum 1 si le jour est ≤ 0', () => {
      expect(clampDayToMonth('2026-07', 0)).toBe('2026-07-01');
    });
  });

  describe('provisionStart / provisionStartYM', () => {
    it('utilise startYM pour une provision mensuelle', () => {
      const p = makeProvision({ intervalUnit: 'months', startYM: '2026-03' });
      expect(provisionStart(p)).toBe('2026-03-01');
      expect(provisionStartYM(p)).toBe('2026-03');
    });

    it('utilise startDate pour une provision en jours', () => {
      const p = makeProvision({ intervalUnit: 'days', startDate: '2026-03-15' });
      expect(provisionStart(p)).toBe('2026-03-15');
      expect(provisionStartYM(p)).toBe('2026-03');
    });
  });

  describe('effectiveProvisionAmount', () => {
    it('renvoie le montant fixe si rollingCount est à 0 (comportement par défaut)', () => {
      const p = makeProvision({ amount: 600, rollingCount: 0 });
      expect(effectiveProvisionAmount(p, [])).toBe(600);
    });

    it('renvoie le montant fixe si aucune facture récente à moyenner', () => {
      const p = makeProvision({ amount: 600, rollingCount: 3 });
      expect(effectiveProvisionAmount(p, [])).toBe(600);
    });

    it('calcule la moyenne des N dernières factures de la catégorie', () => {
      const p = makeProvision({ category: 'Électricité', owner: 'moi', rollingCount: 3 });
      const expenses = [
        makeExpense({ id: 'e1', amount: 100, date: '2026-01-10' }),
        makeExpense({ id: 'e2', amount: 200, date: '2026-02-10' }),
        makeExpense({ id: 'e3', amount: 300, date: '2026-03-10' }),
      ];
      // moyenne des 3 dernières = (100+200+300)/3 = 200
      expect(effectiveProvisionAmount(p, expenses)).toBe(200);
    });

    it('ignore les dépenses d’une autre catégorie ou d’un autre profil', () => {
      const p = makeProvision({ category: 'Électricité', owner: 'moi', rollingCount: 2 });
      const expenses = [
        makeExpense({ id: 'e1', amount: 100, category: 'Électricité', owner: 'moi', date: '2026-01-10' }),
        makeExpense({ id: 'e2', amount: 999, category: 'Courses', owner: 'moi', date: '2026-01-11' }),
        makeExpense({ id: 'e3', amount: 999, category: 'Électricité', owner: 'madame', date: '2026-01-12' }),
      ];
      expect(effectiveProvisionAmount(p, expenses)).toBe(100);
    });
  });

  describe('provisionAdjustmentTotal', () => {
    it('additionne tous les ajouts jusqu’à la fin du mois consulté (cumulatif)', () => {
      const p = makeProvision({
        adjustments: [
          { id: 'a1', amount: 50, date: '2026-01-10', note: '' },
          { id: 'a2', amount: 75, date: '2026-02-10', note: '' },
          { id: 'a3', amount: 999, date: '2026-03-05', note: '' }, // après le mois consulté
        ],
      });
      expect(provisionAdjustmentTotal(p, '2026-02')).toBe(125);
    });
  });

  describe('provisionSpent', () => {
    it('somme les dépenses réelles de la catégorie depuis le début du cycle', () => {
      const p = makeProvision({ category: 'Électricité', owner: 'moi', startYM: '2026-01' });
      const expenses = [
        makeExpense({ id: 'e1', amount: 100, date: '2026-01-15' }),
        makeExpense({ id: 'e2', amount: 150, date: '2026-02-15' }),
        makeExpense({ id: 'e3', amount: 999, date: '2026-04-15' }), // hors période consultée
      ];
      expect(provisionSpent(p, '2026-02', expenses)).toBe(250);
    });

    it('ne compte rien avant le début du cycle', () => {
      const p = makeProvision({ category: 'Électricité', owner: 'moi', startYM: '2026-03' });
      const expenses = [makeExpense({ amount: 100, date: '2026-01-15' })];
      expect(provisionSpent(p, '2026-06', expenses)).toBe(0);
    });
  });

  describe('provisionPot', () => {
    it('= ajouts manuels − dépenses réelles (peut être négatif)', () => {
      const p = makeProvision({
        category: 'Électricité',
        owner: 'moi',
        startYM: '2026-01',
        adjustments: [{ id: 'a1', amount: 50, date: '2026-01-05', note: '' }],
      });
      const expenses = [makeExpense({ amount: 80, date: '2026-01-15' })];
      expect(provisionPot(p, '2026-01', expenses)).toBe(-30);
    });

    it('est positive quand les ajouts dépassent les dépenses', () => {
      const p = makeProvision({
        category: 'Électricité',
        owner: 'moi',
        startYM: '2026-01',
        adjustments: [{ id: 'a1', amount: 200, date: '2026-01-05', note: '' }],
      });
      expect(provisionPot(p, '2026-01', [])).toBe(200);
    });
  });

  describe('provisionNextHit — intervalle en mois', () => {
    it('renvoie le mois de départ tel quel si on consulte un mois avant le début du cycle', () => {
      const p = makeProvision({ startYM: '2026-06', everyN: 3 });
      expect(provisionNextHit(p, '2026-01')).toBe('2026-06');
    });

    it('saute toujours au PROCHAIN cycle, jamais celui en cours (même si le mois consulté est lui-même une échéance)', () => {
      const p = makeProvision({ startYM: '2026-01', everyN: 3 });
      // Échéances : janvier, avril, juillet...
      // Consulter janvier (une échéance) renvoie la suivante (avril), pas janvier.
      expect(provisionNextHit(p, '2026-01')).toBe('2026-04');
      // Consulter février (entre deux échéances) renvoie aussi avril.
      expect(provisionNextHit(p, '2026-02')).toBe('2026-04');
      // Consulter avril (une échéance) saute à juillet, pas avril.
      expect(provisionNextHit(p, '2026-04')).toBe('2026-07');
      expect(provisionNextHit(p, '2026-05')).toBe('2026-07');
    });
  });

  describe('isHitMonth — intervalle en mois', () => {
    it('vrai pile sur les mois d’échéance', () => {
      const p = makeProvision({ startYM: '2026-01', everyN: 3 });
      expect(isHitMonth(p, '2026-01')).toBe(true);
      expect(isHitMonth(p, '2026-04')).toBe(true);
      expect(isHitMonth(p, '2026-07')).toBe(true);
    });

    it('faux entre deux échéances', () => {
      const p = makeProvision({ startYM: '2026-01', everyN: 3 });
      expect(isHitMonth(p, '2026-02')).toBe(false);
      expect(isHitMonth(p, '2026-03')).toBe(false);
    });

    it('faux avant le début du cycle', () => {
      const p = makeProvision({ startYM: '2026-06', everyN: 3 });
      expect(isHitMonth(p, '2026-01')).toBe(false);
    });
  });

  describe('provisionDaysUntilNext', () => {
    afterEach(() => vi.useRealTimers());

    it('compte les jours jusqu’à la prochaine échéance depuis aujourd’hui, pour le mois en cours', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 1)); // 1er juin 2026 == mois consulté
      const p = makeProvision({ startYM: '2026-01', everyN: 6 }); // prochaine échéance : juillet
      expect(provisionDaysUntilNext(p, '2026-06')).toBe(30);
    });

    it('se base sur la fin du mois consulté si ce n’est pas le mois en cours', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1)); // "aujourd'hui" = janvier, mais on consulte juin
      const p = makeProvision({ startYM: '2026-01', everyN: 6 }); // échéance juillet
      // Référence = fin juin (30 juin) ; échéance = 1er juillet => 1 jour
      expect(provisionDaysUntilNext(p, '2026-06')).toBe(1);
    });
  });

  describe('provisionDueAlert', () => {
    afterEach(() => vi.useRealTimers());

    it('renvoie null si la cagnotte couvre déjà la cible', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1));
      const p = makeProvision({
        amount: 100,
        startYM: '2026-01',
        everyN: 3,
        adjustments: [{ id: 'a1', amount: 100, date: '2026-01-01', note: '' }],
      });
      expect(provisionDueAlert(p, '2026-01', [])).toBeNull();
    });

    // ⚠️ DÉCOUVERTE en écrivant ce test (pas un choix de conception
    // volontaire documenté ailleurs) : le type d'alerte "overdue" semble
    // inatteignable avec l'implémentation actuelle de provisionNextHit /
    // provisionReferenceDate. provisionNextHit renvoie toujours une date
    // ≥ à la fin du mois consulté, et provisionReferenceDate ne dépasse
    // jamais cette même borne (elle vaut soit "aujourd'hui" si le mois
    // consulté est le mois réel en cours — auquel cas "aujourd'hui" est
    // par définition dans ce mois, donc avant la prochaine échéance —,
    // soit la fin du mois consulté sinon). Testé ici avec un écart de 10
    // ans entre le mois consulté et la date système réelle : toujours
    // "soon", jamais "overdue". À signaler comme bug applicatif potentiel
    // (voir REVIEW_ARCHITECTURE_ET_PLAN_REFACTORING.md) plutôt qu'à
    // "corriger" silencieusement ici.
    it('ne renvoie JAMAIS de type "overdue" avec l’implémentation actuelle, même avec un écart de 10 ans (comportement actuel documenté, probable bug)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2030, 0, 1)); // "aujourd'hui" réel très loin dans le futur
      const p = makeProvision({ amount: 100, startYM: '2020-01', everyN: 1 }); // mensuel
      const alert = provisionDueAlert(p, '2020-01', []); // mois consulté très ancien
      expect(alert?.type).not.toBe('overdue');
      expect(alert?.type).toBe('soon');
    });

    it('renvoie une alerte "soon" si l’échéance approche (≤ 7 jours) et la cible non atteinte', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 28)); // 28 juin
      const p = makeProvision({ amount: 100, startYM: '2026-01', everyN: 6 }); // prochaine échéance juillet
      const alert = provisionDueAlert(p, '2026-06', []);
      expect(alert?.type).toBe('soon');
    });

    it('ne renvoie aucune alerte si l’échéance est encore loin', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1));
      const p = makeProvision({ amount: 100, startYM: '2026-01', everyN: 6 }); // prochaine échéance juillet
      expect(provisionDueAlert(p, '2026-01', [])).toBeNull();
    });
  });

  describe('provisionedCategories', () => {
    it('renvoie les catégories des provisions d’un profil donné', () => {
      const provisions = [
        makeProvision({ category: 'Électricité', owner: 'moi' }),
        makeProvision({ category: 'Assurance', owner: 'madame' }),
      ];
      expect(provisionedCategories(provisions, 'moi')).toEqual(new Set(['Électricité']));
    });

    it('renvoie toutes les catégories en vue Global', () => {
      const provisions = [
        makeProvision({ category: 'Électricité', owner: 'moi' }),
        makeProvision({ category: 'Assurance', owner: 'madame' }),
      ];
      expect(provisionedCategories(provisions, 'global')).toEqual(
        new Set(['Électricité', 'Assurance']),
      );
    });
  });

  describe('countedExpenses', () => {
    it('inclut les dépenses normales du mois consulté', () => {
      const expenses = [makeExpense({ category: 'Courses', date: '2026-01-15', amount: 50 })];
      const result = countedExpenses(expenses, [], 'moi', '2026-01');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(50);
    });

    it('exclut les dépenses hors du mois consulté', () => {
      const expenses = [makeExpense({ category: 'Courses', date: '2026-02-15' })];
      expect(countedExpenses(expenses, [], 'moi', '2026-01')).toHaveLength(0);
    });

    it('exclut la catégorie "Revenu"', () => {
      const expenses = [makeExpense({ category: 'Revenu', date: '2026-01-15' })];
      expect(countedExpenses(expenses, [], 'moi', '2026-01')).toHaveLength(0);
    });

    it('exclut "Versement" seulement en vue Global (transfert interne)', () => {
      const expenses = [makeExpense({ category: 'Versement', date: '2026-01-15', owner: 'moi' })];
      expect(countedExpenses(expenses, [], 'global', '2026-01')).toHaveLength(0);
      expect(countedExpenses(expenses, [], 'moi', '2026-01')).toHaveLength(1);
    });

    it('exclut les dépenses réelles d’une catégorie provisionnée (remplacées par la cagnotte)', () => {
      const provisions = [makeProvision({ category: 'Électricité', owner: 'moi' })];
      const expenses = [makeExpense({ category: 'Électricité', owner: 'moi', date: '2026-01-15' })];
      expect(countedExpenses(expenses, provisions, 'moi', '2026-01')).toHaveLength(0);
    });

    it('inclut les ajouts manuels du mois sur une provision, avec les bons métadonnées', () => {
      const provisions = [
        makeProvision({
          id: 'prov-elec',
          name: 'Électricité',
          category: 'Électricité',
          owner: 'moi',
          adjustments: [{ id: 'adj-1', amount: 100, date: '2026-01-10', note: 'mise de côté' }],
        }),
      ];
      const result = countedExpenses([], provisions, 'moi', '2026-01');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        amount: 100,
        category: 'Électricité',
        provision: true,
        provisionAdjustment: true,
        provisionId: 'prov-elec',
        adjustmentId: 'adj-1',
        provisionName: 'Électricité',
        note: 'mise de côté',
      });
    });

    it('ignore un profil filtré (les dépenses/ajouts d’un autre owner n’apparaissent pas)', () => {
      const provisions = [makeProvision({ category: 'Électricité', owner: 'madame' })];
      const expenses = [makeExpense({ category: 'Courses', owner: 'madame', date: '2026-01-15' })];
      expect(countedExpenses(expenses, provisions, 'moi', '2026-01')).toHaveLength(0);
    });

    it('en vue Global, agrège les deux profils', () => {
      const expenses = [
        makeExpense({ category: 'Courses', owner: 'moi', date: '2026-01-15', amount: 30 }),
        makeExpense({ category: 'Courses', owner: 'madame', date: '2026-01-16', amount: 20 }),
      ];
      const result = countedExpenses(expenses, [], 'global', '2026-01');
      expect(result.reduce((s, e) => s + e.amount, 0)).toBe(50);
    });
  });
});
