import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SavingsGoalCard } from './savings-goal-card';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { SavingsGoal } from '../../../core/models/budget.models';
import { fmt } from '../../../core/utils/currency.utils';
import { isoOfDate } from '../../../core/utils/date.utils';

function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: 'g1',
    name: "Fonds d'urgence",
    targetAmount: 1000,
    targetDate: null,
    memberId: 'moi',
    contributions: [],
    ...overrides,
  };
}

function makeFakeStore() {
  return {
    addSavingsGoalContribution: vi.fn().mockResolvedValue(undefined),
    removeSavingsGoalContribution: vi.fn(),
    removeSavingsGoal: vi.fn(),
  } as unknown as BudgetStore;
}

function createFixture(goal: SavingsGoal, store = makeFakeStore()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: BudgetStore, useValue: store }] });
  const fixture = TestBed.createComponent(SavingsGoalCard);
  fixture.componentRef.setInput('goal', goal);
  fixture.detectChanges();
  return { fixture, store };
}

describe('SavingsGoalCard', () => {
  it('calcule la cagnotte comme la somme des contributions', () => {
    const goal = makeGoal({
      targetAmount: 1000,
      contributions: [
        { id: 'c1', amount: 300, date: '2026-01-01', note: '' },
        { id: 'c2', amount: 200, date: '2026-02-01', note: '' },
      ],
    });
    const { fixture } = createFixture(goal);
    expect(fixture.componentInstance.stats().pot).toBe(500);
    expect(fixture.componentInstance.stats().remaining).toBe(500);
  });

  it('affiche "objectif atteint" quand la cagnotte couvre la cible, même sans date', () => {
    const goal = makeGoal({
      targetAmount: 500,
      contributions: [{ id: 'c1', amount: 600, date: '2026-01-01', note: '' }],
    });
    const { fixture } = createFixture(goal);
    expect(fixture.componentInstance.stats().reached).toBe(true);
    expect(fixture.componentInstance.stats().statusClass).toBe('ok');
    expect(fixture.componentInstance.stats().statusText).toContain('atteint');
  });

  it('affiche "date dépassée" quand la date cible est passée et l\'objectif non atteint', () => {
    const goal = makeGoal({ targetAmount: 1000, targetDate: '2020-01-01', contributions: [] });
    const { fixture } = createFixture(goal);
    expect(fixture.componentInstance.stats().statusClass).toBe('overdue');
    expect(fixture.componentInstance.stats().statusText).toContain('dépassée');
    expect(fixture.componentInstance.stats().statusText).toContain(fmt(1000));
  });

  it('affiche un avertissement quand la date cible est proche (≤ 30 jours) et non atteinte', () => {
    const soon = isoOfDate(new Date(Date.now() + 5 * 86400000));
    const goal = makeGoal({ targetAmount: 1000, targetDate: soon, contributions: [] });
    const { fixture } = createFixture(goal);
    expect(fixture.componentInstance.stats().statusClass).toBe('warn');
    expect(fixture.componentInstance.stats().statusText).toContain('Dans');
  });

  it("trie les contributions les plus récentes en premier", () => {
    const goal = makeGoal({
      contributions: [
        { id: 'c1', amount: 100, date: '2026-01-01', note: 'Ancienne' },
        { id: 'c2', amount: 100, date: '2026-03-01', note: 'Récente' },
      ],
    });
    const { fixture } = createFixture(goal);
    expect(fixture.componentInstance.stats().contributions[0].note).toBe('Récente');
  });

  it("barWidth() ne descend jamais sous 2 (visibilité de la barre)", () => {
    const goal = makeGoal({ targetAmount: 10000, contributions: [] });
    const { fixture } = createFixture(goal);
    expect(fixture.componentInstance.barWidth()).toBe(2);
  });

  it('bascule le formulaire d\'ajout', () => {
    const { fixture } = createFixture(makeGoal());
    expect(fixture.componentInstance.addOpen()).toBe(false);
    fixture.componentInstance.toggleAdd();
    expect(fixture.componentInstance.addOpen()).toBe(true);
  });

  it('ne soumet pas un ajout si le montant est nul, absent, <= 0, ou la date manquante', async () => {
    const { fixture, store } = createFixture(makeGoal());
    fixture.componentInstance.addAmount = 0;
    await fixture.componentInstance.submitAdd();
    expect(store.addSavingsGoalContribution).not.toHaveBeenCalled();

    fixture.componentInstance.addAmount = 50;
    fixture.componentInstance.addDate = '';
    await fixture.componentInstance.submitAdd();
    expect(store.addSavingsGoalContribution).not.toHaveBeenCalled();
  });

  it('soumet un ajout valide, réinitialise le formulaire et le referme', async () => {
    const { fixture, store } = createFixture(makeGoal({ id: 'g42' }));
    fixture.componentInstance.addOpen.set(true);
    fixture.componentInstance.addAmount = 75;
    fixture.componentInstance.addDate = '2026-05-01';
    fixture.componentInstance.addNote = 'Bonus';

    await fixture.componentInstance.submitAdd();

    expect(store.addSavingsGoalContribution).toHaveBeenCalledWith('g42', 75, '2026-05-01', 'Bonus');
    expect(fixture.componentInstance.addAmount).toBeNull();
    expect(fixture.componentInstance.addNote).toBe('');
    expect(fixture.componentInstance.addOpen()).toBe(false);
  });

  it('removeContribution() délègue au store avec le bon id de but et de contribution', () => {
    const { fixture, store } = createFixture(makeGoal({ id: 'g7' }));
    fixture.componentInstance.removeContribution('c9');
    expect(store.removeSavingsGoalContribution).toHaveBeenCalledWith('g7', 'c9');
  });

  it('remove() délègue au store avec le bon id de but', () => {
    const { fixture, store } = createFixture(makeGoal({ id: 'g7' }));
    fixture.componentInstance.remove();
    expect(store.removeSavingsGoal).toHaveBeenCalledWith('g7');
  });
});
