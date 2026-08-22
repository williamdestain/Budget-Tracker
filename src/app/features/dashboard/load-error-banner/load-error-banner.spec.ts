import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { LoadErrorBanner } from './load-error-banner';
import { BudgetStore } from '../../../core/services/budget-store.service';

// Isolation du composant, même pattern que money-pulse.spec.ts : un faux
// BudgetStore n'exposant que ce dont ce composant a besoin (loadError()).
function makeFakeStore(loadError: string[] | null) {
  return { loadError: () => loadError } as unknown as BudgetStore;
}

function createComponent(loadError: string[] | null): LoadErrorBanner {
  TestBed.configureTestingModule({
    providers: [{ provide: BudgetStore, useValue: makeFakeStore(loadError) }],
  });
  return TestBed.createComponent(LoadErrorBanner).componentInstance;
}

describe('LoadErrorBanner', () => {
  it("n'est pas visible quand loadError() est null (aucun chargement encore fait)", () => {
    const c = createComponent(null);
    expect(c.visible()).toBe(false);
  });

  it("n'est pas visible quand loadError() est un tableau vide (tout a chargé)", () => {
    const c = createComponent([]);
    expect(c.visible()).toBe(false);
  });

  it('est visible avec la liste des tables en échec, traduites en français', () => {
    const c = createComponent(['recurring_expenses', 'provisions']);
    expect(c.visible()).toBe(true);
    expect(c.labels()).toBe('dépenses récurrentes, provisions');
  });

  it('retombe sur le nom technique si une table est inconnue du dictionnaire de labels', () => {
    const c = createComponent(['une_table_pas_encore_mappee']);
    expect(c.labels()).toBe('une_table_pas_encore_mappee');
  });
});
