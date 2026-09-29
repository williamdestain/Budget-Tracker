import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Accounts } from './accounts';
import { BudgetStore } from '../../core/services/budget-store.service';
import { ToastService } from '../../core/services/toast.service';
import { Account, AccountBalanceSnapshot } from '../../core/models/budget.models';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc1',
    memberId: null,
    name: 'Compte chèques',
    institution: 'Banque X',
    type: 'bank',
    archived: false,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<AccountBalanceSnapshot> = {}): AccountBalanceSnapshot {
  return { id: 's1', accountId: 'acc1', date: '2026-09-01', balance: 100, note: null, ...overrides };
}

function makeFakeStore(opts: {
  accounts?: Account[];
  snapshots?: AccountBalanceSnapshot[];
  addAccount?: ReturnType<typeof vi.fn>;
  addAccountBalanceSnapshot?: ReturnType<typeof vi.fn>;
  archiveAccount?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    accounts: () => opts.accounts ?? [],
    accountBalanceSnapshots: () => opts.snapshots ?? [],
    addAccount: opts.addAccount ?? vi.fn().mockResolvedValue(makeAccount()),
    addAccountBalanceSnapshot: opts.addAccountBalanceSnapshot ?? vi.fn().mockResolvedValue(undefined),
    archiveAccount: opts.archiveAccount ?? vi.fn().mockResolvedValue(undefined),
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
  const fixture = TestBed.createComponent(Accounts);
  fixture.detectChanges();
  return { fixture, toastShow };
}

describe('Accounts', () => {
  it('activeAccounts() exclut les comptes archivés', () => {
    const store = makeFakeStore({
      accounts: [makeAccount({ id: 'a' }), makeAccount({ id: 'b', archived: true })],
    });
    const { fixture } = createFixture(store);
    expect(fixture.componentInstance.activeAccounts().map((a) => a.id)).toEqual(['a']);
  });

  it('latestBalance() retient le solde le plus récent à date <= balanceDate', () => {
    const store = makeFakeStore({
      snapshots: [
        makeSnapshot({ id: 's1', date: '2026-08-01', balance: 100 }),
        makeSnapshot({ id: 's2', date: '2026-09-01', balance: 150 }),
        makeSnapshot({ id: 's3', date: '2026-10-01', balance: 999 }), // futur, ignoré
      ],
    });
    const { fixture } = createFixture(store);
    fixture.componentInstance.balanceDate = '2026-09-15';
    expect(fixture.componentInstance.latestBalance('acc1')).toBe(150);
  });

  it('latestBalance() retourne null sans historique pour ce compte', () => {
    const { fixture } = createFixture(makeFakeStore({ snapshots: [] }));
    expect(fixture.componentInstance.latestBalance('inconnu')).toBeNull();
  });

  it('netWorth() additionne le dernier solde connu de chaque compte actif (0 si aucun)', () => {
    const store = makeFakeStore({
      accounts: [makeAccount({ id: 'a' }), makeAccount({ id: 'b' })],
      snapshots: [
        makeSnapshot({ accountId: 'a', date: '2026-09-01', balance: 200 }),
        // aucun solde pour 'b'
      ],
    });
    const { fixture } = createFixture(store);
    fixture.componentInstance.balanceDate = '2026-09-30';
    expect(fixture.componentInstance.netWorth()).toBe(200);
  });

  it('openForm() réinitialise tous les champs et ouvre le formulaire', () => {
    const { fixture } = createFixture(makeFakeStore());
    fixture.componentInstance.name = 'Ancien';
    fixture.componentInstance.balance = 500;

    fixture.componentInstance.openForm();

    expect(fixture.componentInstance.formOpen()).toBe(true);
    expect(fixture.componentInstance.name).toBe('');
    expect(fixture.componentInstance.institution).toBe('');
    expect(fixture.componentInstance.type).toBe('bank');
    expect(fixture.componentInstance.balance).toBeNull();
  });

  it('submit() ne fait rien si le nom est vide/blanc', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.name = '   ';
    await fixture.componentInstance.submit();
    expect(store.addAccount).not.toHaveBeenCalled();
  });

  it('submit() crée le compte (institution vide → null), ferme le formulaire et notifie', async () => {
    const store = makeFakeStore();
    const { fixture, toastShow } = createFixture(store);
    fixture.componentInstance.name = '  Épargne  ';
    fixture.componentInstance.institution = '   ';
    fixture.componentInstance.type = 'investment';
    fixture.componentInstance.balance = null;

    await fixture.componentInstance.submit();

    expect(store.addAccount).toHaveBeenCalledWith({
      memberId: null,
      name: 'Épargne',
      institution: null,
      type: 'investment',
      archived: false,
    });
    expect(store.addAccountBalanceSnapshot).not.toHaveBeenCalled();
    expect(fixture.componentInstance.formOpen()).toBe(false);
    expect(toastShow).toHaveBeenCalledWith('Compte ajouté.');
  });

  it('submit() enregistre aussi un solde initial quand il est fourni', async () => {
    const account = makeAccount({ id: 'new-acc' });
    const store = makeFakeStore({ addAccount: vi.fn().mockResolvedValue(account) });
    const { fixture } = createFixture(store);
    fixture.componentInstance.name = 'CELI';
    fixture.componentInstance.balance = 1234;
    fixture.componentInstance.balanceDate = '2026-09-20';

    await fixture.componentInstance.submit();

    expect(store.addAccountBalanceSnapshot).toHaveBeenCalledWith('new-acc', 1234, '2026-09-20', null);
  });

  it("submit() affiche l'erreur du store sans planter", async () => {
    const store = makeFakeStore({ addAccount: vi.fn().mockRejectedValue(new Error('Nom déjà pris')) });
    const { fixture, toastShow } = createFixture(store);
    fixture.componentInstance.name = 'Doublon';

    await fixture.componentInstance.submit();

    expect(toastShow).toHaveBeenCalledWith('Nom déjà pris');
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('archive() délègue au store et notifie', async () => {
    const store = makeFakeStore();
    const { fixture, toastShow } = createFixture(store);
    await fixture.componentInstance.archive('acc1');
    expect(store.archiveAccount).toHaveBeenCalledWith('acc1');
    expect(toastShow).toHaveBeenCalledWith('Compte archivé.');
  });

  it("archive() affiche l'erreur du store si l'archivage échoue", async () => {
    const store = makeFakeStore({ archiveAccount: vi.fn().mockRejectedValue(new Error('Introuvable')) });
    const { fixture, toastShow } = createFixture(store);
    await fixture.componentInstance.archive('acc1');
    expect(toastShow).toHaveBeenCalledWith('Introuvable');
  });
});
