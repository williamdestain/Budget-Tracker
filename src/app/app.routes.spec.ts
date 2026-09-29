import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { BudgetPage } from './features/budget/budget-page/budget-page';

describe('routes', () => {
  it('charge la page Budget via la route protégée et lazy', async () => {
    const shellRoute = routes.find((route) => route.path === '');
    const budgetRoute = shellRoute?.children?.find((route) => route.path === 'budget');

    expect(shellRoute?.canActivate).toBeDefined();
    expect(budgetRoute?.data?.['navTitle']).toBe('Budget & enveloppes');
    expect(budgetRoute?.loadComponent).toBeDefined();
    await expect(budgetRoute?.loadComponent?.()).resolves.toBe(BudgetPage);
  });

  it('garde les objectifs d’épargne sur leur destination distincte', () => {
    const shellRoute = routes.find((route) => route.path === '');
    const savingsRoute = shellRoute?.children?.find((route) => route.path === 'epargne');

    expect(savingsRoute?.data?.['navTitle']).toBe('Épargne & objectifs');
    expect(savingsRoute?.loadComponent).toBeDefined();
  });
});
