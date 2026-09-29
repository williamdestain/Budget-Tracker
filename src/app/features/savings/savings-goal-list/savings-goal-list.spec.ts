import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SavingsGoalList } from './savings-goal-list';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { SavingsGoal } from '../../../core/models/budget.models';

function makeGoal(id: string): SavingsGoal {
  return {
    id,
    name: `Objectif ${id}`,
    targetAmount: 1000,
    targetDate: null,
    memberId: 'moi',
    contributions: [],
  };
}

function makeFakeStore(goals: SavingsGoal[] = []) {
  return {
    visibleSavingsGoals: () => goals,
    activeOwner: () => 'moi' as const,
    memberOptions: () => [{ id: 'moi' }],
  } as unknown as BudgetStore;
}

function createFixture(goals: SavingsGoal[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: BudgetStore, useValue: makeFakeStore(goals) }],
  });
  const fixture = TestBed.createComponent(SavingsGoalList);
  fixture.detectChanges();
  return fixture;
}

describe('SavingsGoalList', () => {
  it('affiche un indice et masque le contenu détaillé quand fermé', () => {
    const fixture = createFixture();
    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).toContain('goal-hint');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-savings-goal-form')).toBeNull();
  });

  it('affiche le formulaire et masque l\'indice une fois ouvert', () => {
    const fixture = createFixture();
    fixture.componentInstance.toggle();
    fixture.detectChanges();
    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).not.toContain('goal-hint');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-savings-goal-form')).toBeTruthy();
  });

  it('affiche un message vide quand il n\'y a aucun objectif (une fois ouvert)', () => {
    const fixture = createFixture([]);
    fixture.componentInstance.toggle();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "Aucun objectif d'épargne pour l'instant.",
    );
  });

  it('affiche une carte par objectif visible (une fois ouvert)', () => {
    const fixture = createFixture([makeGoal('a'), makeGoal('b'), makeGoal('c')]);
    fixture.componentInstance.toggle();
    fixture.detectChanges();
    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('app-savings-goal-card');
    expect(cards.length).toBe(3);
  });
});
