import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { alreadyHasHouseholdGuard, householdGuard } from './household.guard';
import { BudgetStore } from './budget-store.service';

function run(guard: typeof householdGuard, store: Partial<BudgetStore>) {
  const navigate = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: store },
      { provide: Router, useValue: { navigate } },
    ],
  });
  return {
    result: TestBed.runInInjectionContext(() => guard({} as never, {} as never)),
    navigate,
  };
}

describe('householdGuard', () => {
  it('résout le foyer si l’id est encore inconnu, puis laisse passer', async () => {
    const resolveHousehold = vi.fn().mockResolvedValue(undefined);
    const { result, navigate } = run(householdGuard, {
      householdId: () => null,
      needsHouseholdSetup: () => false,
      resolveHousehold,
    } as unknown as BudgetStore);

    await expect(result).resolves.toBe(true);
    expect(resolveHousehold).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('envoie vers /setup-household si aucun foyer n’est rattaché', async () => {
    const { result, navigate } = run(householdGuard, {
      householdId: () => 'hid',
      needsHouseholdSetup: () => true,
      resolveHousehold: vi.fn(),
    } as unknown as BudgetStore);

    await expect(result).resolves.toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/setup-household']);
  });
});

describe('alreadyHasHouseholdGuard', () => {
  it('résout le foyer si rien n’est encore connu, puis laisse passer sans foyer', async () => {
    const resolveHousehold = vi.fn().mockResolvedValue(undefined);
    const { result, navigate } = run(alreadyHasHouseholdGuard, {
      householdId: () => null,
      needsHouseholdSetup: () => false,
      resolveHousehold,
    } as unknown as BudgetStore);

    await expect(result).resolves.toBe(true);
    expect(resolveHousehold).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('renvoie au tableau de bord si un foyer existe déjà', async () => {
    const { result, navigate } = run(alreadyHasHouseholdGuard, {
      householdId: () => 'hid',
      needsHouseholdSetup: () => false,
      resolveHousehold: vi.fn(),
    } as unknown as BudgetStore);

    await expect(result).resolves.toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/']);
  });
});
