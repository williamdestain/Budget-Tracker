import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { VersementSplitter } from './versement-splitter';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { Provision } from '../../../core/models/budget.models';

// Tests en isolation : faux BudgetStore, comme money-pulse.spec.ts. La
// logique de provisionPot/effectiveProvisionAmount est déjà couverte par
// provision.utils.spec.ts — ici on vérifie uniquement ce que le composant
// envoie à splitVersementIntoProvisions() selon les choix de l'utilisateur.

function makeProvision(overrides: Partial<Provision> = {}): Provision {
  return {
    id: 'p1',
    name: 'Assurance',
    amount: 600,
    everyN: 3,
    intervalUnit: 'months',
    startYM: '2026-01',
    startDate: '',
    category: 'Assurance',
    owner: 'moi',
    autoRecalibrate: true,
    allocationPercent: 0,
    rollingCount: 0,
    adjustments: [],
    ...overrides,
  };
}

function makeFakeStore(provisions: Provision[], splitSpy: (...args: any[]) => Promise<void>) {
  return {
    activeOwner: () => 'moi',
    current: () => '2026-07',
    expenses: () => [],
    visibleProvisions: () => provisions,
    unsplitVersements: () => [],
    splitVersementIntoProvisions: splitSpy,
  } as unknown as BudgetStore;
}

function createComponent(provisions: Provision[], splitSpy: (...args: any[]) => Promise<void>): VersementSplitter {
  TestBed.configureTestingModule({
    providers: [{ provide: BudgetStore, useValue: makeFakeStore(provisions, splitSpy) }],
  });
  return TestBed.createComponent(VersementSplitter).componentInstance;
}

describe('VersementSplitter', () => {
  // Bug rapporté par l'utilisateur : cocher "Laisser le reste dans le
  // budget" ajoutait quand même le reste à la dernière provision
  // sélectionnée, à cause d'une correction d'arrondi qui ne vérifiait pas
  // cette option.
  it("ne répartit PAS le reste vers une provision quand 'keepRemainderInBudget' est coché", async () => {
    const splitSpy = vi.fn().mockResolvedValue(undefined);
    const provisions = [makeProvision({ id: 'p1', amount: 100 })];
    const c = createComponent(provisions, splitSpy);

    c.toggle(); // ouvre le panneau (réinitialise selected/mode/etc.)
    c.sourceMode = 'new';
    c.totalAmount = 150;
    c.splitMethod = 'equal';
    c.selected = new Set(['p1']);
    c.keepRemainderInBudget = true;
    // 150 reçu, une seule provision sélectionnée en mode "égal" -> 150
    // lui serait alloué en entier si on ne limite pas. On simule
    // l'utilisateur qui a délibérément voulu n'assigner que 100 (via une
    // sélection manuelle par ex.) : ici on force le cas simple où
    // allocationFor() donne déjà moins que le total, en passant en mode
    // manuel avec un montant volontairement inférieur.
    c.splitMethod = 'manual';
    c.manualAmounts = { p1: 100 };

    expect(c.remaining).toBe(50);
    expect(c.canSubmit).toBe(true);

    await c.submit();

    expect(splitSpy).toHaveBeenCalledTimes(1);
    const allocations = splitSpy.mock.calls[0][2] as { provisionId: string; amount: number }[];
    // Le total réparti doit être 100 (la part manuelle), PAS 150 (total -
    // reste dumpé dessus).
    const sum = allocations.reduce((s, a) => s + a.amount, 0);
    expect(sum).toBe(100);
    expect(allocations.find((a) => a.provisionId === 'p1')?.amount).toBe(100);
  });

  it("corrige toujours les écarts de centimes d'arrondi quand le reste n'est PAS volontairement laissé de côté", async () => {
    const splitSpy = vi.fn().mockResolvedValue(undefined);
    // 3 provisions en mode "égal" avec un montant qui ne se divise pas
    // rond (100 / 3 = 33.33... par provision) -> écart de centimes à
    // corriger sur la dernière, pour que la somme fasse exactement 100.
    const provisions = [
      makeProvision({ id: 'p1' }),
      makeProvision({ id: 'p2' }),
      makeProvision({ id: 'p3' }),
    ];
    const c = createComponent(provisions, splitSpy);
    c.toggle();
    c.sourceMode = 'new';
    c.totalAmount = 100;
    c.splitMethod = 'equal';
    c.selected = new Set(['p1', 'p2', 'p3']);
    c.keepRemainderInBudget = false;

    await c.submit();

    const allocations = splitSpy.mock.calls[0][2] as { provisionId: string; amount: number }[];
    const sum = allocations.reduce((s, a) => s + a.amount, 0);
    expect(sum).toBe(100); // pas 99.99 à cause des arrondis
  });
});
