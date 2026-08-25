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
  provisionUpcomingHit,
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
    monthlyReminder: null,
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

    // Bug rapporté par l'utilisateur : après un recalage automatique
    // (syncProvisionsFromExpense, déclenché par payProvision), la cagnotte
    // affichait encore l'argent de l'ANCIEN cycle, donnant l'impression
    // qu'une provision "déjà remplie" venait d'apparaître toute seule.
    it("NE compte PAS les ajouts faits avant le début du cycle en cours (recalage) — la cagnotte repart bien à 0", () => {
      const p = makeProvision({
        category: 'Assurance',
        owner: 'moi',
        everyN: 3,
        // Recalée sur juillet : les 600 $ ajoutés en janvier appartenaient
        // à l'ancien cycle (déjà réglé), ils ne doivent plus compter ici.
        startYM: '2026-07',
        adjustments: [{ id: 'a1', amount: 600, date: '2026-01-10', note: 'Ancien cycle' }],
      });
      expect(provisionPot(p, '2026-07', [])).toBe(0);
    });

    it("compte bien les ajouts faits APRÈS le début du cycle en cours, même s'il y a aussi d'anciens ajouts avant", () => {
      const p = makeProvision({
        category: 'Assurance',
        owner: 'moi',
        everyN: 3,
        startYM: '2026-07',
        adjustments: [
          { id: 'a1', amount: 600, date: '2026-01-10', note: 'Ancien cycle' },
          { id: 'a2', amount: 150, date: '2026-07-15', note: 'Nouveau cycle' },
        ],
      });
      expect(provisionPot(p, '2026-07', [])).toBe(150);
    });

    it('même correctif pour un cycle en jours (startDate), pas seulement en mois', () => {
      const p = makeProvision({
        category: 'Électricité',
        owner: 'moi',
        intervalUnit: 'days',
        everyN: 60,
        startDate: '2026-07-01',
        adjustments: [{ id: 'a1', amount: 60, date: '2026-05-01', note: 'Ancien cycle' }],
      });
      expect(provisionPot(p, '2026-07', [])).toBe(0);
    });

    // Cas rapporté par un utilisateur : "je veux créer une provision le
    // 10 juillet pour un paiement dans 62 jours" — c'est-à-dire que
    // l'ancre (10 sept.) représente la PREMIÈRE échéance, pas encore
    // atteinte. Sans ce correctif, tout ce qu'il ajoute à la cagnotte
    // entre le 10 juillet et le 10 septembre serait exclu (traité comme
    // "avant le début du cycle"), l'empêchant d'épargner à l'avance pour
    // sa toute première échéance.
    it("compte bien les ajouts faits AVANT une échéance future pas encore atteinte (toute première période d'accumulation)", () => {
      const p = makeProvision({
        category: 'Électricité',
        owner: 'moi',
        intervalUnit: 'days',
        everyN: 62,
        startDate: '2026-09-10', // 1re échéance = 10 juillet + 62 jours
        adjustments: [
          { id: 'a1', amount: 100, date: '2026-07-15', note: '' },
          { id: 'a2', amount: 80, date: '2026-08-15', note: '' },
        ],
      });
      // Consulté en août, avant l'échéance de septembre : les deux ajouts
      // doivent compter, même s'ils sont datés avant l'ancre.
      expect(provisionPot(p, '2026-08', [])).toBe(180);
    });

    it("une fois arrivé dans le mois même de l'échéance, la borne stricte habituelle reprend (limite du correctif : granularité mensuelle, pas journalière)", () => {
      const p = makeProvision({
        category: 'Électricité',
        owner: 'moi',
        intervalUnit: 'days',
        everyN: 62,
        startDate: '2026-09-10',
        adjustments: [{ id: 'a1', amount: 100, date: '2026-07-15', note: '' }],
      });
      // En consultant septembre (le mois de l'échéance elle-même), la
      // "grâce" s'arrête : la fonction ne connaît que le MOIS affiché,
      // pas le jour exact d'aujourd'hui, donc elle ne peut pas savoir si
      // le 10 septembre est déjà passé ou non dans le mois en cours. Le
      // correctif couvre le vrai besoin rapporté (accumuler PENDANT les
      // mois qui précèdent l'échéance, ici juillet et août) ; ce cas
      // limite (le mois de l'échéance pile) est un compromis assumé.
      expect(provisionPot(p, '2026-09', [])).toBe(0);
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

  // Bug rapporté par un utilisateur (capture d'écran) : sur une même
  // carte, "Échéance ce mois" (basé sur isHitMonth) et "Prochaine
  // échéance : [date]" (basé sur provisionNextHit, qui saute toujours
  // au cycle suivant) parlaient de deux échéances différentes et se
  // contredisaient. provisionUpcomingHit() aligne les deux : si le
  // mois/la période affichée est elle-même une échéance non couverte,
  // c'est CETTE date qui doit être montrée comme "prochaine échéance",
  // pas celle du cycle d'après.
  describe('provisionUpcomingHit', () => {
    it("renvoie la date DANS le cycle en jours en cours quand elle n'est pas encore passée (pas celle d'après)", () => {
      // Reproduit le cas rapporté : démarré le 12 mai, tous les 60 jours
      // -> échéances 12 mai, 11 juillet, 09 septembre...
      const p = makeProvision({
        category: 'Électricité',
        intervalUnit: 'days',
        everyN: 60,
        startDate: '2026-05-12',
      });
      // En consultant juillet (qui contient l'échéance du 11 juillet) :
      // provisionNextHit() sauterait à septembre — provisionUpcomingHit()
      // doit rester sur juillet, l'échéance du mois affiché.
      expect(isHitMonth(p, '2026-07')).toBe(true);
      expect(provisionNextHit(p, '2026-07')).toBe('2026-09-09'); // comportement de planification inchangé
      expect(provisionUpcomingHit(p, '2026-07')).toBe('2026-07-11'); // mais l'échéance affichée doit être celle-ci
    });

    it("renvoie provisionNextHit() sans changement quand le mois affiché n'est PAS lui-même une échéance", () => {
      const p = makeProvision({
        category: 'Électricité',
        intervalUnit: 'days',
        everyN: 60,
        startDate: '2026-05-12',
      });
      // Août ne contient aucune échéance (entre le 11 juillet et le 9 sept).
      expect(isHitMonth(p, '2026-08')).toBe(false);
      expect(provisionUpcomingHit(p, '2026-08')).toBe(provisionNextHit(p, '2026-08'));
      expect(provisionUpcomingHit(p, '2026-08')).toBe('2026-09-09');
    });

    it('même correction pour un cycle en mois : reste sur le mois affiché plutôt que sauter au suivant', () => {
      const p = makeProvision({ startYM: '2026-01', everyN: 3 });
      // provisionNextHit saute intentionnellement à avril (voir test dédié
      // ci-dessus) ; provisionUpcomingHit doit rester en janvier.
      expect(provisionNextHit(p, '2026-01')).toBe('2026-04');
      expect(provisionUpcomingHit(p, '2026-01')).toBe('2026-01');
    });

    it("provisionDaysUntilNext() ne doit plus jamais être artificiellement grand pour une échéance du mois affiché restée impayée", () => {
      const p = makeProvision({
        category: 'Électricité',
        intervalUnit: 'days',
        everyN: 60,
        startDate: '2026-05-12',
      });
      // Avant le correctif, ceci se basait sur septembre (le cycle
      // suivant), donnant un nombre de jours élevé qui empêchait
      // provisionDueAlert() de jamais déclencher "en retard" pour une
      // échéance de juillet restée impayée.
      const days = provisionDaysUntilNext(p, '2026-07');
      expect(days).toBeLessThan(31); // dans le mois de juillet, pas en septembre
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
    // Corrigé — voir provisionUpcomingHit() dans provision.utils.ts,
    // ajoutée suite à un bug rapporté par un utilisateur (capture
    // d'écran : "Échéance ce mois" et "Prochaine échéance : [cycle
    // suivant]" se contredisaient sur la même carte). provisionDueAlert()
    // se base maintenant sur l'échéance du mois/cycle CONSULTÉ quand
    // celui-ci est lui-même une échéance impayée, plutôt que de toujours
    // regarder le cycle suivant — donc "overdue" peut désormais bien se
    // déclencher.
    it('renvoie bien "overdue" quand le mois consulté est lui-même une échéance ancienne restée impayée', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2030, 0, 1)); // "aujourd'hui" réel très loin dans le futur
      const p = makeProvision({ amount: 100, startYM: '2020-01', everyN: 1 }); // mensuel
      const alert = provisionDueAlert(p, '2020-01', []); // mois consulté très ancien, lui-même une échéance
      expect(alert?.type).toBe('overdue');
    });

    it('renvoie une alerte "soon" si l’échéance approche (≤ 7 jours) et la cible non atteinte', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 28)); // 28 juin
      const p = makeProvision({ amount: 100, startYM: '2026-01', everyN: 6 }); // prochaine échéance juillet
      const alert = provisionDueAlert(p, '2026-06', []);
      expect(alert?.type).toBe('soon');
    });

    // Corrigé également : le mois consulté (janvier) est lui-même
    // l'échéance de départ de cette provision semestrielle — avec 0 $ de
    // côté, une alerte est attendue aujourd'hui même, pas seulement à
    // l'approche de l'échéance de juillet (le cycle SUIVANT).
    it("renvoie une alerte quand le mois consulté est lui-même une échéance non couverte, même si le cycle SUIVANT est encore loin", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1));
      const p = makeProvision({ amount: 100, startYM: '2026-01', everyN: 6 }); // échéance de départ = janvier
      const alert = provisionDueAlert(p, '2026-01', []);
      expect(alert).not.toBeNull();
    });

    it("ne renvoie aucune alerte si le mois consulté n'est pas lui-même une échéance et que la suivante est encore loin", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 1, 1)); // février : pas une échéance pour ce cycle semestriel
      const p = makeProvision({ amount: 100, startYM: '2026-01', everyN: 6 }); // prochaine échéance juillet
      expect(provisionDueAlert(p, '2026-02', [])).toBeNull();
    });
  });

  describe('provisionedCategories', () => {
    // Format corrigé (audit BUG-008) : clé "owner|catégorie", pas la
    // catégorie seule — voir countedExpenses ci-dessous pour le scénario
    // concret que ça corrige (vue Global sous-comptant une dépense).
    it('renvoie les catégories des provisions d’un profil donné, préfixées par le profil', () => {
      const provisions = [
        makeProvision({ category: 'Électricité', owner: 'moi' }),
        makeProvision({ category: 'Assurance', owner: 'madame' }),
      ];
      expect(provisionedCategories(provisions, 'moi')).toEqual(new Set(['moi|Électricité']));
    });

    it('renvoie toutes les catégories en vue Global, chacune préfixée par son propriétaire', () => {
      const provisions = [
        makeProvision({ category: 'Électricité', owner: 'moi' }),
        makeProvision({ category: 'Assurance', owner: 'madame' }),
      ];
      expect(provisionedCategories(provisions, 'global')).toEqual(
        new Set(['moi|Électricité', 'madame|Assurance']),
      );
    });
  });

  describe('countedExpenses — BUG-008 : vue Global ne doit pas sous-compter un autre profil', () => {
    it("la dépense réelle de Madame dans une catégorie où seul Moi a une provision compte bien dans le budget Global", () => {
      const provisions = [makeProvision({ category: 'Assurance', owner: 'moi' })];
      const expenses: Expense[] = [
        {
          id: 'e1', amount: 300, category: 'Assurance', date: '2026-07-10', owner: 'madame', cc: false,
        },
      ];
      const counted = countedExpenses(expenses, provisions, 'global', '2026-07');
      // Avant le correctif, cette dépense était exclue à tort (traitée
      // comme "couverte" par la provision de Moi alors qu'elle appartient
      // à Madame) — le budget Global sous-comptait silencieusement.
      expect(counted.find((e) => e.id === 'e1')).toBeDefined();
    });

    it("la dépense réelle de Moi dans cette même catégorie, ENTIÈREMENT couverte par sa cagnotte, reste exclue", () => {
      const provisions = [
        makeProvision({
          category: 'Assurance',
          owner: 'moi',
          startYM: '2026-01',
          adjustments: [{ id: 'a1', amount: 300, date: '2026-06-01', note: '' }],
        }),
      ];
      const expenses: Expense[] = [
        {
          id: 'e1', amount: 300, category: 'Assurance', date: '2026-07-10', owner: 'moi', cc: false,
        },
      ];
      const counted = countedExpenses(expenses, provisions, 'global', '2026-07');
      expect(counted.find((e) => e.id === 'e1')).toBeUndefined();
    });

    // Cas rapporté par un utilisateur : payer une vraie facture alors
    // qu'AUCUN argent n'a jamais été mis dans la provision correspondante
    // ne doit PLUS faire disparaître la dépense — rien ne l'a couverte.
    it("la dépense réelle de Moi dans une catégorie provisionnée mais SANS AUCUNE épargne compte intégralement", () => {
      const provisions = [makeProvision({ category: 'Assurance', owner: 'moi', adjustments: [] })];
      const expenses: Expense[] = [
        {
          id: 'e1', amount: 300, category: 'Assurance', date: '2026-07-10', owner: 'moi', cc: false,
        },
      ];
      const counted = countedExpenses(expenses, provisions, 'global', '2026-07');
      const entry = counted.find((e) => e.id === 'e1');
      expect(entry).toBeDefined();
      expect(entry?.amount).toBe(300);
    });

    it("une provision partiellement financée (cagnotte 100 $, facture 300 $) ne fait compter que la partie non couverte (200 $)", () => {
      const provisions = [
        makeProvision({
          category: 'Assurance',
          owner: 'moi',
          startYM: '2026-01',
          adjustments: [{ id: 'a1', amount: 100, date: '2026-06-01', note: '' }],
        }),
      ];
      const expenses: Expense[] = [
        {
          id: 'e1', amount: 300, category: 'Assurance', date: '2026-07-10', owner: 'moi', cc: false,
        },
      ];
      const counted = countedExpenses(expenses, provisions, 'moi', '2026-07');
      const entry = counted.find((e) => e.id === 'e1');
      expect(entry).toBeDefined();
      expect(entry?.amount).toBe(200);
    });
  });

  describe('countedExpenses — BUG-009 : ajustement antérieur au cycle en cours ne doit pas réduire le budget', () => {
    it("un ajustement fait avant le recalage (ancien cycle) n'est plus compté dans le budget du mois affiché", () => {
      const provisions = [
        makeProvision({
          category: 'Assurance',
          owner: 'moi',
          startYM: '2026-07', // recalé sur juillet
          adjustments: [
            { id: 'a1', amount: 200, date: '2026-01-10', note: 'Ancien cycle, avant recalage' },
          ],
        }),
      ];
      const counted = countedExpenses([], provisions, 'moi', '2026-07');
      expect(counted.filter((e) => e.provisionAdjustment)).toHaveLength(0);
    });

    it("un ajustement fait APRÈS le début du cycle en cours est bien compté", () => {
      const provisions = [
        makeProvision({
          category: 'Assurance',
          owner: 'moi',
          startYM: '2026-07',
          adjustments: [
            { id: 'a1', amount: 150, date: '2026-07-15', note: 'Nouveau cycle' },
          ],
        }),
      ];
      const counted = countedExpenses([], provisions, 'moi', '2026-07');
      const adj = counted.filter((e) => e.provisionAdjustment);
      expect(adj).toHaveLength(1);
      expect(adj[0].amount).toBe(150);
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

    it('exclut les dépenses réelles d’une catégorie provisionnée, si la cagnotte les couvre (remplacées par la cagnotte)', () => {
      const provisions = [
        makeProvision({
          category: 'Électricité',
          owner: 'moi',
          startYM: '2025-11',
          adjustments: [{ id: 'a1', amount: 100, date: '2025-12-01', note: '' }],
        }),
      ];
      const expenses = [makeExpense({ category: 'Électricité', owner: 'moi', date: '2026-01-15' })];
      expect(countedExpenses(expenses, provisions, 'moi', '2026-01')).toHaveLength(0);
    });

    it("ne l'exclut PAS si la cagnotte est vide (rien n'a jamais été mis de côté)", () => {
      const provisions = [makeProvision({ category: 'Électricité', owner: 'moi', adjustments: [] })];
      const expenses = [makeExpense({ category: 'Électricité', owner: 'moi', date: '2026-01-15' })];
      const counted = countedExpenses(expenses, provisions, 'moi', '2026-01');
      expect(counted).toHaveLength(1);
      expect(counted[0].amount).toBe(100);
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
