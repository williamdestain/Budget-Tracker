import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetStore } from './budget-store.service';
import { SupabaseService } from './supabase.service';
import { FakeSupabaseClient } from '../testing/fake-supabase-client';
import { ymOf } from '../utils/date.utils';
import { fmt } from '../utils/currency.utils';

// Tests d'intégration : BudgetStore + mappers + faux client Supabase en
// mémoire, sans réseau. L'objectif est de vérifier que les différentes
// pièces (requêtes, mapping ligne<->modèle, signals, computed) fonctionnent
// bien ENSEMBLE — pas seulement chaque fonction utilitaire isolément (déjà
// couvert par les *.utils.spec.ts).
describe('BudgetStore (intégration avec faux Supabase)', () => {
  let store: BudgetStore;
  let fakeClient: FakeSupabaseClient;

  beforeEach(() => {
    fakeClient = new FakeSupabaseClient();
    TestBed.configureTestingModule({
      providers: [
        BudgetStore,
        { provide: SupabaseService, useValue: { client: fakeClient } },
      ],
    });
    store = TestBed.inject(BudgetStore);
  });

  describe('loadAll()', () => {
    it('charge et mappe correctement les 10 tables vers les signals', async () => {
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 50, category: 'Courses', date: '2026-07-10', owner: 'moi', cc: false },
      ]);
      fakeClient.seed('incomes', [
        {
          id: 'i1', amount: 3000, type: 'Salaire', date: '2026-07-01', owner: 'moi', note: '',
          recurring: true, recurring_interval: 'monthly', recurring_start_month: '2026-01',
        },
      ]);
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Électricité', amount: 600, every_n: 3, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Électricité', owner: 'moi',
          auto_recalibrate: true, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      fakeClient.seed('provision_adjustments', [
        { id: 'a1', provision_id: 'p1', amount: 100, date: '2026-07-05', note: '', versement_expense_id: null },
      ]);
      fakeClient.seed('savings_goals', [
        { id: 'g1', name: 'Vacances', target_amount: 2000, target_date: null, owner: 'moi' },
      ]);
      fakeClient.seed('savings_goal_contributions', [
        { id: 'c1', savings_goal_id: 'g1', amount: 300, date: '2026-07-01', note: '' },
      ]);
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Loyer', amount: 1000, category: 'Loyer', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      fakeClient.seed('budgets', [{ id: 'b1', owner: 'moi', ym: '2026-07', amount: 3000 }]);
      fakeClient.seed('category_budgets', [
        { id: 'cb1', owner: 'moi', ym: '2026-07', category: 'Courses', amount: 400 },
      ]);
      fakeClient.seed('rollovers', [{ id: 'ro1', owner: 'moi', ym: '2026-07', amount: 50 }]);

      await store.loadAll();

      expect(store.loading()).toBe(false);
      expect(store.expenses()).toHaveLength(1);
      expect(store.expenses()[0]).toMatchObject({ amount: 50, category: 'Courses' });

      expect(store.incomes()).toHaveLength(1);
      expect(store.incomes()[0].recurringInterval).toBe('monthly');

      expect(store.provisions()).toHaveLength(1);
      // Vérifie que la jointure provision <-> ses ajustements fonctionne.
      expect(store.provisions()[0].adjustments).toHaveLength(1);
      expect(store.provisions()[0].adjustments[0].amount).toBe(100);

      expect(store.savingsGoals()).toHaveLength(1);
      expect(store.savingsGoals()[0].contributions).toHaveLength(1);

      expect(store.recurringExpenses()).toHaveLength(1);
      expect(store.recurringExpenses()[0].name).toBe('Loyer');

      expect(store.budgets().moi['2026-07']).toBe(3000);
      expect(store.categoryBudgets().moi['2026-07']['Courses']).toBe(400);
      expect(store.rollovers().moi['2026-07']).toBe(50);
    });

    // Corrigé — voir AUDIT_PRODUCTION_V2.md §3.5. loadAll() détecte
    // maintenant les erreurs par table : le signal correspondant garde son
    // ancienne valeur (pas de vidage silencieux) et loadError() liste les
    // tables en échec, pour que l'UI puisse afficher un avertissement.
    it("une erreur sur une seule table est détectée : le signal garde son ancienne valeur et loadError() la signale", async () => {
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 50, category: 'Courses', date: '2026-07-10', owner: 'moi', cc: false },
      ]);
      await store.loadAll();
      expect(store.expenses()).toHaveLength(1);

      fakeClient.simulateErrorOn('expenses');
      await store.loadAll();

      expect(store.loading()).toBe(false);
      // L'ancienne valeur est conservée, pas remplacée par [].
      expect(store.expenses()).toHaveLength(1);
      expect(store.loadError()).toContain('expenses');
    });

    it('loadError() est un tableau vide quand tout charge correctement', async () => {
      await store.loadAll();
      expect(store.loadError()).toEqual([]);
    });
  });

  describe('addExpense() / removeExpense()', () => {
    it('insère une dépense, la renvoie mappée, et met à jour le signal', async () => {
      const created = await store.addExpense({
        amount: 42,
        category: 'Courses',
        date: '2026-07-15',
        owner: 'moi',
        cc: false,
      });

      expect(created.amount).toBe(42);
      expect(store.expenses()).toHaveLength(1);
      expect(store.expenses()[0].id).toBe(created.id);
      // Vérifie que la dépense a bien été persistée côté "base" (pas
      // seulement dans le signal local).
      expect(fakeClient.tables['expenses']).toHaveLength(1);
    });

    it('supprime une dépense du signal ET de la table', async () => {
      const created = await store.addExpense({
        amount: 42,
        category: 'Courses',
        date: '2026-07-15',
        owner: 'moi',
        cc: false,
      });

      await store.removeExpense(created.id);

      expect(store.expenses()).toHaveLength(0);
      expect(fakeClient.tables['expenses']).toHaveLength(0);
    });

    // Rollback de compensation — voir REVIEW_ARCHITECTURE_ET_PLAN_REFACTORING.md
    // sur l'atomicité addExpense/syncProvisionsFromExpense : les deux
    // opérations touchent des tables différentes, donc si le recalage de
    // provision échoue après l'insertion de la dépense, on annule
    // (supprime) la dépense qu'on vient de créer plutôt que de la laisser
    // exister sans son recalage.
    it("annule (rollback) la dépense créée si le recalage de la provision associée échoue", async () => {
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Électricité', amount: 600, every_n: 3, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Électricité', owner: 'moi',
          auto_recalibrate: true, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      await store.loadAll();
      fakeClient.simulateErrorOn('provisions');

      await expect(
        store.addExpense({
          amount: 80,
          category: 'Électricité', // même catégorie/profil que p1, autoRecalibrate=true -> déclenche le recalage
          date: '2026-07-15',
          owner: 'moi',
          cc: false,
        }),
      ).rejects.toThrow(/recalage/);

      // La dépense ne doit exister ni dans le signal, ni dans la "base".
      expect(store.expenses()).toHaveLength(0);
      expect(fakeClient.tables['expenses']).toHaveLength(0);
    });

    it("annule (rollback) une édition de dépense si le recalage de provision échoue, en revenant à l'état précédent", async () => {
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Électricité', amount: 600, every_n: 3, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Électricité', owner: 'moi',
          auto_recalibrate: true, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      await store.loadAll();
      // Créée sans déclencher le recalage (catégorie différente au départ).
      const created = await store.addExpense({
        amount: 50,
        category: 'Courses',
        date: '2026-07-10',
        owner: 'moi',
        cc: false,
      });

      fakeClient.simulateErrorOn('provisions');

      await expect(
        store.updateExpense(created.id, { category: 'Électricité' }),
      ).rejects.toThrow(/recalage/);

      // La dépense doit être revenue à son état d'avant l'édition (catégorie
      // d'origine), pas rester à moitié modifiée.
      const stillThere = store.expenses().find((e) => e.id === created.id);
      expect(stillThere?.category).toBe('Courses');
      expect(fakeClient.tables['expenses'].find((r: any) => r.id === created.id)?.['category']).toBe('Courses');
    });
  });

  describe('resetEverything()', () => {
    it('vide bien expenses/incomes/provisions/savingsGoals/budgets/categoryBudgets/rollovers', async () => {
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 50, category: 'Courses', date: '2026-07-10', owner: 'moi', cc: false },
      ]);
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Électricité', amount: 600, every_n: 3, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Électricité', owner: 'moi',
          auto_recalibrate: true, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      await store.loadAll();

      await store.resetEverything();

      expect(store.expenses()).toEqual([]);
      expect(store.provisions()).toEqual([]);
      expect(store.savingsGoals()).toEqual([]);
      expect(store.budgets()).toEqual({ moi: {}, madame: {} });
    });

    // Corrigé — voir REVIEW_ARCHITECTURE_ET_PLAN_REFACTORING.md §3.1 /
    // AUDIT_PRODUCTION_V2.md §3.1. resetEverything() vide maintenant aussi
    // recurring_expenses, en base et dans le signal en mémoire.
    it('vide bien recurring_expenses aussi', async () => {
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Loyer', amount: 1000, category: 'Loyer', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      await store.loadAll();
      expect(store.recurringExpenses()).toHaveLength(1);

      await store.resetEverything();

      expect(store.recurringExpenses()).toEqual([]);
      expect(fakeClient.tables['recurring_expenses']).toHaveLength(0);
    });

    it("remonte une erreur explicite si la fonction reset_everything() échoue, et ne supprime RIEN (atomique)", async () => {
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 50, category: 'Courses', date: '2026-07-10', owner: 'moi', cc: false },
      ]);
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Loyer', amount: 1000, category: 'Loyer', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      await store.loadAll();
      fakeClient.simulateErrorOn('recurring_expenses');

      await expect(store.resetEverything()).rejects.toThrow(/recurring_expenses/);

      // Contrairement à l'ancien comportement (Promise.allSettled avec
      // suppression partielle), la RPC reset_everything() est une seule
      // transaction Postgres : un échec sur une table annule TOUT,
      // recurring_expenses ET expenses gardent leurs données.
      expect(fakeClient.tables['recurring_expenses']).toHaveLength(1);
      expect(fakeClient.tables['expenses']).toHaveLength(1);
      // Les signals en mémoire ne doivent pas non plus avoir été vidés.
      expect(store.expenses()).toHaveLength(1);
      expect(store.recurringExpenses()).toHaveLength(1);
    });
  });

  describe('exportData()', () => {
    // Corrigé — voir AUDIT_PRODUCTION_V2.md §3.2. On ne peut pas facilement
    // tester le téléchargement navigateur lui-même ici (jsdom ne le simule
    // pas pleinement), donc ce test se concentre sur ce qui est vérifiable :
    // que recurringExpenses apparaît bien dans les données que
    // exportData() prépare, en interceptant Blob.
    it('le JSON exporté inclut recurringExpenses', async () => {
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Loyer', amount: 1000, category: 'Loyer', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      await store.loadAll();

      let capturedText: string | null = null;
      const originalBlob = globalThis.Blob;
      class CapturingBlob extends originalBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          capturedText = String(parts[0]);
        }
      }
      // @ts-expect-error remplacement temporaire pour capturer le contenu exporté
      globalThis.Blob = CapturingBlob;
      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = () => 'blob:fake';
      URL.revokeObjectURL = () => {};

      try {
        store.exportData();
      } finally {
        globalThis.Blob = originalBlob;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
      }

      expect(capturedText).not.toBeNull();
      const payload = JSON.parse(capturedText!);
      expect(payload.expenses).toBeDefined();
      expect(payload.recurringExpenses).toBeDefined();
      expect(payload.recurringExpenses).toHaveLength(1);
      expect(payload.recurringExpenses[0].name).toBe('Loyer');
    });
  });

  describe('importData()', () => {
    it('restaure recurringExpenses depuis un export récent', async () => {
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Loyer', amount: 1000, category: 'Loyer', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      await store.loadAll();

      let capturedText: string | null = null;
      const originalBlob = globalThis.Blob;
      class CapturingBlob extends originalBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          capturedText = String(parts[0]);
        }
      }
      // @ts-expect-error remplacement temporaire pour capturer le contenu exporté
      globalThis.Blob = CapturingBlob;
      const originalCreateObjectURL = URL.createObjectURL;
      const originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = () => 'blob:fake';
      URL.revokeObjectURL = () => {};
      let exported: any;
      try {
        store.exportData();
        exported = JSON.parse(capturedText!);
      } finally {
        globalThis.Blob = originalBlob;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
      }

      await store.importData(exported);

      expect(store.recurringExpenses()).toHaveLength(1);
      expect(store.recurringExpenses()[0].name).toBe('Loyer');
    });

    it("n'échoue pas sur un fichier plus ancien sans recurringExpenses (champ optionnel)", async () => {
      await store.importData({
        expenses: [],
        incomes: [],
        provisions: [],
        // pas de champ recurringExpenses, comme une sauvegarde faite avant ce correctif
      });

      expect(store.recurringExpenses()).toEqual([]);
    });

    // Rollback de compensation — voir la note d'atomicité dans
    // importData() : pas de vraie transaction SQL pour ~10 tables, mais
    // un "tout ou rien" applicatif : si un insert échoue en cours de
    // restauration, tout ce qui a déjà été inséré est revidé avant de
    // remonter l'erreur.
    it("si un insert échoue en cours d'import, revide tout (rollback) plutôt que de laisser un import partiel", async () => {
      // Des données déjà en place avant l'import, pour vérifier qu'elles
      // sont bien parties après le rollback (resetEverything() les a
      // déjà supprimées avant même de tenter les inserts).
      fakeClient.seed('expenses', [
        { id: 'old', amount: 10, category: 'Courses', date: '2026-06-01', owner: 'moi', cc: false },
      ]);
      await store.loadAll();

      // simulateErrorOnce plutôt que simulateErrorOn : on veut que
      // l'insert échoue, mais que le DELETE du rollback (resetEverything,
      // qui repasse par "incomes" dans sa transaction) réussisse ensuite.
      fakeClient.simulateErrorOnce('incomes');

      await expect(
        store.importData({
          expenses: [{ id: 'e1', amount: 20, category: 'Courses', date: '2026-07-01', owner: 'moi', cc: false }],
          incomes: [{ id: 'i1', amount: 500, type: 'Salaire', date: '2026-07-01', owner: 'moi', note: '', recurring: false }],
          provisions: [],
        }),
      ).rejects.toThrow(/annulé/);

      // Rien ne doit être resté : ni l'ancienne dépense (déjà supprimée
      // par le reset initial), ni la nouvelle dépense insérée juste avant
      // l'échec sur incomes (supprimée par le rollback de compensation).
      expect(store.expenses()).toEqual([]);
      expect(store.incomes()).toEqual([]);
      expect(fakeClient.tables['expenses']).toEqual([]);
    });
  });

  describe('budgetSummary (computed)', () => {
    it('combine revenus, dépenses comptées et report en un solde net cohérent', async () => {
      fakeClient.seed('incomes', [
        {
          id: 'i1', amount: 3000, type: 'Salaire', date: '2026-07-01', owner: 'moi', note: '',
          recurring: true, recurring_interval: 'monthly', recurring_start_month: '2026-01',
        },
      ]);
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 500, category: 'Courses', date: '2026-07-10', owner: 'moi', cc: false },
      ]);
      fakeClient.seed('rollovers', [{ id: 'ro1', owner: 'moi', ym: '2026-07', amount: 100 }]);
      await store.loadAll();

      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const summary = store.budgetSummary();
      expect(summary.spent).toBe(500);
      // budget = revenus (3000) + report (100), voir le correctif du bug
      // de report déjà appliqué dans une itération précédente.
      expect(summary.budget).toBe(3100);
      expect(summary.soldeNet).toBe(2600); // 3100 - 500
    });
  });

  describe('remainingBudgetPerDay (computed)', () => {
    it("est null quand le mois affiché n'est pas le mois réel en cours", async () => {
      fakeClient.seed('incomes', [
        {
          id: 'i1', amount: 3000, type: 'Salaire', date: '2020-01-01', owner: 'moi', note: '',
          recurring: false, recurring_interval: 'once', recurring_start_month: '2020-01',
        },
      ]);
      await store.loadAll();

      store.activeOwner.set('moi');
      store.current.set('2020-01'); // mois passé, jamais le mois réel en cours

      expect(store.remainingBudgetPerDay()).toBeNull();
    });

    it('répartit remainingBudget().amount sur les jours restants du mois réel en cours', async () => {
      const todayYm = ymOf(new Date());
      const dayOfMonth = new Date().getDate();

      fakeClient.seed('incomes', [
        {
          id: 'i1', amount: 3000, type: 'Salaire', date: `${todayYm}-01`, owner: 'moi', note: '',
          recurring: false, recurring_interval: 'once', recurring_start_month: todayYm,
        },
      ]);
      fakeClient.seed('expenses', [
        {
          id: 'e1', amount: 500, category: 'Courses', date: `${todayYm}-${String(dayOfMonth).padStart(2, '0')}`,
          owner: 'moi', cc: false,
        },
      ]);
      // Un récurrent non confirmé, pour vérifier que le calcul par-jour
      // repose bien sur remainingBudget() (qui le déduit) et non sur le
      // budget brut (qui l'ignorerait).
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Abonnement', amount: 60, category: 'Loisirs', owner: 'moi', day_of_month: 28, cc: false, active: true },
      ]);
      await store.loadAll();

      store.activeOwner.set('moi');
      store.current.set(todayYm);

      const forecast = store.monthForecast();
      const result = store.remainingBudgetPerDay();
      const daysLeft = (forecast?.daysInMonth ?? 0) - (forecast?.dayOfMonth ?? 0);

      if (daysLeft <= 0) {
        // Dernier jour du mois : pas de "par jour" restant qui ait un sens.
        expect(result).toBeNull();
      } else {
        expect(forecast).not.toBeNull();
        const rb = store.remainingBudget();
        // Vérifie explicitement que le récurrent non confirmé est bien
        // reflété dans le montant réparti (pas juste budget - spentSoFar).
        expect(rb.recurringRemaining).toBe(60);
        const expected = rb.amount / daysLeft;
        expect(result).not.toBeNull();
        expect(result as number).toBeCloseTo(expected, 6);
      }
    });
  });

  // Bug rapporté par l'utilisateur : impossible d'enregistrer un budget de
  // catégorie à 0 $ — le formulaire d'édition envoyait 0 vers
  // removeCategoryBudget() au lieu de setCategoryBudget(), donc la ligne
  // était supprimée (et retombait sur l'héritage d'un mois précédent) au
  // lieu de rester à 0 comme voulu.
  describe('setCategoryBudget() à 0 / categoryBudgetRows — budget explicite à zéro', () => {
    it('persiste bien 0 comme un budget explicite (pas une suppression)', async () => {
      await store.loadAll();
      await store.setCategoryBudget('moi', '2026-07', 'Loisirs', 0);

      expect(fakeClient.tables['category_budgets']).toHaveLength(1);
      expect(fakeClient.tables['category_budgets'][0]['amount']).toBe(0);
      expect(store.effectiveCategoryBudget('moi', 'Loisirs', '2026-07')).toBe(0);
    });

    it("un budget à 0 explicite ce mois-ci N'hérite PAS du budget positif d'un mois précédent", async () => {
      await store.loadAll();
      await store.setCategoryBudget('moi', '2026-06', 'Loisirs', 200);
      await store.setCategoryBudget('moi', '2026-07', 'Loisirs', 0);

      // Sans l'entrée explicite à 0, effectiveCategoryBudget remonterait
      // dans le temps et retrouverait les 200 $ de juin.
      expect(store.effectiveCategoryBudget('moi', 'Loisirs', '2026-07')).toBe(0);
      expect(store.effectiveCategoryBudget('moi', 'Loisirs', '2026-06')).toBe(200);
    });

    it('une catégorie à 0 explicite reste visible dans categoryBudgetRows (pas juste si spent>0)', async () => {
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');
      await store.setCategoryBudget('moi', '2026-07', 'Loisirs', 0);

      const row = store.categoryBudgetRows().find((r) => r.category === 'Loisirs');
      expect(row).toBeDefined();
      expect(row?.budget).toBe(0);
      expect(row?.hasExplicitEntryThisMonth).toBe(true);
    });

    it("removeCategoryBudget() (le bouton ✕ dédié) revient bien à l'héritage, contrairement à setCategoryBudget(0)", async () => {
      await store.loadAll();
      await store.setCategoryBudget('moi', '2026-06', 'Loisirs', 200);
      await store.setCategoryBudget('moi', '2026-07', 'Loisirs', 0);

      await store.removeCategoryBudget('moi', '2026-07', 'Loisirs');

      expect(store.effectiveCategoryBudget('moi', 'Loisirs', '2026-07')).toBe(200);
    });
  });

  describe('remainingBudget (computed)', () => {
    // Revenu de base commun à la plupart des tests de ce bloc : 3000 $ en
    // juillet 2026, profil "moi".
    function seedBaseIncome(): void {
      fakeClient.seed('incomes', [
        {
          id: 'i1', amount: 3000, type: 'Salaire', date: '2026-07-01', owner: 'moi', note: '',
          recurring: false, recurring_interval: 'once', recurring_start_month: '2026-07',
        },
      ]);
    }

    it('1. sans récurrent ni provision : amount = budget - spent', async () => {
      seedBaseIncome();
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 500, category: 'Courses', date: '2026-07-10', owner: 'moi', cc: false },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const rb = store.remainingBudget();
      expect(rb.budget).toBe(3000);
      expect(rb.spent).toBe(500);
      expect(rb.recurringRemaining).toBe(0);
      expect(rb.provisionsRemaining).toBe(0);
      expect(rb.amount).toBe(2500);
    });

    it('2. récurrent actif non confirmé : déduit dans recurringRemaining', async () => {
      seedBaseIncome();
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Loyer', amount: 1000, category: 'Loyer', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const rb = store.remainingBudget();
      expect(rb.spent).toBe(0);
      expect(rb.recurringRemaining).toBe(1000);
      expect(rb.amount).toBe(2000); // 3000 - 0 - 1000
    });

    it('3. récurrent confirmé : déjà dans spent, absent de recurringRemaining', async () => {
      seedBaseIncome();
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Loyer', amount: 1000, category: 'Loyer', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      fakeClient.seed('expenses', [
        {
          id: 'e1', amount: 1000, category: 'Loyer', date: '2026-07-01', owner: 'moi', cc: false,
          recurring_source_id: 'r1',
        },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const rb = store.remainingBudget();
      expect(rb.spent).toBe(1000);
      expect(rb.recurringRemaining).toBe(0); // pas de double comptage
      expect(rb.amount).toBe(2000); // 3000 - 1000 - 0
    });

    it('4. provision due ce mois, partiellement financée : seul missing est déduit', async () => {
      seedBaseIncome();
      // everyN=6, startYM=2026-01ㅡ échéance en juillet 2026 (isHitMonth).
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Assurance', amount: 1200, every_n: 6, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Assurance', owner: 'moi',
          auto_recalibrate: false, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      fakeClient.seed('provision_adjustments', [
        { id: 'a1', provision_id: 'p1', amount: 800, date: '2026-05-01', note: '', versement_expense_id: null },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      expect(store.upcomingProvisions().find((r) => r.provision.id === 'p1')?.dueThisMonth).toBe(true);

      const rb = store.remainingBudget();
      expect(rb.provisionsRemaining).toBe(400); // 1200 (target) - 800 (pot)
      expect(rb.amount).toBe(2600); // 3000 - 0 - 0 - 400
    });

    it('5. provision due ce mois, entièrement financée : 0 déduit', async () => {
      seedBaseIncome();
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Assurance', amount: 1200, every_n: 6, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Assurance', owner: 'moi',
          auto_recalibrate: false, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      fakeClient.seed('provision_adjustments', [
        { id: 'a1', provision_id: 'p1', amount: 1200, date: '2026-03-01', note: '', versement_expense_id: null },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const rb = store.remainingBudget();
      expect(rb.provisionsRemaining).toBe(0);
      expect(rb.amount).toBe(3000);
    });

    it("6. contribution provision faite ce mois-ci : aucune double déduction", async () => {
      seedBaseIncome();
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Assurance', amount: 1200, every_n: 6, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Assurance', owner: 'moi',
          auto_recalibrate: false, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      // 700 $ accumulés avant juillet + 200 $ ajoutés en juillet même.
      fakeClient.seed('provision_adjustments', [
        { id: 'a1', provision_id: 'p1', amount: 700, date: '2026-03-01', note: '', versement_expense_id: null },
        { id: 'a2', provision_id: 'p1', amount: 200, date: '2026-07-05', note: '', versement_expense_id: null },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const rb = store.remainingBudget();
      // La contribution de juillet (200 $) est comptée dans `spent`...
      expect(rb.spent).toBe(200);
      // ...et fait déjà baisser `missing` d'autant : 1200 - (700+200) = 300,
      // pas 1200 - 700 = 500 (ce qui compterait les 200 $ de juillet deux fois).
      expect(rb.provisionsRemaining).toBe(300);
      expect(rb.amount).toBe(2500); // 3000 - 200 - 0 - 300
    });

    it('7. le report (rollover) du mois précédent est inclus dans budget', async () => {
      seedBaseIncome();
      fakeClient.seed('rollovers', [{ id: 'ro1', owner: 'moi', ym: '2026-07', amount: 250 }]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const rb = store.remainingBudget();
      expect(rb.budget).toBe(3250); // 3000 + 250
      expect(rb.amount).toBe(3250);
    });

    it('8. amount peut être négatif (pas de clamp à 0)', async () => {
      fakeClient.seed('incomes', [
        {
          id: 'i1', amount: 500, type: 'Salaire', date: '2026-07-01', owner: 'moi', note: '',
          recurring: false, recurring_interval: 'once', recurring_start_month: '2026-07',
        },
      ]);
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 900, category: 'Courses', date: '2026-07-10', owner: 'moi', cc: false },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const rb = store.remainingBudget();
      expect(rb.amount).toBe(-400); // 500 - 900
    });

    it("9. provision sous-financée mais PAS due ce mois-ci : n'est pas déduite", async () => {
      seedBaseIncome();
      // Même provision que le test 4 (due en juillet), mais on affiche août :
      // monthsBetween(2026-01, 2026-08) = 8, (8-1) % 6 = 1 ≠ 0 → pas due.
      fakeClient.seed('incomes', [
        {
          id: 'i2', amount: 3000, type: 'Salaire', date: '2026-08-01', owner: 'moi', note: '',
          recurring: false, recurring_interval: 'once', recurring_start_month: '2026-08',
        },
      ]);
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Assurance', amount: 1200, every_n: 6, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Assurance', owner: 'moi',
          auto_recalibrate: false, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      // Aucun ajout : la provision est complètement sous-financée, mais
      // n'étant ni due ce mois-ci, ni dans les 30 prochains jours, ni en
      // cagnotte négative, elle sort même de upcomingProvisions() — ce qui
      // est le comportement voulu (pas d'urgence à signaler).
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-08');

      const rb = store.remainingBudget();
      expect(rb.provisionsRemaining).toBe(0);
    });

    it("10. récurrent confirmé le mois précédent ne fuite pas dans le mois affiché", async () => {
      seedBaseIncome();
      fakeClient.seed('incomes', [
        {
          id: 'i2', amount: 3000, type: 'Salaire', date: '2026-06-01', owner: 'moi', note: '',
          recurring: false, recurring_interval: 'once', recurring_start_month: '2026-06',
        },
      ]);
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Loyer', amount: 1000, category: 'Loyer', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      // Confirmé en juin seulement — pas de dépense liée en juillet.
      fakeClient.seed('expenses', [
        {
          id: 'e1', amount: 1000, category: 'Loyer', date: '2026-06-01', owner: 'moi', cc: false,
          recurring_source_id: 'r1',
        },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07'); // le mois affiché n'a pas encore de confirmation

      const rb = store.remainingBudget();
      expect(rb.spent).toBe(0); // le loyer de juin n'est pas compté en juillet
      expect(rb.recurringRemaining).toBe(1000); // toujours attendu pour juillet
    });
  });

  describe('smartAlerts — chevauchement provision / dépense récurrente (info)', () => {
    it('11. même catégorie, provision + récurrent actif : alerte info', async () => {
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Assurance', amount: 1200, every_n: 6, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Assurance', owner: 'moi',
          auto_recalibrate: false, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Assurance auto', amount: 100, category: 'Assurance', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const alerts = store.smartAlerts();
      const collision = alerts.find((a) => a.message.includes('Assurance') && a.message.includes('provision'));
      expect(collision).toBeDefined();
      expect(collision?.severity).toBe('info');
    });

    it('12. catégories différentes : aucune alerte de chevauchement', async () => {
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Assurance', amount: 1200, every_n: 6, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Assurance', owner: 'moi',
          auto_recalibrate: false, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Leasing', amount: 500, category: 'Auto', owner: 'moi', day_of_month: 1, cc: false, active: true },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const alerts = store.smartAlerts();
      const collision = alerts.find((a) => a.message.includes('provision et une dépense récurrente'));
      expect(collision).toBeUndefined();
    });

    it('13. récurrent inactif : aucune alerte, même catégorie partagée', async () => {
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Assurance', amount: 1200, every_n: 6, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Assurance', owner: 'moi',
          auto_recalibrate: false, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Assurance auto', amount: 100, category: 'Assurance', owner: 'moi', day_of_month: 1, cc: false, active: false },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const alerts = store.smartAlerts();
      const collision = alerts.find((a) => a.message.includes('provision et une dépense récurrente'));
      expect(collision).toBeUndefined();
    });
  });

  // Bug rapporté par l'utilisateur (capture d'écran) : "Loyer : dépassement
  // de 0,00 $" alors que la dépense était exactement égale au budget de
  // catégorie — pas un vrai dépassement. Comparer sur le pourcentage
  // (spent/budget*100 >= 100) déclenchait ce cas limite ; on compare
  // maintenant le montant réel restant.
  describe('smartAlerts — budget de catégorie/global exactement atteint (pas dépassé)', () => {
    it("aucune alerte 'dépassement' quand une catégorie est exactement à 100 % de son budget", async () => {
      fakeClient.seed('category_budgets', [
        { id: 'cb1', owner: 'moi', ym: '2026-07', category: 'Loyer', amount: 1000 },
      ]);
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 1000, category: 'Loyer', date: '2026-07-01', owner: 'moi', cc: false },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const alerts = store.smartAlerts();
      const overspend = alerts.find((a) => a.message.startsWith('Loyer'));
      // Pas d'alerte "dépassement" avec 0,00 $ — au pire une alerte info
      // "à 100 % du budget", jamais un severity 'warning' avec 0,00 $.
      if (overspend) {
        expect(overspend.message).not.toContain('dépassement');
        expect(overspend.severity).toBe('info');
      }
    });

    it("affiche bien une alerte 'dépassement' avec le vrai montant quand la catégorie est réellement dépassée", async () => {
      fakeClient.seed('category_budgets', [
        { id: 'cb1', owner: 'moi', ym: '2026-07', category: 'Loyer', amount: 1000 },
      ]);
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 1050, category: 'Loyer', date: '2026-07-01', owner: 'moi', cc: false },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set('2026-07');

      const alerts = store.smartAlerts();
      const overspend = alerts.find((a) => a.message.startsWith('Loyer'));
      expect(overspend?.message).toBe(`Loyer : dépassement de ${fmt(50)}.`);
      expect(overspend?.severity).toBe('warning');
    });

    it("aucune alerte 'Budget dépassé' quand le budget global est exactement atteint", async () => {
      // L'alerte "Budget dépassé" ne se déclenche que pour le mois réel en
      // cours (isCurrentMonth) — pas pour un mois passé/futur affiché.
      const todayYm = ymOf(new Date());
      fakeClient.seed('budgets', [{ id: 'b1', owner: 'moi', ym: todayYm, amount: 500 }]);
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 500, category: 'Courses', date: `${todayYm}-01`, owner: 'moi', cc: false },
      ]);
      await store.loadAll();
      store.activeOwner.set('moi');
      store.current.set(todayYm);

      const alerts = store.smartAlerts();
      expect(alerts.find((a) => a.message.startsWith('Budget dépassé'))).toBeUndefined();
    });
  });

  describe('expectedThisMonth (computed) — fréquences autres que mensuel', () => {
    it("un gabarit 'monthly' garde son comportement d'origine : une seule suggestion, masquée après une confirmation", async () => {
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Loyer', amount: 1000, category: 'Loyer', owner: 'moi', interval: 'monthly', day_of_month: 1, cc: false, active: true },
      ]);
      await store.loadAll();
      store.current.set('2026-07');

      expect(store.expectedThisMonth()).toHaveLength(1);
      expect(store.expectedThisMonth()[0].suggestedDate).toBe('2026-07-01');

      await store.confirmRecurringExpense('r1', 1000, '2026-07-03', false); // date éditée, différente de la suggestion
      expect(store.expectedThisMonth()).toHaveLength(0); // masqué malgré la date différente (comportement d'origine)
    });

    it("un gabarit 'biweekly' produit plusieurs suggestions le même mois", async () => {
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Ménage', amount: 80, category: 'Autre', owner: 'moi', interval: 'biweekly', day_of_month: 1, start_date: '2026-07-03', cc: false, active: true },
      ]);
      await store.loadAll();
      store.current.set('2026-07');

      const items = store.expectedThisMonth();
      expect(items.map((i) => i.suggestedDate)).toEqual(['2026-07-03', '2026-07-17', '2026-07-31']);
    });

    it('confirmer une occurrence retire seulement UNE suggestion du gabarit biweekly, pas toutes', async () => {
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Ménage', amount: 80, category: 'Autre', owner: 'moi', interval: 'biweekly', day_of_month: 1, start_date: '2026-07-03', cc: false, active: true },
      ]);
      await store.loadAll();
      store.current.set('2026-07');

      await store.confirmRecurringExpense('r1', 80, '2026-07-03', false);

      const items = store.expectedThisMonth();
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.suggestedDate)).toEqual(['2026-07-17', '2026-07-31']);
    });

    it("un gabarit 'semimonthly' produit deux suggestions, l'une confirmable indépendamment de l'autre", async () => {
      fakeClient.seed('recurring_expenses', [
        { id: 'r1', name: 'Épicerie fixe', amount: 150, category: 'Courses', owner: 'moi', interval: 'semimonthly', day_of_month: 5, second_day_of_month: 20, cc: false, active: true },
      ]);
      await store.loadAll();
      store.current.set('2026-07');

      expect(store.expectedThisMonth().map((i) => i.suggestedDate)).toEqual(['2026-07-05', '2026-07-20']);

      await store.confirmRecurringExpense('r1', 150, '2026-07-05', false);
      expect(store.expectedThisMonth().map((i) => i.suggestedDate)).toEqual(['2026-07-20']);
    });
  });

  describe('Clôture de mois', () => {
    it('isMonthClosed() est false par défaut, true après closeMonth(), false après reopenMonth()', async () => {
      await store.loadAll();

      expect(store.isMonthClosed('2026-07')).toBe(false);

      await store.closeMonth('2026-07');
      expect(store.isMonthClosed('2026-07')).toBe(true);
      // N'affecte pas les autres mois.
      expect(store.isMonthClosed('2026-08')).toBe(false);

      await store.reopenMonth('2026-07');
      expect(store.isMonthClosed('2026-07')).toBe(false);
    });

    it('currentMonthClosed reflète le mois affiché (store.current)', async () => {
      await store.loadAll();
      store.current.set('2026-07');

      expect(store.currentMonthClosed()).toBe(false);
      await store.closeMonth('2026-07');
      expect(store.currentMonthClosed()).toBe(true);

      store.current.set('2026-08');
      expect(store.currentMonthClosed()).toBe(false); // un autre mois, jamais clôturé
    });

    it('loadAll() restaure les mois clôturés déjà persistés', async () => {
      fakeClient.seed('closed_months', [{ id: 'c1', ym: '2026-06' }]);
      await store.loadAll();

      expect(store.isMonthClosed('2026-06')).toBe(true);
      expect(store.isMonthClosed('2026-07')).toBe(false);
    });

    it('addExpense() est bloqué pour un mois clôturé', async () => {
      await store.loadAll();
      await store.closeMonth('2026-07');

      await expect(
        store.addExpense({ amount: 50, category: 'Courses', date: '2026-07-15', owner: 'moi', cc: false }),
      ).rejects.toThrow(/clôturé/);
    });

    it("removeExpense() est bloqué si la dépense existante appartient à un mois clôturé", async () => {
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 50, category: 'Courses', date: '2026-07-15', owner: 'moi', cc: false },
      ]);
      await store.loadAll();
      await store.closeMonth('2026-07');

      await expect(store.removeExpense('e1')).rejects.toThrow(/clôturé/);
      // La dépense n'a pas été supprimée du signal local.
      expect(store.expenses().some((e) => e.id === 'e1')).toBe(true);
    });

    it("updateExpense() est bloqué si on essaie de déplacer une dépense vers un mois clôturé", async () => {
      fakeClient.seed('expenses', [
        { id: 'e1', amount: 50, category: 'Courses', date: '2026-08-01', owner: 'moi', cc: false },
      ]);
      await store.loadAll();
      await store.closeMonth('2026-07');

      await expect(store.updateExpense('e1', { date: '2026-07-20' })).rejects.toThrow(/clôturé/);
    });

    it("addIncome() ponctuel bloqué, mais un revenu récurrent n'est pas affecté (entité structurelle)", async () => {
      await store.loadAll();
      await store.closeMonth('2026-07');

      await expect(
        store.addIncome({
          amount: 100, type: 'Autre', date: '2026-07-05', owner: 'moi', note: '',
          recurring: false, recurringInterval: 'once', recurringStartMonth: '2026-07',
        }),
      ).rejects.toThrow(/clôturé/);

      // Un revenu récurrent démarrant ce même mois n'est PAS une
      // transaction datée unique — sa création n'est pas bloquée.
      await expect(
        store.addIncome({
          amount: 3000, type: 'Salaire', date: '2026-07-01', owner: 'moi', note: '',
          recurring: true, recurringInterval: 'monthly', recurringStartMonth: '2026-07',
        }),
      ).resolves.not.toThrow();
    });

    it('addProvisionAdjustment() est bloqué pour un mois clôturé', async () => {
      fakeClient.seed('provisions', [
        {
          id: 'p1', name: 'Assurance', amount: 1200, every_n: 6, interval_unit: 'months',
          start_ym: '2026-01', start_date: null, category: 'Assurance', owner: 'moi',
          auto_recalibrate: false, allocation_percent: 0, rolling_count: 0,
        },
      ]);
      await store.loadAll();
      await store.closeMonth('2026-07');

      await expect(
        store.addProvisionAdjustment('p1', 100, '2026-07-10', 'Cotisation'),
      ).rejects.toThrow(/clôturé/);
    });

    it('setCategoryBudget() et resetExpensesForMonth() sont bloqués directement sur le ym clôturé', async () => {
      await store.loadAll();
      await store.closeMonth('2026-07');

      await expect(store.setCategoryBudget('moi', '2026-07', 'Courses', 400)).rejects.toThrow(/clôturé/);
      await expect(store.resetExpensesForMonth('2026-07')).rejects.toThrow(/clôturé/);
    });

    it("n'affecte pas les entités structurelles : addProvision reste possible même mois clôturé", async () => {
      await store.loadAll();
      await store.closeMonth('2026-07');
      store.current.set('2026-07');

      await expect(
        store.addProvision({
          name: 'Nouvelle provision', amount: 500, everyN: 12, intervalUnit: 'months',
          startYM: '2026-07', startDate: '', category: 'Divers', owner: 'moi',
          autoRecalibrate: false, allocationPercent: 0, rollingCount: 0,
        }),
      ).resolves.not.toThrow();
    });
  });
});
