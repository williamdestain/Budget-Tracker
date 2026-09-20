import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { DataManagement } from './data-management';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';

function createFixture(overrides: {
  resetEverything?: () => Promise<void>;
  resetExpensesForMonth?: () => Promise<void>;
  resetIncomesForMonth?: () => Promise<void>;
}) {
  const toastShow = vi.fn();
  const fakeStore = {
    current: () => '2026-09',
    exportData: vi.fn(),
    resetEverything: overrides.resetEverything ?? vi.fn().mockResolvedValue(undefined),
    resetExpensesForMonth: overrides.resetExpensesForMonth ?? vi.fn().mockResolvedValue(undefined),
    resetIncomesForMonth: overrides.resetIncomesForMonth ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;

  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: fakeStore },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  const fixture = TestBed.createComponent(DataManagement);
  return { component: fixture.componentInstance, toastShow };
}

// Trouvaille de REVIEW_ARCHITECTURE_ET_PLAN_REFACTORING.md (🔴 P1),
// corrigée le 20 septembre 2026 : confirmReset() n'avait aucun catch —
// un échec de suppression de données passait inaperçu (le bouton
// redevenait juste cliquable, sans aucun message).
describe('DataManagement — confirmReset()', () => {
  it('succès : ferme la modale et affiche un message de confirmation', async () => {
    const { component, toastShow } = createFixture({});
    component.rcFull.set(true);
    component.open.set(true);

    await component.confirmReset();

    expect(component.open()).toBe(false);
    expect(component.saving()).toBe(false);
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('supprimées'));
  });

  it("échec : affiche un message d'erreur, ne ferme PAS la modale, et n'affirme jamais que rien n'a été supprimé", async () => {
    const { component, toastShow } = createFixture({
      resetEverything: vi.fn().mockRejectedValue(new Error('réseau indisponible')),
    });
    component.rcFull.set(true);
    component.open.set(true);

    await component.confirmReset();

    expect(component.open()).toBe(true); // reste ouverte pour que l'utilisateur voie l'erreur
    expect(component.saving()).toBe(false); // le bouton redevient utilisable
    expect(toastShow).toHaveBeenCalledTimes(1);
    const message = toastShow.mock.calls[0][0] as string;
    expect(message).toContain('Échec');
    expect(message).toContain('réseau indisponible');
    expect(message).not.toMatch(/rien n'a été supprimé/i); // affirmation non garantie, voir ci-dessous
  });

  it('échec partiel (reset ciblé) : le message ne prétend pas que rien n’a été supprimé', async () => {
    // rcAll -> resetExpensesForMonth() PUIS resetIncomesForMonth(), deux
    // appels séparés (pas une seule transaction) : si le premier réussit
    // et le second échoue, les dépenses sont déjà parties. Le message
    // d'erreur ne doit jamais affirmer "rien n'a été supprimé" — ce
    // serait faux dans exactement ce cas.
    const { component, toastShow } = createFixture({
      resetExpensesForMonth: vi.fn().mockResolvedValue(undefined),
      resetIncomesForMonth: vi.fn().mockRejectedValue(new Error('coupure réseau')),
    });
    component.rcAll.set(true);
    component.open.set(true);

    await component.confirmReset();

    expect(component.open()).toBe(true);
    const message = toastShow.mock.calls[0][0] as string;
    expect(message).toContain('Échec');
    expect(message).not.toMatch(/rien n'a été supprimé/i);
  });
});
