import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { Accounts } from './accounts';
import { BudgetStore } from '../../core/services/budget-store.service';
import { ToastService } from '../../core/services/toast.service';
import { Account, AccountBalanceSnapshot } from '../../core/models/budget.models';
import { isoOfDate } from '../../core/utils/date.utils';

const TODAY = isoOfDate(new Date());
const FUTURE = '2999-01-01';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'acc1', memberId: null, name: 'Compte chèques', institution: 'Banque X', type: 'bank', archived: false, ...overrides };
}

function makeSnapshot(overrides: Partial<AccountBalanceSnapshot> = {}): AccountBalanceSnapshot {
  return { id: 's1', accountId: 'acc1', date: '2026-09-01', balance: 100, note: null, ...overrides };
}

interface StoreOpts {
  accounts?: Account[];
  snapshots?: AccountBalanceSnapshot[];
  owner?: string;
  creditBalance?: (owner: string) => number;
  addAccount?: ReturnType<typeof vi.fn>;
  addAccountBalanceSnapshot?: ReturnType<typeof vi.fn>;
  archiveAccount?: ReturnType<typeof vi.fn>;
}

function makeFakeStore(opts: StoreOpts = {}) {
  return {
    accounts: () => opts.accounts ?? [],
    accountBalanceSnapshots: () => opts.snapshots ?? [],
    activeOwner: () => opts.owner ?? 'global',
    memberName: (id: string) => (id === 'm1' ? 'Alex' : id === 'm2' ? 'Sam' : id),
    memberOptions: () => [
      { id: 'm1', name: 'Alex', color: '#000' },
      { id: 'm2', name: 'Sam', color: '#111' },
    ],
    creditCardBalance: opts.creditBalance ?? (() => 0),
    addAccount: opts.addAccount ?? vi.fn().mockResolvedValue(makeAccount()),
    addAccountBalanceSnapshot: opts.addAccountBalanceSnapshot ?? vi.fn().mockResolvedValue(undefined),
    archiveAccount: opts.archiveAccount ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
}

function createFixture(store: BudgetStore, toastShow = vi.fn()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: BudgetStore, useValue: store },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  const fixture = TestBed.createComponent(Accounts);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, toastShow };
}

describe('Accounts', () => {
  describe('affichage', () => {
    it('exclut les comptes archivés', () => {
      const { cmp } = createFixture(
        makeFakeStore({ accounts: [makeAccount({ id: 'a' }), makeAccount({ id: 'b', archived: true })] }),
      );
      expect(cmp.visible().map((a) => a.id)).toEqual(['a']);
    });

    it("un membre voit ses comptes et les partagés, pas ceux d'un autre", () => {
      const accounts = [
        makeAccount({ id: 'partage', memberId: null }),
        makeAccount({ id: 'm1', memberId: 'm1' }),
        makeAccount({ id: 'm2', memberId: 'm2' }),
      ];
      const { cmp } = createFixture(makeFakeStore({ accounts, owner: 'm1' }));
      expect(cmp.visible().map((a) => a.id)).toEqual(['partage', 'm1']);
    });

    it('regroupe par type dans un ordre fixe et omet les groupes vides', () => {
      const accounts = [
        makeAccount({ id: 'i', type: 'investment' }),
        makeAccount({ id: 'b', type: 'bank' }),
        makeAccount({ id: 'c', type: 'credit' }),
      ];
      const { cmp } = createFixture(makeFakeStore({ accounts }));
      expect(cmp.groups().map((g) => g.type)).toEqual(['bank', 'credit', 'investment']);
    });

    it("le solde affiché ignore un relevé daté du futur (et ne dépend pas du formulaire)", () => {
      const store = makeFakeStore({
        accounts: [makeAccount()],
        snapshots: [
          makeSnapshot({ id: 's1', date: '2026-08-01', balance: 100 }),
          makeSnapshot({ id: 's2', date: '2026-09-01', balance: 150 }),
          makeSnapshot({ id: 's3', date: FUTURE, balance: 999 }),
        ],
      });
      const { cmp } = createFixture(store);
      cmp.balanceDate = '2020-01-01'; // ne doit rien changer à l'affichage
      expect(cmp.groups()[0].rows[0].balance).toBe(150);
    });

    it('calcule la variation depuis le relevé précédent, sans variation avec un seul relevé', () => {
      const two = createFixture(
        makeFakeStore({
          accounts: [makeAccount()],
          snapshots: [
            makeSnapshot({ id: 's1', date: '2026-08-01', balance: 100 }),
            makeSnapshot({ id: 's2', date: '2026-09-01', balance: 150.5 }),
          ],
        }),
      ).cmp.groups()[0].rows[0];
      expect(two.delta).toBe(50.5);
      expect(two.deltaSince).toBe('2026-08-01');

      const one = createFixture(
        makeFakeStore({ accounts: [makeAccount()], snapshots: [makeSnapshot()] }),
      ).cmp.groups()[0].rows[0];
      expect(one.delta).toBeNull();
    });

    it("un compte sans relevé a un solde null (pas 0)", () => {
      const { cmp } = createFixture(makeFakeStore({ accounts: [makeAccount()] }));
      expect(cmp.groups()[0].rows[0].balance).toBeNull();
    });

    it('la carte de crédit lit creditCardBalance (partagé → global, perso → membre), sans snapshot', () => {
      const creditBalance = vi.fn((owner: string) => (owner === 'global' ? 500 : 300));
      const accounts = [makeAccount({ id: 'cc', type: 'credit', memberId: 'm1' })];
      const { cmp } = createFixture(
        makeFakeStore({ accounts, creditBalance, snapshots: [makeSnapshot({ accountId: 'cc', balance: 9999 })] }),
      );
      const row = cmp.groups()[0].rows[0];
      expect(row.balance).toBe(300);
      expect(row.updatedOn).toBeNull();
      expect(creditBalance).toHaveBeenCalledWith('m1');
    });

    it('la valeur nette soustrait la dette de carte (dette positive)', () => {
      const accounts = [makeAccount({ id: 'b' }), makeAccount({ id: 'cc', type: 'credit', memberId: null })];
      const store = makeFakeStore({
        accounts,
        snapshots: [makeSnapshot({ accountId: 'b', balance: 1000 })],
        creditBalance: () => 400,
      });
      const { cmp } = createFixture(store);
      expect(cmp.summary()).toMatchObject({ bank: 1000, credit: 400, net: 600 });
    });

    it('rend le texte de la valeur nette et un état vide sans compte', () => {
      const { fixture } = createFixture(makeFakeStore());
      expect(fixture.nativeElement.textContent).toContain('Aucun compte pour le moment');
    });
  });

  describe('ajout', () => {
    it('openAdd() réinitialise les champs, ouvre la modale, propriétaire = profil actif', () => {
      const { cmp } = createFixture(makeFakeStore({ owner: 'm2' }));
      cmp.name = 'Ancien';
      cmp.balance = 500;
      cmp.openAdd();
      expect(cmp.addOpen()).toBe(true);
      expect(cmp.name).toBe('');
      expect(cmp.balance).toBeNull();
      expect(cmp.ownerId).toBe('m2');
    });

    it('en vue globale, le propriétaire par défaut est « partagé »', () => {
      const { cmp } = createFixture(makeFakeStore({ owner: 'global' }));
      cmp.openAdd();
      expect(cmp.ownerId).toBe('');
    });

    it('submitAdd() ne fait rien si le nom est blanc', async () => {
      const store = makeFakeStore();
      const { cmp } = createFixture(store);
      cmp.name = '   ';
      await cmp.submitAdd();
      expect(store.addAccount).not.toHaveBeenCalled();
    });

    it('submitAdd() crée le compte (institution vide → null, partagé → memberId null) et notifie', async () => {
      const store = makeFakeStore();
      const { cmp, toastShow } = createFixture(store);
      cmp.openAdd();
      cmp.name = '  Épargne  ';
      cmp.institution = '   ';
      cmp.type = 'investment';
      await cmp.submitAdd();
      expect(store.addAccount).toHaveBeenCalledWith({
        memberId: null,
        name: 'Épargne',
        institution: null,
        type: 'investment',
        archived: false,
      });
      expect(store.addAccountBalanceSnapshot).not.toHaveBeenCalled();
      expect(cmp.addOpen()).toBe(false);
      expect(toastShow).toHaveBeenCalledWith('Compte ajouté.');
    });

    it('submitAdd() rattache le compte au membre choisi', async () => {
      const store = makeFakeStore();
      const { cmp } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'CELI';
      cmp.ownerId = 'm1';
      await cmp.submitAdd();
      expect(store.addAccount).toHaveBeenCalledWith(expect.objectContaining({ memberId: 'm1' }));
    });

    it('submitAdd() enregistre le solde initial quand fourni', async () => {
      const account = makeAccount({ id: 'new-acc' });
      const store = makeFakeStore({ addAccount: vi.fn().mockResolvedValue(account) });
      const { cmp } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'CELI';
      cmp.balance = 1234;
      cmp.balanceDate = TODAY;
      await cmp.submitAdd();
      expect(store.addAccountBalanceSnapshot).toHaveBeenCalledWith('new-acc', 1234, TODAY, null);
    });

    it("un solde à 0 est enregistré (0 n'est pas « pas de solde »)", async () => {
      const store = makeFakeStore({ addAccount: vi.fn().mockResolvedValue(makeAccount({ id: 'z' })) });
      const { cmp } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'Vide';
      cmp.balance = 0;
      await cmp.submitAdd();
      expect(store.addAccountBalanceSnapshot).toHaveBeenCalledWith('z', 0, TODAY, null);
    });

    it("une carte de crédit n'enregistre jamais de solde, même si un montant traîne", async () => {
      const store = makeFakeStore();
      const { cmp } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'Visa';
      cmp.type = 'credit';
      cmp.balance = 800;
      await cmp.submitAdd();
      expect(store.addAccount).toHaveBeenCalled();
      expect(store.addAccountBalanceSnapshot).not.toHaveBeenCalled();
    });

    it('refuse une 2e carte dont le périmètre chevauche une carte existante', async () => {
      const store = makeFakeStore({ accounts: [makeAccount({ id: 'cc', type: 'credit', memberId: null })] });
      const { cmp, toastShow } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'Visa 2';
      cmp.type = 'credit';
      cmp.ownerId = 'm1';
      await cmp.submitAdd();
      expect(store.addAccount).not.toHaveBeenCalled();
      expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('deux fois'));
    });

    it('refuse un solde initial daté du futur', async () => {
      const store = makeFakeStore();
      const { cmp, toastShow } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'CELI';
      cmp.balance = 10;
      cmp.balanceDate = FUTURE;
      await cmp.submitAdd();
      expect(store.addAccount).not.toHaveBeenCalled();
      expect(toastShow).toHaveBeenCalledWith('La date du solde ne peut pas être dans le futur.');
    });

    it("affiche l'erreur du store et réactive le bouton", async () => {
      const store = makeFakeStore({ addAccount: vi.fn().mockRejectedValue(new Error('Nom déjà pris')) });
      const { cmp, toastShow } = createFixture(store);
      cmp.openAdd();
      cmp.name = 'Doublon';
      await cmp.submitAdd();
      expect(toastShow).toHaveBeenCalledWith('Nom déjà pris');
      expect(cmp.saving()).toBe(false);
      expect(cmp.addOpen()).toBe(true);
    });
  });

  describe('détail et mise à jour du solde', () => {
    const base = () => makeFakeStore({ accounts: [makeAccount()], snapshots: [makeSnapshot()] });

    it('openDetail() sélectionne le compte et remet le formulaire à zéro', () => {
      const { cmp } = createFixture(base());
      cmp.newBalance = 5;
      cmp.openDetail('acc1');
      expect(cmp.selected()?.account.id).toBe('acc1');
      expect(cmp.newBalance).toBeNull();
      expect(cmp.newBalanceDate).toBe(TODAY);
    });

    it("l'historique est limité à 12 relevés, du plus récent, sans le futur", () => {
      const snapshots = Array.from({ length: 15 }, (_, i) =>
        makeSnapshot({ id: `s${i}`, date: `2026-${String((i % 9) + 1).padStart(2, '0')}-${String(i + 10)}`, balance: i }),
      ).concat(makeSnapshot({ id: 'fut', date: FUTURE }));
      const { cmp } = createFixture(makeFakeStore({ accounts: [makeAccount()], snapshots }));
      cmp.openDetail('acc1');
      expect(cmp.history()).toHaveLength(12);
      expect(cmp.history().some((s) => s.id === 'fut')).toBe(false);
    });

    it('submitBalance() enregistre le relevé (note vide → null) et vide le formulaire', async () => {
      const store = base();
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('acc1');
      cmp.newBalance = 250;
      cmp.newNote = '   ';
      await cmp.submitBalance();
      expect(store.addAccountBalanceSnapshot).toHaveBeenCalledWith('acc1', 250, TODAY, null);
      expect(cmp.newBalance).toBeNull();
      expect(toastShow).toHaveBeenCalledWith('Solde mis à jour.');
    });

    it('submitBalance() accepte un solde négatif ou nul', async () => {
      const store = base();
      const { cmp } = createFixture(store);
      cmp.openDetail('acc1');
      cmp.newBalance = 0;
      await cmp.submitBalance();
      cmp.newBalance = -75.5;
      await cmp.submitBalance();
      expect(store.addAccountBalanceSnapshot).toHaveBeenCalledTimes(2);
    });

    it('submitBalance() refuse une date future et ne fait rien sans montant', async () => {
      const store = base();
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('acc1');
      await cmp.submitBalance();
      expect(store.addAccountBalanceSnapshot).not.toHaveBeenCalled();
      cmp.newBalance = 10;
      cmp.newBalanceDate = FUTURE;
      await cmp.submitBalance();
      expect(store.addAccountBalanceSnapshot).not.toHaveBeenCalled();
      expect(toastShow).toHaveBeenCalledWith('La date du solde ne peut pas être dans le futur.');
    });

    it("submitBalance() n'écrit jamais de relevé sur une carte de crédit", async () => {
      const store = makeFakeStore({ accounts: [makeAccount({ id: 'cc', type: 'credit' })] });
      const { cmp } = createFixture(store);
      cmp.openDetail('cc');
      cmp.newBalance = 10;
      await cmp.submitBalance();
      expect(store.addAccountBalanceSnapshot).not.toHaveBeenCalled();
    });

    it("submitBalance() affiche l'erreur du store et garde la saisie", async () => {
      const store = makeFakeStore({
        accounts: [makeAccount()],
        addAccountBalanceSnapshot: vi.fn().mockRejectedValue(new Error('Réseau')),
      });
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('acc1');
      cmp.newBalance = 10;
      await cmp.submitBalance();
      expect(toastShow).toHaveBeenCalledWith('Réseau');
      expect(cmp.newBalance).toBe(10);
      expect(cmp.saving()).toBe(false);
    });
  });

  describe('archivage', () => {
    it('demande une confirmation avant de toucher au store', async () => {
      const store = makeFakeStore({ accounts: [makeAccount()] });
      const { cmp } = createFixture(store);
      cmp.openDetail('acc1');
      await cmp.archive();
      expect(store.archiveAccount).not.toHaveBeenCalled();
      expect(cmp.confirmArchive()).toBe(true);
    });

    it('archive au second appel, ferme le détail et notifie', async () => {
      const store = makeFakeStore({ accounts: [makeAccount()] });
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('acc1');
      await cmp.archive();
      await cmp.archive();
      expect(store.archiveAccount).toHaveBeenCalledWith('acc1');
      expect(cmp.selectedId()).toBeNull();
      expect(toastShow).toHaveBeenCalledWith('Compte archivé.');
    });

    it("fermer puis rouvrir le détail annule la confirmation en attente", async () => {
      const store = makeFakeStore({ accounts: [makeAccount()] });
      const { cmp } = createFixture(store);
      cmp.openDetail('acc1');
      await cmp.archive();
      cmp.closeDetail();
      cmp.openDetail('acc1');
      expect(cmp.confirmArchive()).toBe(false);
    });

    it("affiche l'erreur du store si l'archivage échoue", async () => {
      const store = makeFakeStore({
        accounts: [makeAccount()],
        archiveAccount: vi.fn().mockRejectedValue(new Error('Introuvable')),
      });
      const { cmp, toastShow } = createFixture(store);
      cmp.openDetail('acc1');
      await cmp.archive();
      await cmp.archive();
      expect(toastShow).toHaveBeenCalledWith('Introuvable');
    });
  });
});
