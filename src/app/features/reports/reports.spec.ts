import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Reports } from './reports';
import { BudgetStore } from '../../core/services/budget-store.service';
import { CountedExpense } from '../../core/utils/provision.utils';

function makeExpense(category: string, amount: number): CountedExpense {
  return { id: `${category}-${amount}`, amount, category, date: '2026-09-01', memberId: 'moi', cc: false };
}

function makeFakeStore(opts: {
  current?: string;
  months?: { ym: string; label: string; revenus: number; spent: number; soldeNet: number }[];
  totals?: { revenus: number; spent: number; soldeNet: number };
  countedExpenses?: CountedExpense[];
  loadAll?: ReturnType<typeof vi.fn>;
} = {}) {
  const months = opts.months ?? [
    { ym: '2026-01', label: 'Jan', revenus: 1000, spent: 800, soldeNet: 200 },
    { ym: '2026-02', label: 'Fév', revenus: 1000, spent: 900, soldeNet: 100 },
  ];
  const totals = opts.totals ?? { revenus: 2000, spent: 1700, soldeNet: 300 };
  return {
    current: () => opts.current ?? '2026-09',
    loading: () => false,
    yearlyYear: signal(2026),
    yearlyView: () => ({ months, totals }),
    countedExpensesList: () => opts.countedExpenses ?? [],
    colorFor: (c: string) => `color-${c}`,
    loadAll: opts.loadAll ?? vi.fn(),
  } as unknown as BudgetStore;
}

function createFixture(store: BudgetStore) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: BudgetStore, useValue: store }] });
  const fixture = TestBed.createComponent(Reports);
  fixture.detectChanges();
  return fixture;
}

describe('Reports', () => {
  it('monthLabel() délègue au store et formate le mois courant', () => {
    const fixture = createFixture(makeFakeStore({ current: '2026-09' }));
    expect(fixture.componentInstance.monthLabel()).toBe('Septembre 2026');
  });

  it('yearlySeries() construit 3 séries (Revenus/Dépenses en barres, Solde net en ligne)', () => {
    const fixture = createFixture(makeFakeStore());
    const series = fixture.componentInstance.yearlySeries();
    expect(series.map((s) => s.name)).toEqual(['Revenus', 'Dépenses', 'Solde net']);
    expect(series[0].kind).toBe('bar');
    expect(series[0].values).toEqual([1000, 1000]);
    expect(series[1].values).toEqual([800, 900]);
    expect(series[2].kind).toBe('line');
    expect(series[2].values).toEqual([200, 100]);
  });

  it('yearlyCategories() reprend les libellés de mois du store', () => {
    const fixture = createFixture(makeFakeStore());
    expect(fixture.componentInstance.yearlyCategories()).toEqual(['Jan', 'Fév']);
  });

  it('categorySegments() agrège par catégorie, trie par montant décroissant et calcule le pourcentage', () => {
    const fixture = createFixture(
      makeFakeStore({
        countedExpenses: [makeExpense('Épicerie', 30), makeExpense('Épicerie', 30), makeExpense('Transport', 40)],
      }),
    );
    const segments = fixture.componentInstance.categorySegments();
    expect(segments.map((s) => s.label)).toEqual(['Épicerie', 'Transport']);
    expect(segments[0].percent).toBe(60);
    expect(segments[1].percent).toBe(40);
  });

  it('categorySegments() exclut les catégories à montant nul ou négatif', () => {
    const fixture = createFixture(
      makeFakeStore({ countedExpenses: [makeExpense('Remise', -10), makeExpense('Épicerie', 20)] }),
    );
    expect(fixture.componentInstance.categorySegments().map((s) => s.label)).toEqual(['Épicerie']);
  });

  it('categorySegments() renvoie [] sans planter quand il n\'y a aucune dépense', () => {
    const fixture = createFixture(makeFakeStore({ countedExpenses: [] }));
    expect(fixture.componentInstance.categorySegments()).toEqual([]);
  });

  it('kpis() calcule la moyenne mensuelle de dépenses (0 si aucun mois)', () => {
    const withMonths = createFixture(makeFakeStore());
    expect(withMonths.componentInstance.kpis().averageSpent).toBeCloseTo((800 + 900) / 2, 5);
    expect(withMonths.componentInstance.kpis().revenues).toBe(2000);
    expect(withMonths.componentInstance.kpis().net).toBe(300);

    const noMonths = createFixture(makeFakeStore({ months: [] }));
    expect(noMonths.componentInstance.kpis().averageSpent).toBe(0);
  });

  it('previousYear()/nextYear() décrémentent/incrémentent yearlyYear', () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.previousYear();
    expect(store.yearlyYear()).toBe(2025);
    fixture.componentInstance.nextYear();
    expect(store.yearlyYear()).toBe(2026);
  });

  it('ngOnInit() déclenche le chargement des données du store', () => {
    const store = makeFakeStore();
    createFixture(store);
    expect(store.loadAll).toHaveBeenCalled();
  });
});
