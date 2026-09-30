import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SavingsGoalForm } from './savings-goal-form';
import { BudgetStore } from '../../../core/services/budget-store.service';

function makeFakeStore(
  activeOwner: 'moi' | 'madame' | 'global',
  memberOptions: { id: string }[] = [],
  myMemberId: string | null = null,
) {
  return {
    activeOwner: () => activeOwner,
    memberOptions: () => memberOptions,
    myMemberId: () => myMemberId,
    addSavingsGoal: vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
}

function createFixture(store: BudgetStore) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: BudgetStore, useValue: store }] });
  const fixture = TestBed.createComponent(SavingsGoalForm);
  fixture.detectChanges();
  return fixture;
}

describe('SavingsGoalForm', () => {
  it('bascule l\'ouverture du formulaire', () => {
    const fixture = createFixture(makeFakeStore('moi'));
    expect(fixture.componentInstance.open()).toBe(false);
    fixture.componentInstance.toggle();
    expect(fixture.componentInstance.open()).toBe(true);
  });

  it('ne soumet rien si le nom est vide ou blanc', async () => {
    const store = makeFakeStore('moi');
    const fixture = createFixture(store);
    fixture.componentInstance.name = '   ';
    fixture.componentInstance.targetAmount = 1000;
    await fixture.componentInstance.submit();
    expect(store.addSavingsGoal).not.toHaveBeenCalled();
  });

  it('ne soumet rien si le montant cible est nul, absent ou <= 0', async () => {
    const store = makeFakeStore('moi');
    const fixture = createFixture(store);
    fixture.componentInstance.name = 'Fonds d\'urgence';
    fixture.componentInstance.targetAmount = 0;
    await fixture.componentInstance.submit();
    expect(store.addSavingsGoal).not.toHaveBeenCalled();

    fixture.componentInstance.targetAmount = null;
    await fixture.componentInstance.submit();
    expect(store.addSavingsGoal).not.toHaveBeenCalled();
  });

  it('soumet avec le profil actif comme owner, réinitialise le formulaire et le referme', async () => {
    const store = makeFakeStore('madame');
    const fixture = createFixture(store);
    fixture.componentInstance.open.set(true);
    fixture.componentInstance.name = '  Vacances  ';
    fixture.componentInstance.targetAmount = 2500;
    fixture.componentInstance.targetDate = '2027-06-01';

    await fixture.componentInstance.submit();

    expect(store.addSavingsGoal).toHaveBeenCalledWith({
      name: 'Vacances',
      targetAmount: 2500,
      targetDate: '2027-06-01',
      memberId: 'madame',
    });
    expect(fixture.componentInstance.name).toBe('');
    expect(fixture.componentInstance.targetAmount).toBeNull();
    expect(fixture.componentInstance.targetDate).toBe('');
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('envoie targetDate=null quand aucune date cible n\'est fournie', async () => {
    const store = makeFakeStore('moi');
    const fixture = createFixture(store);
    fixture.componentInstance.name = 'Auto';
    fixture.componentInstance.targetAmount = 10000;

    await fixture.componentInstance.submit();

    expect(store.addSavingsGoal).toHaveBeenCalledWith(
      expect.objectContaining({ targetDate: null }),
    );
  });

  it('en vue Global, utilise le membre connecté (à défaut, le premier membre) comme owner', async () => {
    const connected = makeFakeStore('global', [{ id: 'madame' }, { id: 'moi' }], 'moi');
    const f1 = createFixture(connected);
    f1.componentInstance.name = 'Objectif commun';
    f1.componentInstance.targetAmount = 500;
    await f1.componentInstance.submit();
    expect(connected.addSavingsGoal).toHaveBeenCalledWith(expect.objectContaining({ memberId: 'moi' }));

    const unknown = makeFakeStore('global', [{ id: 'madame' }, { id: 'moi' }]);
    const f2 = createFixture(unknown);
    f2.componentInstance.name = 'Objectif commun';
    f2.componentInstance.targetAmount = 500;
    await f2.componentInstance.submit();
    expect(unknown.addSavingsGoal).toHaveBeenCalledWith(expect.objectContaining({ memberId: 'madame' }));
  });

  it("foyer à identifiants UUID, vue Global : jamais l'identifiant inventé 'moi'", async () => {
    const SAM = '3f9c1c1e-0000-4000-8000-000000000002';
    const store = makeFakeStore('global', [{ id: '3f9c1c1e-0000-4000-8000-000000000001' }, { id: SAM }], SAM);
    const f = createFixture(store);
    f.componentInstance.name = 'Voyage';
    f.componentInstance.targetAmount = 900;
    await f.componentInstance.submit();
    expect(store.addSavingsGoal).toHaveBeenCalledWith(expect.objectContaining({ memberId: SAM }));
  });

  it("sans aucun membre actif, n'écrit rien plutôt que d'envoyer 'moi'", async () => {
    const store = makeFakeStore('global', []);
    const f = createFixture(store);
    f.componentInstance.name = 'Objectif commun';
    f.componentInstance.targetAmount = 500;
    await f.componentInstance.submit();
    expect(store.addSavingsGoal).not.toHaveBeenCalled();
  });
});
