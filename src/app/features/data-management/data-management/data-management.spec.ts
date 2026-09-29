import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DataManagement } from './data-management';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';

function createFixture(overrides: {
  resetEverything?: () => Promise<void>;
  resetExpensesForMonth?: () => Promise<void>;
  resetIncomesForMonth?: () => Promise<void>;
  exportData?: ReturnType<typeof vi.fn>;
  importData?: ReturnType<typeof vi.fn>;
  monthStats?: ReturnType<typeof vi.fn>;
}) {
  const toastShow = vi.fn();
  const fakeStore = {
    current: () => '2026-09',
    exportData: overrides.exportData ?? vi.fn(),
    importData: overrides.importData ?? vi.fn().mockResolvedValue(undefined),
    monthStats: overrides.monthStats ?? vi.fn().mockReturnValue({ spent: 0, revenus: 0 }),
    resetEverything: overrides.resetEverything ?? vi.fn().mockResolvedValue(undefined),
    resetExpensesForMonth: overrides.resetExpensesForMonth ?? vi.fn().mockResolvedValue(undefined),
    resetIncomesForMonth: overrides.resetIncomesForMonth ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: fakeStore },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  const fixture = TestBed.createComponent(DataManagement);
  return { component: fixture.componentInstance, toastShow, fakeStore };
}

function fakeFileEvent(file: File | undefined): Event {
  const input = { files: file ? [file] : [], value: '' };
  return { target: input } as unknown as Event;
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DataManagement — modale et cases à cocher', () => {
  it('openModal() réinitialise toutes les cases et revient à l\'étape "choice"', () => {
    const { component } = createFixture({});
    component.rcFull.set(true);
    component.step.set('confirm');

    component.openModal();

    expect(component.open()).toBe(true);
    expect(component.step()).toBe('choice');
    expect(component.rcExpenses()).toBe(false);
    expect(component.rcIncomes()).toBe(false);
    expect(component.rcAll()).toBe(false);
    expect(component.rcFull()).toBe(false);
  });

  it("onOverlayClick() ne ferme que si le clic vise le fond lui-même", () => {
    const { component } = createFixture({});
    component.open.set(true);
    const backdrop = document.createElement('div');
    const inner = document.createElement('div');

    component.onOverlayClick({ target: inner, currentTarget: backdrop } as unknown as MouseEvent);
    expect(component.open()).toBe(true);

    component.onOverlayClick({ target: backdrop, currentTarget: backdrop } as unknown as MouseEvent);
    expect(component.open()).toBe(false);
  });

  it('toggleExpenses()/toggleIncomes() cochent automatiquement "tout" quand les deux sont cochées', () => {
    const { component } = createFixture({});
    component.toggleExpenses(true);
    expect(component.rcAll()).toBe(false);
    component.toggleIncomes(true);
    expect(component.rcAll()).toBe(true);
    component.toggleExpenses(false);
    expect(component.rcAll()).toBe(false);
  });

  it('toggleAll(true) coche dépenses et revenus ; toggleAll(false) ne les décoche pas', () => {
    const { component } = createFixture({});
    component.toggleAll(true);
    expect(component.rcExpenses()).toBe(true);
    expect(component.rcIncomes()).toBe(true);

    component.toggleAll(false);
    expect(component.rcExpenses()).toBe(true); // toggleAll(false) ne touche pas aux cases ciblées
  });

  it('toggleFull(true) décoche les autres options (reset complet exclusif)', () => {
    const { component } = createFixture({});
    component.rcExpenses.set(true);
    component.rcIncomes.set(true);
    component.rcAll.set(true);

    component.toggleFull(true);

    expect(component.rcExpenses()).toBe(false);
    expect(component.rcIncomes()).toBe(false);
    expect(component.rcAll()).toBe(false);
    expect(component.rcFull()).toBe(true);
  });

  it('anyChecked reflète l\'état des 4 cases', () => {
    const { component } = createFixture({});
    expect(component.anyChecked).toBe(false);
    component.rcIncomes.set(true);
    expect(component.anyChecked).toBe(true);
  });

  it("goConfirm() refuse d'avancer si aucune case n'est cochée", () => {
    const { component, toastShow } = createFixture({});
    component.step.set('choice');
    component.goConfirm();
    expect(component.step()).toBe('choice');
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('Sélectionne'));
  });

  it('goConfirm() avance à "confirm" quand une case est cochée ; goBack() revient à "choice"', () => {
    const { component } = createFixture({});
    component.rcFull.set(true);
    component.goConfirm();
    expect(component.step()).toBe('confirm');
    component.goBack();
    expect(component.step()).toBe('choice');
  });

  it('monthLabel formate le mois courant du store', () => {
    const { component } = createFixture({});
    expect(component.monthLabel).toBe('Septembre 2026');
  });

  it('stats délègue à store.monthStats() pour le mois courant', () => {
    const monthStats = vi.fn().mockReturnValue({ spent: 42, revenus: 100 });
    const { component } = createFixture({ monthStats });
    expect(component.stats).toEqual({ spent: 42, revenus: 100 });
    expect(monthStats).toHaveBeenCalledWith('2026-09');
  });

  it('export() délègue à store.exportData() et notifie', () => {
    const exportData = vi.fn();
    const { component, toastShow } = createFixture({ exportData });
    component.export();
    expect(exportData).toHaveBeenCalled();
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('téléchargée'));
  });
});

describe('DataManagement — import de sauvegarde (onFileSelected)', () => {
  it('ne fait rien si aucun fichier n\'est sélectionné', async () => {
    const { component, toastShow } = createFixture({});
    await component.onFileSelected(fakeFileEvent(undefined));
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('refuse un fichier trop volumineux (> 20 Mo) sans tenter de le lire', async () => {
    const { component, toastShow } = createFixture({});
    const big = new File(['x'], 'gros.json', { type: 'application/json' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });

    await component.onFileSelected(fakeFileEvent(big));

    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('trop volumineux'));
  });

  it('refuse un fichier JSON invalide', async () => {
    const { component, toastShow } = createFixture({});
    const bad = new File(['{ ceci nest pas du json'], 'bad.json', { type: 'application/json' });

    await component.onFileSelected(fakeFileEvent(bad));

    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('illisible'));
  });

  it("n'importe rien si l'utilisateur annule la confirmation", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const importData = vi.fn();
    const { component } = createFixture({ importData });
    const file = new File([JSON.stringify({ expenses: [], incomes: [], provisions: [] })], 'ok.json');

    await component.onFileSelected(fakeFileEvent(file));

    expect(importData).not.toHaveBeenCalled();
  });

  it('importe les données confirmées, ferme la modale et notifie le succès', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const importData = vi.fn().mockResolvedValue(undefined);
    const { component, toastShow } = createFixture({ importData });
    component.open.set(true);
    const payload = { expenses: [1, 2], incomes: [1], provisions: [] };
    const file = new File([JSON.stringify(payload)], 'ok.json');

    await component.onFileSelected(fakeFileEvent(file));

    expect(importData).toHaveBeenCalledWith(payload);
    expect(component.open()).toBe(false);
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('restaurées'));
    expect(component.importing()).toBe(false);
  });

  it("affiche un message d'échec (avec le détail de l'erreur) si l'import échoue, sans planter", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const importData = vi.fn().mockRejectedValue(new Error('Schéma invalide'));
    const { component, toastShow } = createFixture({ importData });
    const file = new File([JSON.stringify({ expenses: [] })], 'ok.json');

    await component.onFileSelected(fakeFileEvent(file));

    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('Schéma invalide'));
    expect(component.importing()).toBe(false);
  });
});
