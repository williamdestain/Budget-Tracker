import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { RecurringExpensesManage } from './recurring-expenses-manage';
import { BudgetStore } from '../../../core/services/budget-store.service';

function makeFakeStore(opts: {
  activeOwner?: WritableSignal<'moi' | 'madame' | 'global'>;
  categories?: WritableSignal<string[]>;
  addRecurringExpense?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    activeOwner: opts.activeOwner ?? signal<'moi' | 'madame' | 'global'>('moi'),
    activeCategoryNames: opts.categories ?? signal<string[]>(['Épicerie', 'Transport']),
    colorFor: (c: string) => `color-${c}`,
    visibleRecurringExpenses: () => [],
    addRecurringExpense: opts.addRecurringExpense ?? vi.fn().mockResolvedValue({}),
    updateRecurringExpense: vi.fn(),
    removeRecurringExpense: vi.fn(),
  } as unknown as BudgetStore;
}

function createFixture(store: BudgetStore) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: BudgetStore, useValue: store }] });
  const fixture = TestBed.createComponent(RecurringExpensesManage);
  fixture.detectChanges();
  return fixture;
}

describe('RecurringExpensesManage', () => {
  it('categories() exclut "Revenu" (mais pas "Remboursement Carte Crédit", contrairement à ExpenseForm)', () => {
    const fixture = createFixture(
      makeFakeStore({ categories: signal(['Épicerie', 'Revenu', 'Remboursement Carte Crédit']) }),
    );
    expect(fixture.componentInstance.categories()).toEqual(['Épicerie', 'Remboursement Carte Crédit']);
  });

  it("aligne le profil du formulaire sur l'onglet actif à la création", () => {
    const fixture = createFixture(makeFakeStore({ activeOwner: signal('madame') }));
    expect(fixture.componentInstance.owner).toBe('madame');
  });

  it('pré-sélectionne la première catégorie une fois la liste chargée', () => {
    const catSignal = signal<string[]>([]);
    const fixture = createFixture(makeFakeStore({ categories: catSignal }));
    expect(fixture.componentInstance.category).toBe('');
    catSignal.set(['Transport']);
    fixture.detectChanges();
    expect(fixture.componentInstance.category).toBe('Transport');
  });

  it('toggle() bascule l\'ouverture du panneau', () => {
    const fixture = createFixture(makeFakeStore());
    expect(fixture.componentInstance.open()).toBe(false);
    fixture.componentInstance.toggle();
    expect(fixture.componentInstance.open()).toBe(true);
  });

  it('frequencySummary() résume chaque intervalle correctement', () => {
    const fixture = createFixture(makeFakeStore());
    const c = fixture.componentInstance;
    expect(c.frequencySummary({ interval: 'monthly', dayOfMonth: 5 })).toBe('jour 5');
    expect(
      c.frequencySummary({ interval: 'semimonthly', dayOfMonth: 5, secondDayOfMonth: 20 }),
    ).toBe('jours 5 et 20');
    expect(c.frequencySummary({ interval: 'semimonthly', dayOfMonth: 5, secondDayOfMonth: null })).toBe(
      'jours 5 et 5',
    );
    expect(
      c.frequencySummary({ interval: 'weekly', dayOfMonth: 1, startDate: '2026-07-10' }),
    ).toBe('Chaque semaine · dès le 2026-07-10');
    expect(c.frequencySummary({ interval: 'biweekly', dayOfMonth: 1, startDate: null })).toBe(
      'Aux 2 semaines · dès le ?',
    );
  });

  it("ne soumet rien si le nom est vide/blanc ou le montant nul/absent/<=0", async () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.name = '  ';
    fixture.componentInstance.amount = 50;
    await fixture.componentInstance.submit();
    expect(store.addRecurringExpense).not.toHaveBeenCalled();

    fixture.componentInstance.name = 'Netflix';
    fixture.componentInstance.amount = 0;
    await fixture.componentInstance.submit();
    expect(store.addRecurringExpense).not.toHaveBeenCalled();
  });

  it('soumet un gabarit mensuel et réinitialise tout le formulaire', async () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.open.set(true);
    fixture.componentInstance.name = '  Netflix  ';
    fixture.componentInstance.amount = 18.99;
    fixture.componentInstance.category = 'Loisirs';
    fixture.componentInstance.interval = 'monthly';
    fixture.componentInstance.dayOfMonth = 12;
    fixture.componentInstance.cc = true;

    await fixture.componentInstance.submit();

    expect(store.addRecurringExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Netflix',
        amount: 18.99,
        category: 'Loisirs',
        interval: 'monthly',
        dayOfMonth: 12,
        secondDayOfMonth: null,
        startDate: null,
        cc: true,
        active: true,
      }),
    );
    expect(fixture.componentInstance.name).toBe('');
    expect(fixture.componentInstance.amount).toBeNull();
    expect(fixture.componentInstance.interval).toBe('monthly');
    expect(fixture.componentInstance.cc).toBe(false);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('transmet secondDayOfMonth uniquement pour semimonthly, et startDate uniquement pour weekly/biweekly', async () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.name = 'Ménage';
    fixture.componentInstance.amount = 60;
    fixture.componentInstance.interval = 'semimonthly';
    fixture.componentInstance.secondDayOfMonth = 20;
    fixture.componentInstance.startDate = '2026-07-01';
    await fixture.componentInstance.submit();
    expect(store.addRecurringExpense).toHaveBeenLastCalledWith(
      expect.objectContaining({ secondDayOfMonth: 20, startDate: null }),
    );

    fixture.componentInstance.name = 'Assurance auto';
    fixture.componentInstance.amount = 60;
    fixture.componentInstance.interval = 'weekly';
    fixture.componentInstance.startDate = '2026-07-01';
    await fixture.componentInstance.submit();
    expect(store.addRecurringExpense).toHaveBeenLastCalledWith(
      expect.objectContaining({ secondDayOfMonth: null, startDate: '2026-07-01' }),
    );
  });

  it("toggleActive() inverse l'état actif via le store", () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.toggleActive('r1', true);
    expect(store.updateRecurringExpense).toHaveBeenCalledWith('r1', { active: false });
    fixture.componentInstance.toggleActive('r2', false);
    expect(store.updateRecurringExpense).toHaveBeenCalledWith('r2', { active: true });
  });

  it('remove() délègue au store', () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.remove('r9');
    expect(store.removeRecurringExpense).toHaveBeenCalledWith('r9');
  });
});
