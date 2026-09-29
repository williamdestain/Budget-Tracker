import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { MonthComparison } from './month-comparison';

describe('MonthComparison', () => {
  afterEach(() => TestBed.resetTestingModule());

  function create() {
    const store = {
      colorFor: vi.fn(() => '#111'),
      monthComparison: () => null,
    } as unknown as BudgetStore;
    TestBed.configureTestingModule({
      providers: [{ provide: BudgetStore, useValue: store }],
    });
    const fixture = TestBed.createComponent(MonthComparison);
    fixture.detectChanges();
    return { component: fixture.componentInstance, store };
  }

  it('bascule l’ouverture et formate les variations', () => {
    const { component, store } = create();
    expect(component.open()).toBe(false);
    component.toggle();
    expect(component.open()).toBe(true);
    expect(component.deltaText(12)).toContain('+');
    expect(component.deltaText(-12)).toContain('−');
    expect(component.deltaText(0)).not.toMatch(/[+\u2212]/);
    expect(component.colorFor('Courses')).toBe('#111');
    expect(store.colorFor).toHaveBeenCalledWith('Courses');
    expect(component.fmt(10)).toBeTruthy();
  });
});
