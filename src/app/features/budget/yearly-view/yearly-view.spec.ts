import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { YearlyView } from './yearly-view';

describe('YearlyView', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ouvre/ferme la vue et navigue d’année en année', () => {
    const yearlyYear = signal(2026);
    TestBed.configureTestingModule({
      providers: [{ provide: BudgetStore, useValue: { yearlyYear } }],
    });
    const component = TestBed.createComponent(YearlyView).componentInstance;
    expect(component.open()).toBe(false);
    component.toggle();
    expect(component.open()).toBe(true);
    component.prevYear();
    expect(yearlyYear()).toBe(2025);
    component.nextYear();
    expect(yearlyYear()).toBe(2026);
    expect(component.fmt(12)).toBeTruthy();
  });
});
