import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { BudgetStore } from '../../core/services/budget-store.service';
import { ToastService } from '../../core/services/toast.service';
import { Dashboard } from './dashboard';

function createDashboard() {
  const current = signal('2026-09');
  const activeOwner = signal('moi');
  const store = {
    current,
    activeOwner,
    loadAll: vi.fn(),
  } as unknown as BudgetStore;
  const auth = { signOut: vi.fn() } as unknown as AuthService;
  const toast = { show: vi.fn() } as unknown as ToastService;
  return { dashboard: new Dashboard(auth, store, toast), store, auth };
}

describe('Dashboard', () => {
  it('charge les données au démarrage', () => {
    const { dashboard, store } = createDashboard();

    dashboard.ngOnInit();

    expect(store.loadAll).toHaveBeenCalledOnce();
  });

  it('navigue entre les mois et expose le mois courant formaté', () => {
    const { dashboard, store } = createDashboard();

    expect(dashboard.monthLabel).toContain('Septembre');
    dashboard.prevMonth();
    expect(store.current()).toBe('2026-08');
    dashboard.nextMonth();
    expect(store.current()).toBe('2026-09');
  });

  it('change le membre actif et délègue la déconnexion', () => {
    const { dashboard, store, auth } = createDashboard();

    dashboard.setOwner('madame');
    dashboard.logout();

    expect(store.activeOwner()).toBe('madame');
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
