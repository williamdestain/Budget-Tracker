import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ExpenseList } from './expense-list';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { CountedExpense } from '../../../core/utils/provision.utils';
import { Expense, Provision } from '../../../core/models/budget.models';

function makeExpense(overrides: Partial<CountedExpense> = {}): CountedExpense {
  return {
    id: 'e1',
    amount: 50,
    category: 'Épicerie',
    date: '2026-09-10',
    memberId: 'moi',
    cc: false,
    ...overrides,
  };
}

function makeRealExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    amount: 50,
    category: 'Épicerie',
    date: '2026-09-10',
    memberId: 'moi',
    cc: false,
    ...overrides,
  };
}

function makeFakeStore(opts: {
  visibleExpenses?: CountedExpense[];
  countedExpensesList?: CountedExpense[];
  activeOwner?: 'moi' | 'madame' | 'global';
  provisions?: Partial<Provision>[];
  categories?: string[];
} = {}) {
  return {
    visibleExpenses: () => opts.visibleExpenses ?? [],
    countedExpensesList: () => opts.countedExpensesList ?? [],
    activeOwner: () => opts.activeOwner ?? 'moi',
    activeCategoryNames: () => opts.categories ?? ['Épicerie', 'Transport'],
    provisions: () => opts.provisions ?? [],
    colorFor: (c: string) => `color-${c}`,
    memberName: (owner: string) => (owner === 'moi' ? 'Moi' : owner === 'madame' ? 'Madame' : owner),
    memberOptions: () => [{ id: 'moi' }, { id: 'madame' }],
    removeExpense: vi.fn(),
    cancelVersementSplit: vi.fn(),
    removeProvisionAdjustment: vi.fn(),
    updateExpense: vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
}

function createFixture(store: BudgetStore) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: BudgetStore, useValue: store }] });
  const fixture = TestBed.createComponent(ExpenseList);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExpenseList', () => {
  it('exclut "Revenu" et "Remboursement Carte Crédit" des catégories proposées à l\'édition', () => {
    const fixture = createFixture(
      makeFakeStore({ categories: ['Épicerie', 'Revenu', 'Remboursement Carte Crédit'] }),
    );
    expect(fixture.componentInstance.categoryOptions()).toEqual(['Épicerie']);
  });

  it("garde la catégorie en cours d'édition en tête même si elle a été archivée depuis", () => {
    const fixture = createFixture(makeFakeStore({ categories: ['Épicerie'] }));
    fixture.componentInstance.editCategory = 'Ancienne catégorie';
    expect(fixture.componentInstance.categoryOptions()).toEqual(['Ancienne catégorie', 'Épicerie']);
  });

  it('fusionne dépenses réelles et réserves de provisions, triées par date puis id décroissants', () => {
    const store = makeFakeStore({
      visibleExpenses: [makeExpense({ id: 'e1', date: '2026-09-05' })],
      countedExpensesList: [
        makeExpense({ id: 'e1', date: '2026-09-05' }), // dépense réelle, pas une réserve → exclue
        makeExpense({ id: 'prov-1', date: '2026-09-20', provision: true }),
        makeExpense({ id: 'prov-2', date: '2026-09-01', provision: true }),
      ],
    });
    const fixture = createFixture(store);
    const ids = fixture.componentInstance.mergedList().map((e) => e.id);
    expect(ids).toEqual(['prov-1', 'e1', 'prov-2']);
  });

  it('realCount ne compte que les dépenses réelles (pas les réserves)', () => {
    const store = makeFakeStore({
      visibleExpenses: [makeExpense({ id: 'e1' }), makeExpense({ id: 'e2' })],
      countedExpensesList: [makeExpense({ id: 'prov-1', provision: true })],
    });
    const fixture = createFixture(store);
    expect(fixture.componentInstance.realCount).toBe(2);
    expect(fixture.componentInstance.provisionEntryCount).toBe(1);
  });

  it('otherOwner() retourne l\'autre membre du foyer', () => {
    const fixture = createFixture(makeFakeStore());
    expect(fixture.componentInstance.otherOwner('moi')).toBe('madame');
    expect(fixture.componentInstance.otherOwner('madame')).toBe('moi');
  });

  it('transferRecipient() utilise versementToMemberId si présent, sinon l\'autre membre', () => {
    const fixture = createFixture(makeFakeStore());
    expect(
      fixture.componentInstance.transferRecipient(
        makeRealExpense({ memberId: 'moi', versementToMemberId: 'madame' }),
      ),
    ).toBe('Madame');
    expect(
      fixture.componentInstance.transferRecipient(makeRealExpense({ memberId: 'moi' })),
    ).toBe('Madame');
  });

  it('showBadge est vrai seulement en vue Global', () => {
    expect(createFixture(makeFakeStore({ activeOwner: 'global' })).componentInstance.showBadge).toBe(
      true,
    );
    expect(createFixture(makeFakeStore({ activeOwner: 'moi' })).componentInstance.showBadge).toBe(
      false,
    );
  });

  it('emptyMessage et title mentionnent "foyer" en vue Global, le prénom sinon', () => {
    const global = createFixture(makeFakeStore({ activeOwner: 'global' })).componentInstance;
    expect(global.emptyMessage).toContain('le foyer');
    expect(global.title).toContain('foyer');

    const moi = createFixture(makeFakeStore({ activeOwner: 'moi' })).componentInstance;
    expect(moi.emptyMessage).toContain('Moi');
    expect(moi.title).toContain('Moi');
  });

  it('reserveLabel()/reserveTag() distinguent un ajout au fonds d\'une simple réserve', () => {
    const fixture = createFixture(makeFakeStore());
    const reserve = makeExpense({ provision: true });
    const adjustment = makeExpense({ provision: true, provisionAdjustment: true });
    expect(fixture.componentInstance.reserveLabel(reserve)).toBe('réserve');
    expect(fixture.componentInstance.reserveTag(reserve)).toBe('Provision');
    expect(fixture.componentInstance.reserveLabel(adjustment)).toBe('ajout au fonds');
    expect(fixture.componentInstance.reserveTag(adjustment)).toBe('Ajout fonds');
  });

  it('remove() délègue au store', () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.remove('e9');
    expect(store.removeExpense).toHaveBeenCalledWith('e9');
  });

  it('isSplitVersement() détecte un versement réparti via les ajustements de provision', () => {
    const store = makeFakeStore({
      provisions: [{ adjustments: [{ id: 'a1', amount: 20, date: '2026-09-01', note: '', versementExpenseId: 'e1' }] }],
    });
    const fixture = createFixture(store);
    expect(fixture.componentInstance.isSplitVersement(makeExpense({ id: 'e1' }))).toBe(true);
    expect(fixture.componentInstance.isSplitVersement(makeExpense({ id: 'e2' }))).toBe(false);
  });

  it("cancelSplit() ne fait rien si l'utilisateur annule la confirmation", () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.cancelSplit(makeExpense({ id: 'e1' }));
    expect(store.cancelVersementSplit).not.toHaveBeenCalled();
  });

  it('cancelSplit() délègue au store si confirmé', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.cancelSplit(makeExpense({ id: 'e1' }));
    expect(store.cancelVersementSplit).toHaveBeenCalledWith('e1');
  });

  it("removeProvisionAdjustment() ne fait rien si provisionId ou adjustmentId manque", () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.removeProvisionAdjustment(makeExpense({ provisionId: 'p1' }));
    expect(store.removeProvisionAdjustment).not.toHaveBeenCalled();
  });

  it('removeProvisionAdjustment() délègue au store quand les deux id sont présents', () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.removeProvisionAdjustment(
      makeExpense({ provisionId: 'p1', adjustmentId: 'a1' }),
    );
    expect(store.removeProvisionAdjustment).toHaveBeenCalledWith('p1', 'a1');
  });

  it("startEdit() puis cancelEdit() ouvrent et ferment l'édition sans appeler le store", () => {
    const fixture = createFixture(makeFakeStore());
    const e = makeExpense({ id: 'e5', amount: 33, category: 'Transport', memberId: 'madame', cc: true });
    fixture.componentInstance.startEdit(e);
    expect(fixture.componentInstance.editingId()).toBe('e5');
    expect(fixture.componentInstance.editAmount).toBe(33);
    expect(fixture.componentInstance.editCategory).toBe('Transport');
    expect(fixture.componentInstance.editOwner).toBe('madame');
    expect(fixture.componentInstance.editCc).toBe(true);

    fixture.componentInstance.cancelEdit();
    expect(fixture.componentInstance.editingId()).toBeNull();
  });

  it('saveEdit() ne soumet rien si le montant ou la date édités sont invalides', async () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.editAmount = 0;
    fixture.componentInstance.editDate = '2026-09-01';
    await fixture.componentInstance.saveEdit('e1');
    expect(store.updateExpense).not.toHaveBeenCalled();
  });

  it('saveEdit() met à jour la dépense et ferme le mode édition', async () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.editingId.set('e1');
    fixture.componentInstance.editAmount = 75;
    fixture.componentInstance.editCategory = 'Transport';
    fixture.componentInstance.editDate = '2026-09-20';
    fixture.componentInstance.editOwner = 'madame';
    fixture.componentInstance.editCc = true;

    await fixture.componentInstance.saveEdit('e1');

    expect(store.updateExpense).toHaveBeenCalledWith('e1', {
      amount: 75,
      category: 'Transport',
      date: '2026-09-20',
      memberId: 'madame',
      cc: true,
    });
    expect(fixture.componentInstance.editingId()).toBeNull();
  });
});
