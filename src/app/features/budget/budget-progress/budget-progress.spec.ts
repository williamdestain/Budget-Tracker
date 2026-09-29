import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { BudgetProgress } from './budget-progress';

function createFixture(summary: {
  budget: number;
  spent: number;
  versementsIn?: number;
  soldeNet: number;
}, owner: 'moi' | 'global' = 'moi') {
  const store = {
    current: () => '2026-09',
    activeOwner: () => owner,
    memberName: (id: string) => (id === 'moi' ? 'Moi' : id),
    budgetSummary: () => ({ versementsIn: 0, ...summary }),
  } as unknown as BudgetStore;
  TestBed.configureTestingModule({
    providers: [{ provide: BudgetStore, useValue: store }],
  });
  const fixture = TestBed.createComponent(BudgetProgress);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

describe('BudgetProgress', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('signale un budget non défini et une barre pleine si des dépenses existent', () => {
    const { component, fixture } = createFixture({ budget: 0, spent: 20, soldeNet: -20 });
    expect(component.bar()).toMatchObject({ widthPct: 100, cls: 'over', statusText: 'Budget non défini' });
    expect(component.soldeNetColor).toBe('var(--red)');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Budget non défini');
  });

  it('affiche un dépassement, un avertissement, ou le reste selon le pourcentage', () => {
    expect(createFixture({ budget: 100, spent: 100, soldeNet: 0 }).component.bar().cls).toBe('over');
    TestBed.resetTestingModule();
    expect(createFixture({ budget: 100, spent: 80, soldeNet: 20 }).component.bar().cls).toBe('warn');
    TestBed.resetTestingModule();
    const ok = createFixture({ budget: 100, spent: 40, soldeNet: 60, versementsIn: 10 });
    expect(ok.component.bar().statusCls).toBe('ok');
    expect(ok.component.ofText()).toContain('versements reçus');
    expect(ok.component.title).toContain('Moi');
    expect(ok.component.soldeNetColor).toBe('var(--green)');
  });

  it('titre la vue globale du foyer', () => {
    const { component } = createFixture({ budget: 1, spent: 0, soldeNet: 1 }, 'global');
    expect(component.title).toContain('Global (foyer)');
  });
});
