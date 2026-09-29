import { describe, expect, it, vi } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { CategoryBudgets } from './category-budgets';

function createComponent(owner = 'moi') {
  const store = {
    activeOwner: () => owner,
    current: () => '2026-09',
    categoryBudgetRows: () => [{ category: 'Courses' }],
    activeCategoryNames: () => [
      'Courses',
      'Transport',
      'Revenu',
      'Versement',
      'Remboursement Carte Crédit',
    ],
    colorFor: vi.fn((category: string) => `color:${category}`),
    setCategoryBudget: vi.fn().mockResolvedValue(undefined),
    removeCategoryBudget: vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
  const toast = { show: vi.fn() } as unknown as ToastService;
  return { component: new CategoryBudgets(store, toast), store, toast };
}

describe('CategoryBudgets', () => {
  it('propose uniquement les catégories non utilisées et budgétables', () => {
    const { component } = createComponent();

    expect(component.availableCategories()).toEqual(['Transport']);
  });

  it('ouvre la gestion en sélectionnant la première catégorie disponible', () => {
    const { component } = createComponent();

    component.toggleAdd();

    expect(component.addOpen()).toBe(true);
    expect(component.newCategory).toBe('Transport');
    expect(component.newAmount).toBeNull();
  });

  it('enregistre un budget explicite à zéro au lieu de le supprimer', async () => {
    const { component, store } = createComponent();
    component.editAmount = 0;
    component.editingCategory.set('Courses');

    await component.saveEdit('Courses');

    expect(store.setCategoryBudget).toHaveBeenCalledWith('moi', '2026-09', 'Courses', 0);
    expect(store.removeCategoryBudget).not.toHaveBeenCalled();
    expect(component.editingCategory()).toBeNull();
  });

  it('refuse de modifier ou ajouter un budget dans la vue globale', async () => {
    const { component, store } = createComponent('global');
    component.editAmount = 100;
    component.newCategory = 'Transport';
    component.newAmount = 100;
    component.addOpen.set(true);

    await component.saveEdit('Courses');
    await component.removeBudget('Courses');
    await component.submitAdd();

    expect(store.setCategoryBudget).not.toHaveBeenCalled();
    expect(store.removeCategoryBudget).not.toHaveBeenCalled();
  });

  it('signale les erreurs de sauvegarde à l’utilisateur', async () => {
    const { component, store, toast } = createComponent();
    vi.mocked(store.setCategoryBudget).mockRejectedValueOnce(new Error('Échec réseau'));
    component.startEdit('Courses', 250);

    await component.saveEdit('Courses');

    expect(toast.show).toHaveBeenCalledWith('Échec réseau');
    expect(component.editingCategory()).toBe('Courses');
  });
});
