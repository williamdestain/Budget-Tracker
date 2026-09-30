import { describe, expect, it } from 'vitest';
import { Account, AccountBalanceSnapshot } from '../models/budget.models';
import {
  accountBalance,
  creditScopeConflict,
  netWorthBreakdown,
  snapshotsUpTo,
  visibleAccounts,
} from './accounts.utils';

function acc(overrides: Partial<Account> = {}): Account {
  return { id: 'a', memberId: null, name: 'Compte', institution: null, type: 'bank', archived: false, ...overrides };
}

function snap(overrides: Partial<AccountBalanceSnapshot> = {}): AccountBalanceSnapshot {
  return { id: 's', accountId: 'a', date: '2026-09-01', balance: 100, note: null, ...overrides };
}

// Dettes de carte simulées : partagé (null) = 500 pour tout le foyer, m1 = 300, m2 = 200.
const credit = (memberId: string | null): number =>
  memberId === null ? 500 : memberId === 'm1' ? 300 : 200;

describe('accounts.utils', () => {
  describe('snapshotsUpTo', () => {
    it('trie du plus récent au plus ancien et ignore le futur et les autres comptes', () => {
      const list = [
        snap({ id: '1', date: '2026-08-01' }),
        snap({ id: '2', date: '2026-09-15' }),
        snap({ id: '3', date: '2026-10-01' }), // futur
        snap({ id: '4', date: '2026-09-10', accountId: 'autre' }),
      ];
      expect(snapshotsUpTo(list, 'a', '2026-09-29').map((s) => s.id)).toEqual(['2', '1']);
    });

    it('inclut un snapshot daté exactement de asOf', () => {
      expect(snapshotsUpTo([snap({ date: '2026-09-29' })], 'a', '2026-09-29')).toHaveLength(1);
    });
  });

  describe('accountBalance', () => {
    it('renvoie le dernier snapshot ≤ asOf pour un compte bancaire', () => {
      const list = [snap({ date: '2026-08-01', balance: 100 }), snap({ id: '2', date: '2026-09-01', balance: 150 })];
      expect(accountBalance(acc(), list, '2026-09-29', credit)).toBe(150);
    });

    it('renvoie null (et non 0) sans aucun snapshot', () => {
      expect(accountBalance(acc(), [], '2026-09-29', credit)).toBeNull();
    });

    it("un compte 'credit' passe par creditCardBalance, jamais par les snapshots", () => {
      const list = [snap({ accountId: 'cc', balance: 9999 })];
      const partage = acc({ id: 'cc', type: 'credit', memberId: null });
      const perso = acc({ id: 'cc', type: 'credit', memberId: 'm1' });
      expect(accountBalance(partage, list, '2026-09-29', credit)).toBe(500);
      expect(accountBalance(perso, list, '2026-09-29', credit)).toBe(300);
    });
  });

  describe('visibleAccounts', () => {
    const list = [
      acc({ id: 'partage', memberId: null }),
      acc({ id: 'm1', memberId: 'm1' }),
      acc({ id: 'm2', memberId: 'm2' }),
    ];
    it("un membre voit ses comptes + les comptes partagés, pas ceux d'un autre", () => {
      expect(visibleAccounts(list, 'm1').map((a) => a.id)).toEqual(['partage', 'm1']);
    });
    it('la vue global voit tout', () => {
      expect(visibleAccounts(list, 'global')).toHaveLength(3);
    });
  });

  describe('netWorthBreakdown', () => {
    it('= banque + investissements + autres − dette de carte (dette positive soustraite)', () => {
      const accounts = [
        acc({ id: 'b', type: 'bank' }),
        acc({ id: 'i', type: 'investment' }),
        acc({ id: 'o', type: 'other' }),
        acc({ id: 'c', type: 'credit', memberId: null }),
      ];
      const snaps = [
        snap({ accountId: 'b', balance: 1000 }),
        snap({ id: '2', accountId: 'i', balance: 2000 }),
        snap({ id: '3', accountId: 'o', balance: 50 }),
      ];
      expect(netWorthBreakdown(accounts, snaps, '2026-09-29', credit)).toEqual({
        bank: 1000,
        investment: 2000,
        other: 50,
        credit: 500,
        net: 2550,
      });
    });

    it('exclut les comptes archivés (y compris une carte archivée)', () => {
      const accounts = [
        acc({ id: 'b', archived: true }),
        acc({ id: 'c', type: 'credit', archived: true }),
      ];
      const r = netWorthBreakdown(accounts, [snap({ accountId: 'b', balance: 1000 })], '2026-09-29', credit);
      expect(r).toMatchObject({ bank: 0, credit: 0, net: 0 });
    });

    it('un compte sans solde compte pour 0 sans faire planter le total', () => {
      const r = netWorthBreakdown([acc()], [], '2026-09-29', credit);
      expect(r.net).toBe(0);
    });

    it('ignore un snapshot daté du futur', () => {
      const snaps = [snap({ date: '2026-09-01', balance: 100 }), snap({ id: '2', date: '2027-01-01', balance: 9999 })];
      expect(netWorthBreakdown([acc()], snaps, '2026-09-29', credit).bank).toBe(100);
    });

    it('ne compte pas deux fois la dette quand un compte partagé chevauche un compte perso', () => {
      const accounts = [
        acc({ id: 'c1', type: 'credit', memberId: null }),
        acc({ id: 'c2', type: 'credit', memberId: 'm1' }),
      ];
      expect(netWorthBreakdown(accounts, [], '2026-09-29', credit).credit).toBe(500);
    });

    it('additionne la dette de cartes personnelles de membres distincts', () => {
      const accounts = [
        acc({ id: 'c1', type: 'credit', memberId: 'm1' }),
        acc({ id: 'c2', type: 'credit', memberId: 'm2' }),
      ];
      expect(netWorthBreakdown(accounts, [], '2026-09-29', credit).credit).toBe(500);
    });

    it('arrondit à 2 décimales (pas de 0.1 + 0.2)', () => {
      const snaps = [snap({ accountId: 'x', balance: 0.1 }), snap({ id: '2', accountId: 'y', balance: 0.2 })];
      const accounts = [acc({ id: 'x' }), acc({ id: 'y' })];
      expect(netWorthBreakdown(accounts, snaps, '2026-09-29', credit).net).toBe(0.3);
    });
  });

  describe('creditScopeConflict', () => {
    const partage = acc({ type: 'credit', memberId: null });
    const perso = acc({ type: 'credit', memberId: 'm1' });

    it('aucun conflit sans carte existante ou avec une banque seulement', () => {
      expect(creditScopeConflict([], null)).toBe(false);
      expect(creditScopeConflict([acc({ type: 'bank' })], 'm1')).toBe(false);
    });
    it('conflit : partagé existant + nouvelle carte perso, et inversement', () => {
      expect(creditScopeConflict([partage], 'm1')).toBe(true);
      expect(creditScopeConflict([perso], null)).toBe(true);
    });
    it('conflit : deux cartes du même membre', () => {
      expect(creditScopeConflict([perso], 'm1')).toBe(true);
    });
    it('pas de conflit : cartes de deux membres différents', () => {
      expect(creditScopeConflict([perso], 'm2')).toBe(false);
    });
    it('une carte archivée ne bloque plus', () => {
      expect(creditScopeConflict([{ ...perso, archived: true }], 'm1')).toBe(false);
    });
  });
});
