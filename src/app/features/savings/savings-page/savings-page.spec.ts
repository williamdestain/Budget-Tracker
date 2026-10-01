import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SavingsPage } from './savings-page';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { SavingsGoal } from '../../../core/models/budget.models';
import { isoOfDate } from '../../../core/utils/date.utils';

const TODAY = isoOfDate(new Date());
const CURRENT_YM = TODAY.slice(0, 7);
const FUTURE = '2999-01-01';
const PAST = '2000-01-01';

const c = (date: string, amount: number, id = `${date}-${amount}`) => ({ id, amount, date, note: '' });

function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return { id: 'g1', name: 'Voyage', targetAmount: 1000, targetDate: null, memberId: 'm1', contributions: [], ...overrides };
}

interface StoreOpts {
  goals?: SavingsGoal[];
  owner?: string;
  myMemberId?: string | null;
  addSavingsGoal?: ReturnType<typeof vi.fn>;
  addSavingsGoalContribution?: ReturnType<typeof vi.fn>;
  removeSavingsGoalContribution?: ReturnType<typeof vi.fn>;
  removeSavingsGoal?: ReturnType<typeof vi.fn>;
}

function makeFakeStore(opts: StoreOpts = {}) {
  const goals = opts.goals ?? [];
  const owner = opts.owner ?? 'global';
  return {
    visibleSavingsGoals: () => (owner === 'global' ? goals : goals.filter((g) => g.memberId === owner)),
    activeOwner: () => owner,
    myMemberId: () => opts.myMemberId ?? null,
    memberName: (id: string) => (id === 'm1' ? 'Alex' : id === 'm2' ? 'Sam' : id),
    memberOptions: () => [
      { id: 'm1', name: 'Alex', color: '#000' },
      { id: 'm2', name: 'Sam', color: '#111' },
    ],
    addSavingsGoal: opts.addSavingsGoal ?? vi.fn().mockResolvedValue(undefined),
    addSavingsGoalContribution: opts.addSavingsGoalContribution ?? vi.fn().mockResolvedValue(undefined),
    removeSavingsGoalContribution: opts.removeSavingsGoalContribution ?? vi.fn().mockResolvedValue(undefined),
    removeSavingsGoal: opts.removeSavingsGoal ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
}

function createFixture(store: BudgetStore) {
  TestBed.resetTestingModule();
  const toastShow = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: store },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  const fixture = TestBed.createComponent(SavingsPage);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, toastShow };
}

describe('SavingsPage', () => {
  describe('affichage', () => {
    it('affiche un état vide sans objectif', () => {
      const { fixture, cmp } = createFixture(makeFakeStore());
      expect(cmp.rows()).toEqual([]);
      expect(fixture.nativeElement.textContent).toContain("Aucun objectif d'épargne");
    });

    it("calcule cagnotte, pourcentage arrondi et évolution du mois d'un objectif", () => {
      const goal = makeGoal({ targetAmount: 300, contributions: [c(`${CURRENT_YM}-01`, 100), c('2000-01-01', 0.01)] });
      const row = createFixture(makeFakeStore({ goals: [goal] })).cmp.rows()[0];
      expect(row.pot).toBe(100.01);
      expect(row.pct).toBe(33);
      expect(row.thisMonth).toBe(100);
      expect(row.ownerLabel).toBe('Alex');
    });

    it('le total agrège tous les objectifs visibles (épargné, cible, atteints, ce mois-ci)', () => {
      const goals = [
        makeGoal({ id: 'a', targetAmount: 100, contributions: [c(`${CURRENT_YM}-02`, 100)] }),
        makeGoal({ id: 'b', targetAmount: 900, contributions: [c(`${CURRENT_YM}-03`, 50.5)] }),
      ];
      const { cmp } = createFixture(makeFakeStore({ goals }));
      expect(cmp.summary()).toEqual({ count: 2, saved: 150.5, target: 1000, reached: 1, thisMonth: 150.5 });
    });

    it('un membre ne voit que ses objectifs', () => {
      const goals = [makeGoal({ id: 'a', memberId: 'm1' }), makeGoal({ id: 'b', memberId: 'm2' })];
      const { cmp } = createFixture(makeFakeStore({ goals, owner: 'm2' }));
      expect(cmp.rows().map((r) => r.goal.id)).toEqual(['b']);
    });

    it("le rythme est null pour un objectif sans historique complet, pas 0", () => {
      const goal = makeGoal({ contributions: [c(`${CURRENT_YM}-01`, 500)] });
      expect(createFixture(makeFakeStore({ goals: [goal] })).cmp.rows()[0].rhythm).toBeNull();
    });

    it("statusText n'utilise aucun emoji et reflète chaque état", () => {
      const overdue = makeGoal({ id: 'o', targetDate: PAST, contributions: [c('1999-01-01', 400)] });
      const reached = makeGoal({ id: 'r', targetAmount: 50, contributions: [c('2020-01-01', 50)] });
      const open = makeGoal({ id: 'p' });
      const { cmp } = createFixture(makeFakeStore({ goals: [overdue, reached, open] }));
      const texts = cmp.rows().map((r) => cmp.statusText(r));
      expect(texts[0]).toContain('Date cible dépassée');
      expect(texts[1]).toBe('Objectif atteint');
      expect(texts[2]).toContain('Il manque');
      expect(texts.join('')).not.toMatch(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u);
    });
  });

  describe('ajout d’un objectif', () => {
    it("openAdd() réinitialise et propose le profil actif ; en vue globale, le membre connecté", () => {
      const member = createFixture(makeFakeStore({ owner: 'm2' })).cmp;
      member.name = 'Ancien';
      member.openAdd();
      expect(member.name).toBe('');
      expect(member.ownerId).toBe('m2');
      expect(member.addOpen()).toBe(true);

      const connected = createFixture(makeFakeStore({ owner: 'global', myMemberId: 'm2' })).cmp;
      connected.openAdd();
      expect(connected.ownerId).toBe('m2');

      const unknown = createFixture(makeFakeStore({ owner: 'global' })).cmp;
      unknown.openAdd();
      expect(unknown.ownerId).toBe('m1');
    });

    it('ne fait rien sans nom, ou sans montant cible strictement positif', async () => {
      const store = makeFakeStore();
      const { cmp } = createFixture(store);
      cmp.openAdd();
      cmp.name = '   ';
      cmp.targetAmount = 100;
      await cmp.submitAdd();
      cmp.name = 'Voyage';
      cmp.targetAmount = 0;
      await cmp.submitAdd();
      cmp.targetAmount = -5;
      await cmp.submitAdd();
      expect(store.addSavingsGoal).not.toHaveBeenCalled();
    });

    it('crée l’objectif (nom rogné, date vide → null, propriétaire choisi) et notifie', async () => {
      const store = makeFakeStore();
      const { cmp, toastShow } = createFixture(store);
      cmp.openAdd();
      cmp.name = '  Vacances  ';
      cmp.targetAmount = 2500;
      cmp.ownerId = 'm2';
      await cmp.submitAdd();
      expect(store.addSavingsGoal).toHaveBeenCalledWith({
        name: 'Vacances',
        targetAmount: 2500,
        targetDate: null,
        memberId: 'm2',
      });
      expect(cmp.addOpen()).toBe(false);
      expect(toastShow).toHaveBeenCalledWith('Objectif créé.');
    });

    it('refuse une date cible dans le passé', async () => {
      const store = makeFakeStore();
      const { cmp, toastShow } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'Voyage';
      cmp.targetAmount = 100;
      cmp.targetDate = PAST;
      await cmp.submitAdd();
      expect(store.addSavingsGoal).not.toHaveBeenCalled();
      expect(toastShow).toHaveBeenCalledWith('La date cible ne peut pas être dans le passé.');
    });

    it("accepte une date cible aujourd'hui ou plus tard", async () => {
      const store = makeFakeStore();
      const { cmp } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'Voyage';
      cmp.targetAmount = 100;
      cmp.targetDate = TODAY;
      await cmp.submitAdd();
      expect(store.addSavingsGoal).toHaveBeenCalledWith(expect.objectContaining({ targetDate: TODAY }));
    });

    it("affiche l'erreur du store, garde la modale ouverte et réactive le bouton", async () => {
      const store = makeFakeStore({ addSavingsGoal: vi.fn().mockRejectedValue(new Error('Réseau')) });
      const { cmp, toastShow } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'Voyage';
      cmp.targetAmount = 100;
      await cmp.submitAdd();
      expect(toastShow).toHaveBeenCalledWith('Réseau');
      expect(cmp.addOpen()).toBe(true);
      expect(cmp.saving()).toBe(false);
    });
  });

  describe('contributions', () => {
    const base = () => makeFakeStore({ goals: [makeGoal({ contributions: [c('2026-01-01', 10, 'x')] })] });

    it("openDetail() sélectionne l'objectif et remet le formulaire à zéro", () => {
      const { cmp } = createFixture(base());
      cmp.amount = 5;
      cmp.openDetail('g1');
      expect(cmp.selected()?.goal.id).toBe('g1');
      expect(cmp.amount).toBeNull();
      expect(cmp.date).toBe(TODAY);
    });

    it("l'historique est trié du plus récent au plus ancien", () => {
      const goal = makeGoal({ contributions: [c('2026-01-01', 1, 'a'), c('2026-03-01', 3, 'c'), c('2026-02-01', 2, 'b')] });
      const { cmp } = createFixture(makeFakeStore({ goals: [goal] }));
      cmp.openDetail('g1');
      expect(cmp.contributions().map((x) => x.id)).toEqual(['c', 'b', 'a']);
    });

    it('submitContribution() enregistre (note rognée) puis vide le formulaire', async () => {
      const store = base();
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('g1');
      cmp.amount = 75.5;
      cmp.note = '  bonus  ';
      await cmp.submitContribution();
      expect(store.addSavingsGoalContribution).toHaveBeenCalledWith('g1', 75.5, TODAY, 'bonus');
      expect(cmp.amount).toBeNull();
      expect(toastShow).toHaveBeenCalledWith('Montant ajouté.');
    });

    it('refuse un montant nul/négatif ou absent sans appeler le store', async () => {
      const store = base();
      const { cmp } = createFixture(store);
      cmp.openDetail('g1');
      for (const value of [null, 0, -10]) {
        cmp.amount = value;
        await cmp.submitContribution();
      }
      expect(store.addSavingsGoalContribution).not.toHaveBeenCalled();
    });

    it('refuse une date future (elle gonflerait la cagnotte immédiatement)', async () => {
      const store = base();
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('g1');
      cmp.amount = 10;
      cmp.date = FUTURE;
      await cmp.submitContribution();
      expect(store.addSavingsGoalContribution).not.toHaveBeenCalled();
      expect(toastShow).toHaveBeenCalledWith('La date ne peut pas être dans le futur.');
    });

    it('remonte le refus du store pour un mois clôturé et garde la saisie', async () => {
      const store = makeFakeStore({
        goals: [makeGoal()],
        addSavingsGoalContribution: vi.fn().mockRejectedValue(new Error('Ce mois est clôturé.')),
      });
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('g1');
      cmp.amount = 40;
      await cmp.submitContribution();
      expect(toastShow).toHaveBeenCalledWith('Ce mois est clôturé.');
      expect(cmp.amount).toBe(40);
      expect(cmp.saving()).toBe(false);
    });

    it('la suppression d’un ajout demande une confirmation avant de toucher au store', async () => {
      const store = base();
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('g1');
      await cmp.removeContribution('x');
      expect(store.removeSavingsGoalContribution).not.toHaveBeenCalled();
      expect(cmp.confirmRemoveId()).toBe('x');
      await cmp.removeContribution('x');
      expect(store.removeSavingsGoalContribution).toHaveBeenCalledWith('g1', 'x');
      expect(cmp.confirmRemoveId()).toBeNull();
      expect(toastShow).toHaveBeenCalledWith('Ajout supprimé.');
    });

    it("confirmer un AUTRE ajout ne supprime pas le premier (la confirmation est par ligne)", async () => {
      const goal = makeGoal({ contributions: [c('2026-01-01', 1, 'a'), c('2026-02-01', 2, 'b')] });
      const store = makeFakeStore({ goals: [goal] });
      const { cmp } = createFixture(store);
      cmp.openDetail('g1');
      await cmp.removeContribution('a');
      await cmp.removeContribution('b'); // 1er clic sur b : redemande, ne supprime rien
      expect(store.removeSavingsGoalContribution).not.toHaveBeenCalled();
      expect(cmp.confirmRemoveId()).toBe('b');
    });

    it("affiche le refus du store si la suppression échoue (mois clôturé) et annule la confirmation", async () => {
      const store = makeFakeStore({
        goals: [makeGoal({ contributions: [c('2026-01-01', 1, 'a')] })],
        removeSavingsGoalContribution: vi.fn().mockRejectedValue(new Error('Ce mois est clôturé.')),
      });
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('g1');
      await cmp.removeContribution('a');
      await cmp.removeContribution('a');
      expect(toastShow).toHaveBeenCalledWith('Ce mois est clôturé.');
      expect(cmp.confirmRemoveId()).toBeNull();
    });
  });

  describe('suppression d’un objectif', () => {
    it('demande une confirmation avant de supprimer', async () => {
      const store = makeFakeStore({ goals: [makeGoal()] });
      const { cmp } = createFixture(store);
      cmp.openDetail('g1');
      await cmp.deleteGoal();
      expect(store.removeSavingsGoal).not.toHaveBeenCalled();
      expect(cmp.confirmDelete()).toBe(true);
    });

    it('supprime au second appel, ferme le détail et notifie', async () => {
      const store = makeFakeStore({ goals: [makeGoal()] });
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('g1');
      await cmp.deleteGoal();
      await cmp.deleteGoal();
      expect(store.removeSavingsGoal).toHaveBeenCalledWith('g1');
      expect(cmp.selectedId()).toBeNull();
      expect(toastShow).toHaveBeenCalledWith('Objectif supprimé.');
    });

    it('fermer puis rouvrir annule la confirmation en attente', async () => {
      const { cmp } = createFixture(makeFakeStore({ goals: [makeGoal()] }));
      cmp.openDetail('g1');
      await cmp.deleteGoal();
      cmp.closeDetail();
      cmp.openDetail('g1');
      expect(cmp.confirmDelete()).toBe(false);
    });

    it("affiche l'erreur du store et annule la confirmation si la suppression échoue", async () => {
      const store = makeFakeStore({
        goals: [makeGoal()],
        removeSavingsGoal: vi.fn().mockRejectedValue(new Error('Introuvable')),
      });
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('g1');
      await cmp.deleteGoal();
      await cmp.deleteGoal();
      expect(toastShow).toHaveBeenCalledWith('Introuvable');
      expect(cmp.confirmDelete()).toBe(false);
      expect(cmp.selectedId()).toBe('g1');
    });
  });

  describe('envoi réel du formulaire (clic sur le bouton)', () => {
    it("un clic sur « Créer l'objectif » enregistre l'objectif", async () => {
      const store = makeFakeStore();
      const { fixture, cmp } = createFixture(store);
      cmp.openAdd();
      fixture.detectChanges();
      await fixture.whenStable(); // ngModel s'enregistre de façon asynchrone
      const el = fixture.nativeElement as HTMLElement;
      const fill = (selector: string, value: string) => {
        const input = el.querySelector(selector) as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };
      fill('#goal-name', 'Voyage');
      fill('#goal-amount', '1500');
      fixture.detectChanges();
      (el.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(store.addSavingsGoal).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Voyage', targetAmount: 1500, memberId: 'm1' }),
      );
    });
  });
});
