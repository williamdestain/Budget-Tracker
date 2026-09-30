import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseForm } from './expense-form';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { Owner } from '../../../core/models/budget.models';

function makeFakeStore(opts: {
  activeOwner?: WritableSignal<'moi' | 'madame' | 'global'>;
  myMemberId?: string | null;
  categories?: WritableSignal<string[]>;
  memberOptions?: { id: Owner }[];
  addExpense?: ReturnType<typeof vi.fn>;
} = {}) {
  const activeOwner = opts.activeOwner ?? signal<'moi' | 'madame' | 'global'>('moi');
  const categories = opts.categories ?? signal<string[]>(['Épicerie', 'Transport']);
  return {
    activeOwner,
    myMemberId: () => opts.myMemberId ?? null,
    activeCategoryNames: categories,
    memberOptions: () => opts.memberOptions ?? [{ id: 'moi' }, { id: 'madame' }],
    addExpense: opts.addExpense ?? vi.fn().mockResolvedValue({}),
  } as unknown as BudgetStore;
}

function createFixture(store: BudgetStore, toastShow = vi.fn()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: store },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  const fixture = TestBed.createComponent(ExpenseForm);
  fixture.detectChanges();
  return { fixture, toastShow };
}

describe('ExpenseForm', () => {
  it('exclut "Revenu" et "Remboursement Carte Crédit" des catégories proposées', () => {
    const store = makeFakeStore({
      categories: signal(['Épicerie', 'Revenu', 'Remboursement Carte Crédit', 'Loisirs']),
    });
    const { fixture } = createFixture(store);
    expect(fixture.componentInstance.categories()).toEqual(['Épicerie', 'Loisirs']);
  });

  it("aligne le profil du formulaire sur l'onglet actif à la création", () => {
    const store = makeFakeStore({ activeOwner: signal('madame') });
    const { fixture } = createFixture(store);
    expect(fixture.componentInstance.owner).toBe('madame');
  });

  it('en vue "global", choisit un vrai membre du foyer (foyer historique : le premier)', () => {
    const store = makeFakeStore({ activeOwner: signal('global') });
    const { fixture } = createFixture(store);
    expect(fixture.componentInstance.owner).toBe('moi');
  });

  // Foyer créé depuis la migration 024 : les identifiants sont des UUID.
  // Ancien comportement : le formulaire envoyait 'moi', un membre inexistant.
  describe('foyer à identifiants UUID, vue "global"', () => {
    const ALEX = '3f9c1c1e-0000-4000-8000-000000000001';
    const SAM = '3f9c1c1e-0000-4000-8000-000000000002';

    it("préselectionne le membre connecté, jamais 'moi'", () => {
      const store = makeFakeStore({
        activeOwner: signal('global'),
        memberOptions: [{ id: ALEX }, { id: SAM }],
        myMemberId: SAM,
      });
      const { fixture } = createFixture(store);
      expect(fixture.componentInstance.owner).toBe(SAM);
    });

    it('sans membre connecté connu, retombe sur le premier membre', () => {
      const store = makeFakeStore({
        activeOwner: signal('global'),
        memberOptions: [{ id: ALEX }, { id: SAM }],
      });
      const { fixture } = createFixture(store);
      expect(fixture.componentInstance.owner).toBe(ALEX);
    });

    it('la dépense enregistrée porte un vrai memberId', async () => {
      const addExpense = vi.fn().mockResolvedValue({});
      const store = makeFakeStore({
        activeOwner: signal('global'),
        memberOptions: [{ id: ALEX }, { id: SAM }],
        myMemberId: ALEX,
        addExpense,
      });
      const { fixture } = createFixture(store);
      fixture.componentInstance.amount = 25;
      await fixture.componentInstance.submit();
      expect(addExpense).toHaveBeenCalledWith(expect.objectContaining({ memberId: ALEX }));
    });
  });

  it('pré-sélectionne la première catégorie une fois la liste chargée', () => {
    const catSignal = signal<string[]>([]);
    const store = makeFakeStore({ categories: catSignal });
    const { fixture } = createFixture(store);
    expect(fixture.componentInstance.category).toBe('');

    catSignal.set(['Épicerie', 'Transport']);
    fixture.detectChanges();
    expect(fixture.componentInstance.category).toBe('Épicerie');
  });

  it("ne soumet rien si le montant est nul, absent, <= 0, ou si la date est vide", async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.amount = 0;
    fixture.componentInstance.date = '2026-09-01';
    await fixture.componentInstance.submit();
    expect(store.addExpense).not.toHaveBeenCalled();

    fixture.componentInstance.amount = 50;
    fixture.componentInstance.date = '';
    await fixture.componentInstance.submit();
    expect(store.addExpense).not.toHaveBeenCalled();
  });

  it('soumet une dépense valide et réinitialise montant / cc / versementToMemberId (pas la catégorie ni la date)', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.amount = 42.5;
    fixture.componentInstance.category = 'Épicerie';
    fixture.componentInstance.date = '2026-09-15';
    fixture.componentInstance.cc = true;

    await fixture.componentInstance.submit();

    expect(store.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 42.5,
        category: 'Épicerie',
        date: '2026-09-15',
        cc: true,
        versementToMemberId: null,
      }),
    );
    expect(fixture.componentInstance.amount).toBeNull();
    expect(fixture.componentInstance.cc).toBe(false);
    expect(fixture.componentInstance.category).toBe('Épicerie');
    expect(fixture.componentInstance.date).toBe('2026-09-15');
  });

  it('pour un Versement sans destinataire choisi, retient automatiquement l\'autre membre du foyer', async () => {
    const store = makeFakeStore({ memberOptions: [{ id: 'moi' }, { id: 'madame' }] });
    const { fixture } = createFixture(store);
    fixture.componentInstance.amount = 100;
    fixture.componentInstance.category = 'Versement';
    fixture.componentInstance.date = '2026-09-15';
    fixture.componentInstance.owner = 'moi';
    fixture.componentInstance.versementToMemberId = null;

    await fixture.componentInstance.submit();

    expect(store.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Versement', versementToMemberId: 'madame' }),
    );
  });

  it('respecte un destinataire de versement explicitement choisi', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.amount = 100;
    fixture.componentInstance.category = 'Versement';
    fixture.componentInstance.date = '2026-09-15';
    fixture.componentInstance.versementToMemberId = 'madame';

    await fixture.componentInstance.submit();

    expect(store.addExpense).toHaveBeenCalledWith(
      expect.objectContaining({ versementToMemberId: 'madame' }),
    );
  });

  it("affiche un message d'erreur via ToastService si l'ajout échoue, sans planter", async () => {
    const store = makeFakeStore({ addExpense: vi.fn().mockRejectedValue(new Error('Solde insuffisant')) });
    const { fixture, toastShow } = createFixture(store);
    fixture.componentInstance.amount = 20;
    fixture.componentInstance.date = '2026-09-15';

    await fixture.componentInstance.submit();

    expect(toastShow).toHaveBeenCalledWith('Solde insuffisant');
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it("affiche un message générique si l'erreur n'est pas une instance d'Error", async () => {
    const store = makeFakeStore({ addExpense: vi.fn().mockRejectedValue('boom') });
    const { fixture, toastShow } = createFixture(store);
    fixture.componentInstance.amount = 20;
    fixture.componentInstance.date = '2026-09-15';

    await fixture.componentInstance.submit();

    expect(toastShow).toHaveBeenCalledWith('Une erreur est survenue.');
  });
});
