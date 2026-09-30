import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { BudgetStore } from '../../core/services/budget-store.service';
import { ToastService } from '../../core/services/toast.service';
import { Account, AccountBalanceSnapshot } from '../../core/models/budget.models';
import { Dashboard } from './dashboard';

const acc = (o: Partial<Account> = {}): Account => ({
  id: 'a', memberId: null, name: 'Chèques', institution: null, type: 'bank', archived: false, ...o,
});
const snap = (o: Partial<AccountBalanceSnapshot> = {}): AccountBalanceSnapshot => ({
  id: 's', accountId: 'a', date: '2026-01-01', balance: 1000, note: null, ...o,
});

interface PatrimoineOpts {
  accounts?: Account[];
  snapshots?: AccountBalanceSnapshot[];
  creditBalance?: (owner: string) => number;
}

function createDashboard(opts: PatrimoineOpts = {}) {
  const current = signal('2026-09');
  const activeOwner = signal('moi');
  const accounts = signal<Account[]>(opts.accounts ?? []);
  const store = {
    current,
    activeOwner,
    loadAll: vi.fn(),
    accounts,
    accountBalanceSnapshots: signal<AccountBalanceSnapshot[]>(opts.snapshots ?? []),
    creditCardBalance: opts.creditBalance ?? (() => 0),
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
  describe('bloc Patrimoine', () => {
    it("sans compte : pas de valeur nette (« — »), pas de 0 $", () => {
      const { dashboard } = createDashboard();
      expect(dashboard.hasAccounts()).toBe(false);
    });

    it('un compte archivé ne compte pas comme un compte', () => {
      const { dashboard } = createDashboard({ accounts: [acc({ archived: true })] });
      expect(dashboard.hasAccounts()).toBe(false);
    });

    it('valeur nette = soldes − dette de carte, comme sur /comptes', () => {
      const { dashboard } = createDashboard({
        accounts: [acc({ id: 'b' }), acc({ id: 'cc', type: 'credit', memberId: null })],
        snapshots: [snap({ accountId: 'b', balance: 1000 })],
        creditBalance: () => 400,
      });
      expect(dashboard.hasAccounts()).toBe(true);
      expect(dashboard.netWorth()).toMatchObject({ bank: 1000, credit: 400, net: 600 });
    });

    it("ne voit pas les comptes d'un autre membre", () => {
      const { dashboard } = createDashboard({
        accounts: [acc({ id: 'mien', memberId: 'moi' }), acc({ id: 'autre', memberId: 'madame' })],
        snapshots: [snap({ accountId: 'mien', balance: 100 }), snap({ id: 's2', accountId: 'autre', balance: 900 })],
      });
      expect(dashboard.netWorth().net).toBe(100);
    });
  });
});
