import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { BudgetPage } from './features/budget/budget-page/budget-page';
import { SavingsPage } from './features/savings/savings-page/savings-page';

describe('routes', () => {
  it('charge la page Budget via la route protégée et lazy', async () => {
    const shellRoute = routes.find((route) => route.path === '');
    const budgetRoute = shellRoute?.children?.find((route) => route.path === 'budget');

    expect(shellRoute?.canActivate).toBeDefined();
    expect(budgetRoute?.data?.['navTitle']).toBe('Budget & enveloppes');
    expect(budgetRoute?.loadComponent).toBeDefined();
    await expect(budgetRoute?.loadComponent?.()).resolves.toBe(BudgetPage);
  });

  it('garde les objectifs d’épargne sur leur destination distincte', async () => {
    const shellRoute = routes.find((route) => route.path === '');
    const savingsRoute = shellRoute?.children?.find((route) => route.path === 'epargne');

    expect(savingsRoute?.data?.['navTitle']).toBe('Épargne & objectifs');
    expect(savingsRoute?.loadComponent).toBeDefined();
    await expect(savingsRoute?.loadComponent?.()).resolves.toBe(SavingsPage);
  });

  it("ne propose le bouton « Ajouter » de la barre du haut que sur le tableau de bord et Mouvements", () => {
    const shellRoute = routes.find((route) => route.path === '');
    const withAdd = (shellRoute?.children ?? [])
      .filter((route) => route.data?.['showAdd'] === true)
      .map((route) => route.path);
    expect(withAdd.sort()).toEqual(['mouvements', 'tableau-de-bord']);
  });
});
