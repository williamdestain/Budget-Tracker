import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { CreditCard } from './credit-card';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { fmt } from '../../../core/utils/currency.utils';

// Test de composition en isolation (même convention que
// money-pulse.spec.ts) : premier écran restylé de la Phase 2 (vague A).
// On vérifie que le nouveau template (Card/Button/Icon) se construit et
// se rend sans planter avec un store minimal — pas la logique de calcul
// elle-même, déjà couverte par budget-store.service.spec.ts.
function makeFakeStore(opts: {
  balance?: number;
  balanceAllOwners?: number;
  activeOwner?: 'moi' | 'madame' | 'global';
  current?: string;
  visibleExpenses?: { category: string; amount: number; cc: boolean }[];
  payments?: { id: string; memberId: string; date: string; amount: number; note: string }[];
  addCreditCardPayment?: ReturnType<typeof vi.fn>;
  removeCreditCardPayment?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    activeOwner: () => opts.activeOwner ?? 'moi',
    current: () => opts.current ?? '2026-08',
    creditCardBalance: (owner: string) =>
      owner === 'global' ? (opts.balanceAllOwners ?? opts.balance ?? 0) : (opts.balance ?? 0),
    visibleExpenses: () => opts.visibleExpenses ?? [],
    colorFor: () => '#4c7a66',
    creditCardPayments: () => opts.payments ?? [],
    addCreditCardPayment: opts.addCreditCardPayment ?? vi.fn().mockResolvedValue(undefined),
    removeCreditCardPayment: opts.removeCreditCardPayment ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
}

function createFixture(storeOverrides: Parameters<typeof makeFakeStore>[0] = {}, toastShow = vi.fn()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: makeFakeStore(storeOverrides) },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  return { fixture: TestBed.createComponent(CreditCard), toastShow };
}

function createSimpleFixture(balance = 120.5) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: makeFakeStore({ balance }) },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  return TestBed.createComponent(CreditCard);
}

describe('CreditCard', () => {
  it('se construit et se rend sans erreur', () => {
    const fixture = createSimpleFixture();
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('affiche le solde dû formaté quand positif (une dette)', () => {
    const fixture = createSimpleFixture(120.5);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(fmt(120.5));
    expect(text).toContain('Tu dois actuellement');
  });

  it('affiche "Crédit disponible" quand le solde est négatif', () => {
    const fixture = createSimpleFixture(-30);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Crédit disponible');
    expect(text).toContain(fmt(30));
  });

  it('showCombinedBalance est faux en vue Global (déjà le solde combiné)', () => {
    const global = createFixture({ activeOwner: 'global' }).fixture;
    expect(global.componentInstance.showCombinedBalance).toBe(false);
    const moi = createFixture({ activeOwner: 'moi' }).fixture;
    expect(moi.componentInstance.showCombinedBalance).toBe(true);
  });

  it('breakdown() agrège les dépenses par carte (cc=true), exclut Versement/Remboursement, trie décroissant et calcule le %', () => {
    const { fixture } = createFixture({
      visibleExpenses: [
        { category: 'Épicerie', amount: 30, cc: true },
        { category: 'Épicerie', amount: 30, cc: true },
        { category: 'Transport', amount: 40, cc: true },
        { category: 'Loisirs', amount: 100, cc: false }, // pas sur la carte, exclu
        { category: 'Versement', amount: 50, cc: true }, // exclu explicitement
        { category: 'Remboursement Carte Crédit', amount: 20, cc: true }, // exclu explicitement
      ],
    });
    const { entries, total } = fixture.componentInstance.breakdown();
    expect(total).toBe(100);
    expect(entries.map((e) => e.category)).toEqual(['Épicerie', 'Transport']);
    expect(entries[0].pct).toBe(60);
    expect(entries[1].pct).toBe(40);
  });

  it('breakdown() renvoie un total et un tableau vides sans planter (pct=0 évité par division nulle)', () => {
    const { fixture } = createFixture({ visibleExpenses: [] });
    expect(fixture.componentInstance.breakdown()).toEqual({ entries: [], total: 0 });
  });

  it('payments() ne garde que les paiements du mois courant, filtrés par profil, triés du plus récent au plus ancien', () => {
    const { fixture } = createFixture({
      current: '2026-08',
      activeOwner: 'moi',
      payments: [
        { id: 'p1', memberId: 'moi', date: '2026-08-05', amount: 50, note: '' },
        { id: 'p2', memberId: 'madame', date: '2026-08-10', amount: 60, note: '' }, // autre profil
        { id: 'p3', memberId: 'moi', date: '2026-07-20', amount: 70, note: '' }, // autre mois
        { id: 'p4', memberId: 'moi', date: '2026-08-20', amount: 80, note: '' },
      ],
    });
    expect(fixture.componentInstance.payments().map((p) => p.id)).toEqual(['p4', 'p1']);
  });

  it('payments() inclut tous les profils en vue Global', () => {
    const { fixture } = createFixture({
      current: '2026-08',
      activeOwner: 'global',
      payments: [
        { id: 'p1', memberId: 'moi', date: '2026-08-05', amount: 50, note: '' },
        { id: 'p2', memberId: 'madame', date: '2026-08-10', amount: 60, note: '' },
      ],
    });
    expect(fixture.componentInstance.payments().map((p) => p.id).sort()).toEqual(['p1', 'p2']);
  });

  it('togglePay() préremplit le montant avec le solde dû (si positif) à l\'ouverture', () => {
    const { fixture } = createFixture({ balance: 75 });
    fixture.componentInstance.togglePay();
    expect(fixture.componentInstance.payOpen()).toBe(true);
    expect(fixture.componentInstance.payAmount).toBe(75);
  });

  it('togglePay() laisse le montant vide si le solde dû est nul ou négatif', () => {
    const { fixture } = createFixture({ balance: -10 });
    fixture.componentInstance.togglePay();
    expect(fixture.componentInstance.payAmount).toBeNull();
  });

  it("togglePay() referme sans toucher aux champs quand on referme le panneau", () => {
    const { fixture } = createFixture({ balance: 75 });
    fixture.componentInstance.togglePay();
    fixture.componentInstance.payAmount = 999;
    fixture.componentInstance.togglePay();
    expect(fixture.componentInstance.payOpen()).toBe(false);
    expect(fixture.componentInstance.payAmount).toBe(999);
  });

  it("submitPay() ne fait rien si le montant est nul, absent, <= 0, ou la date vide", async () => {
    const { fixture, toastShow } = createFixture();
    fixture.componentInstance.payAmount = 0;
    fixture.componentInstance.payDate = '2026-08-01';
    await fixture.componentInstance.submitPay();
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('submitPay() refuse en vue Global et invite à choisir un profil', async () => {
    const store = { addCreditCardPayment: vi.fn() };
    const { fixture, toastShow } = createFixture({
      activeOwner: 'global',
      addCreditCardPayment: store.addCreditCardPayment,
    });
    fixture.componentInstance.payAmount = 50;
    fixture.componentInstance.payDate = '2026-08-01';

    await fixture.componentInstance.submitPay();

    expect(store.addCreditCardPayment).not.toHaveBeenCalled();
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('profil Moi ou Madame'));
  });

  it('submitPay() enregistre le paiement, referme le panneau et notifie le montant payé', async () => {
    const addCreditCardPayment = vi.fn().mockResolvedValue(undefined);
    const { fixture, toastShow } = createFixture({ activeOwner: 'moi', addCreditCardPayment });
    fixture.componentInstance.payOpen.set(true);
    fixture.componentInstance.payAmount = 42;
    fixture.componentInstance.payDate = '2026-08-15';
    fixture.componentInstance.payNote = 'Paiement mensuel';

    await fixture.componentInstance.submitPay();

    expect(addCreditCardPayment).toHaveBeenCalledWith('moi', 42, '2026-08-15', 'Paiement mensuel');
    expect(fixture.componentInstance.payOpen()).toBe(false);
    expect(fixture.componentInstance.payAmount).toBeNull();
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining(fmt(42)));
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it("submitPay() affiche l'erreur du store si l'enregistrement échoue", async () => {
    const addCreditCardPayment = vi.fn().mockRejectedValue(new Error('Mois clôturé'));
    const { fixture, toastShow } = createFixture({ addCreditCardPayment });
    fixture.componentInstance.payAmount = 42;
    fixture.componentInstance.payDate = '2026-08-15';

    await fixture.componentInstance.submitPay();

    expect(toastShow).toHaveBeenCalledWith('Mois clôturé');
  });

  it('removePayment() délègue au store', async () => {
    const removeCreditCardPayment = vi.fn().mockResolvedValue(undefined);
    const { fixture } = createFixture({ removeCreditCardPayment });
    await fixture.componentInstance.removePayment('p1');
    expect(removeCreditCardPayment).toHaveBeenCalledWith('p1');
  });

  it("removePayment() affiche l'erreur du store si la suppression échoue", async () => {
    const removeCreditCardPayment = vi.fn().mockRejectedValue(new Error('Introuvable'));
    const { fixture, toastShow } = createFixture({ removeCreditCardPayment });
    await fixture.componentInstance.removePayment('p1');
    expect(toastShow).toHaveBeenCalledWith('Introuvable');
  });
});
