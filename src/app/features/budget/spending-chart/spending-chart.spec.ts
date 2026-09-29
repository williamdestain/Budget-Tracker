import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { SpendingChart } from './spending-chart';

describe('SpendingChart', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create(expenses: { category: string; amount: number }[]) {
    const store = {
      countedExpensesList: () => expenses,
      colorFor: (c: string) => `c:${c}`,
    } as unknown as BudgetStore;
    TestBed.configureTestingModule({
      providers: [{ provide: BudgetStore, useValue: store }],
    });
    const fixture = TestBed.createComponent(SpendingChart);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('agrège les catégories et expose le total au centre', () => {
    const component = create([
      { category: 'Courses', amount: 80 },
      { category: 'Courses', amount: 20 },
      { category: 'Transport', amount: 50 },
    ]);
    expect(component.data().total).toBe(150);
    expect(component.data().segments[0].category).toBe('Courses');
    expect(component.centerTitle).toBe('Total du mois');
    expect(component.centerValue).toBeTruthy();
    expect(component.centerSub).toContain('3 dépenses');
  });

  it('détaille la catégorie survolée et ignore les montants nuls', () => {
    const component = create([
      { category: 'Courses', amount: 100 },
      { category: 'Vide', amount: 0 },
    ]);
    component.setHover('Courses');
    expect(component.centerTitle).toBe('Courses');
    expect(component.centerSub).toContain('%');
    component.setHover('inconnu');
    expect(component.centerSub).toBe('');
    expect(component.data().segments).toHaveLength(1);
    expect(component.fmt(1)).toBeTruthy();
  });
});
