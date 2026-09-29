import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { CategoriesManage } from './categories-manage';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { Category } from '../../../core/models/budget.models';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return { id: 'c1', name: 'Épicerie', color: '#000', archived: false, sortOrder: 0, ...overrides };
}

interface StoreOverrides {
  addCategory?: ReturnType<typeof vi.fn>;
  renameCategory?: ReturnType<typeof vi.fn>;
  archiveCategory?: ReturnType<typeof vi.fn>;
  unarchiveCategory?: ReturnType<typeof vi.fn>;
  deleteCategoryPermanently?: ReturnType<typeof vi.fn>;
}

function makeFakeStore(categories: Category[] = [], overrides: StoreOverrides = {}) {
  return {
    categories: () => categories,
    addCategory: overrides.addCategory ?? vi.fn().mockResolvedValue(undefined),
    renameCategory: overrides.renameCategory ?? vi.fn().mockResolvedValue(undefined),
    archiveCategory: overrides.archiveCategory ?? vi.fn().mockResolvedValue(undefined),
    unarchiveCategory: overrides.unarchiveCategory ?? vi.fn().mockResolvedValue(undefined),
    deleteCategoryPermanently: overrides.deleteCategoryPermanently ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
}

function createFixture(store: BudgetStore, toastShow = vi.fn()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: store },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  const fixture = TestBed.createComponent(CategoriesManage);
  fixture.detectChanges();
  return { fixture, toastShow };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CategoriesManage', () => {
  it('activeList / archivedList séparent et trient par nom (locale FR)', () => {
    const store = makeFakeStore([
      makeCategory({ id: 'c1', name: 'Transport' }),
      makeCategory({ id: 'c2', name: 'Épicerie' }),
      makeCategory({ id: 'c3', name: 'Ancienne', archived: true }),
    ]);
    const { fixture } = createFixture(store);
    expect(fixture.componentInstance.activeList.map((c) => c.name)).toEqual(['Épicerie', 'Transport']);
    expect(fixture.componentInstance.archivedList.map((c) => c.name)).toEqual(['Ancienne']);
  });

  it('toggle()/close() gèrent l\'ouverture, et close() réinitialise édition + saisie', () => {
    const { fixture } = createFixture(makeFakeStore());
    fixture.componentInstance.toggle();
    expect(fixture.componentInstance.open()).toBe(true);
    fixture.componentInstance.editingId.set('c1');
    fixture.componentInstance.newName = 'Brouillon';

    fixture.componentInstance.close();

    expect(fixture.componentInstance.open()).toBe(false);
    expect(fixture.componentInstance.editingId()).toBeNull();
    expect(fixture.componentInstance.newName).toBe('');
  });

  it("onOverlayClick() ferme seulement si le clic vise le fond lui-même", () => {
    const { fixture } = createFixture(makeFakeStore());
    fixture.componentInstance.open.set(true);
    const backdrop = document.createElement('div');
    const inner = document.createElement('div');

    fixture.componentInstance.onOverlayClick({ target: inner, currentTarget: backdrop } as unknown as MouseEvent);
    expect(fixture.componentInstance.open()).toBe(true);

    fixture.componentInstance.onOverlayClick({ target: backdrop, currentTarget: backdrop } as unknown as MouseEvent);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it("add() ignore un nom vide/blanc et n'appelle pas le store", async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.newName = '   ';
    await fixture.componentInstance.add();
    expect(store.addCategory).not.toHaveBeenCalled();
  });

  it('add() crée la catégorie (nom nettoyé) et vide le champ', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.newName = '  Loisirs  ';
    await fixture.componentInstance.add();
    expect(store.addCategory).toHaveBeenCalledWith('Loisirs');
    expect(fixture.componentInstance.newName).toBe('');
  });

  it("add() affiche une erreur via ToastService si le store rejette", async () => {
    const store = makeFakeStore([], { addCategory: vi.fn().mockRejectedValue(new Error('Nom déjà pris')) });
    const { fixture, toastShow } = createFixture(store);
    fixture.componentInstance.newName = 'Doublon';
    await fixture.componentInstance.add();
    expect(toastShow).toHaveBeenCalledWith('Nom déjà pris');
  });

  it('startEdit() puis saveEdit() renomme et referme l\'édition', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.startEdit(makeCategory({ id: 'c9', name: 'Ancien nom' }));
    expect(fixture.componentInstance.editingId()).toBe('c9');
    expect(fixture.componentInstance.editName).toBe('Ancien nom');

    fixture.componentInstance.editName = '  Nouveau nom  ';
    await fixture.componentInstance.saveEdit('c9');

    expect(store.renameCategory).toHaveBeenCalledWith('c9', 'Nouveau nom');
    expect(fixture.componentInstance.editingId()).toBeNull();
  });

  it("saveEdit() ignore un nom vide/blanc", async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.editName = '   ';
    await fixture.componentInstance.saveEdit('c9');
    expect(store.renameCategory).not.toHaveBeenCalled();
  });

  it("archive() ne fait rien si l'utilisateur annule la confirmation", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    await fixture.componentInstance.archive(makeCategory());
    expect(store.archiveCategory).not.toHaveBeenCalled();
  });

  it('archive() délègue au store si confirmé', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    await fixture.componentInstance.archive(makeCategory({ id: 'c7' }));
    expect(store.archiveCategory).toHaveBeenCalledWith('c7');
  });

  it('unarchive() délègue directement au store (pas de confirmation)', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    await fixture.componentInstance.unarchive(makeCategory({ id: 'c7' }));
    expect(store.unarchiveCategory).toHaveBeenCalledWith('c7');
  });

  it("deleteForever() ne fait rien si l'utilisateur annule, délègue sinon", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    await fixture.componentInstance.deleteForever(makeCategory({ id: 'c7' }));
    expect(store.deleteCategoryPermanently).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await fixture.componentInstance.deleteForever(makeCategory({ id: 'c7' }));
    expect(store.deleteCategoryPermanently).toHaveBeenCalledWith('c7');
  });

  it("deleteForever() affiche l'erreur du store (ex. catégorie encore utilisée)", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const store = makeFakeStore([], {
      deleteCategoryPermanently: vi.fn().mockRejectedValue(new Error('Catégorie encore utilisée')),
    });
    const { fixture, toastShow } = createFixture(store);
    await fixture.componentInstance.deleteForever(makeCategory({ id: 'c7' }));
    expect(toastShow).toHaveBeenCalledWith('Catégorie encore utilisée');
  });
});
