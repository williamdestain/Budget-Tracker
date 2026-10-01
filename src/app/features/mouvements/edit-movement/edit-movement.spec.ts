import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { EditMovement, MovementKind } from './edit-movement';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';

// Identifiants UUID, comme un foyer créé depuis la migration 024.
const ALEX = '3f9c1c1e-0000-4000-8000-000000000001';
const SAM = '3f9c1c1e-0000-4000-8000-000000000002';

const expense = (o: Record<string, unknown> = {}) => ({
  id: 'e1', amount: 42.5, category: 'Épicerie', date: '2026-09-12', memberId: ALEX, cc: false,
  versementToMemberId: null, ...o,
});
const income = (o: Record<string, unknown> = {}) => ({
  id: 'i1', amount: 2000, type: 'Salaire', date: '2026-09-01', memberId: ALEX, note: '',
  recurring: false, recurringInterval: 'once', recurringStartMonth: '2026-09', recurringSourceId: null, ...o,
});

interface Init {
  expenses?: unknown[];
  incomes?: unknown[];
  provisions?: unknown[];
  recurringIncomes?: unknown[];
  closed?: string[];
  categories?: string[];
  updateExpense?: ReturnType<typeof vi.fn>;
  removeExpense?: ReturnType<typeof vi.fn>;
  updateIncome?: ReturnType<typeof vi.fn>;
  removeIncome?: ReturnType<typeof vi.fn>;
}

function makeStore(init: Init = {}) {
  const provisions = signal<any[]>((init.provisions as any[]) ?? []);
  const recurringIncomes = signal<any[]>((init.recurringIncomes as any[]) ?? []);
  return {
    expenses: signal<any[]>((init.expenses as any[]) ?? []),
    incomes: signal<any[]>((init.incomes as any[]) ?? []),
    provisions,
    recurringIncomes,
    isMonthClosed: (ym: string) => (init.closed ?? []).includes(ym),
    memberOptions: () => [
      { id: ALEX, name: 'Alex', color: '#000' },
      { id: SAM, name: 'Sam', color: '#111' },
    ],
    memberName: (id: string) => (id === ALEX ? 'Alex' : id === SAM ? 'Sam' : id),
    activeCategoryNames: () => init.categories ?? ['Épicerie', 'Transport', 'Versement'],
    updateExpense: init.updateExpense ?? vi.fn().mockResolvedValue(undefined),
    removeExpense: init.removeExpense ?? vi.fn().mockResolvedValue(undefined),
    updateIncome: init.updateIncome ?? vi.fn().mockResolvedValue(undefined),
    removeIncome: init.removeIncome ?? vi.fn().mockResolvedValue(undefined),
    // Les effets visibles de ces deux-là passent par des signaux : le composant
    // doit réagir sans qu'on le relance.
    cancelVersementSplit: vi.fn(async (id: string) => {
      provisions.update((list) =>
        list.map((p) => ({ ...p, adjustments: p.adjustments.filter((a: any) => a.versementExpenseId !== id) })),
      );
    }),
    removeRecurringIncome: vi.fn(async (id: string) => {
      recurringIncomes.update((list) => list.filter((r) => r.id !== id));
    }),
  } as unknown as BudgetStore & Record<string, any>;
}

function create(kind: MovementKind, id: string, store: ReturnType<typeof makeStore>) {
  TestBed.resetTestingModule();
  const toastShow = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: store },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  const fixture = TestBed.createComponent(EditMovement);
  fixture.componentRef.setInput('kind', kind);
  fixture.componentRef.setInput('movementId', id);
  const done = vi.fn();
  fixture.componentInstance.done.subscribe(done);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, cmp: fixture.componentInstance, el, done, toastShow };
}

const buttonText = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());

describe('EditMovement — dépense', () => {
  it('charge les valeurs de la dépense', () => {
    const { cmp } = create('expense', 'e1', makeStore({ expenses: [expense({ cc: true })] }));
    expect(cmp.amount).toBe(42.5);
    expect(cmp.category).toBe('Épicerie');
    expect(cmp.date).toBe('2026-09-12');
    expect(cmp.owner).toBe(ALEX);
    expect(cmp.cc).toBe(true);
  });

  it('enregistre les changements, confirme et demande la fermeture', async () => {
    const store = makeStore({ expenses: [expense()] });
    const { cmp, done, toastShow } = create('expense', 'e1', store);
    cmp.amount = 60;
    cmp.category = 'Transport';
    cmp.date = '2026-09-20';
    cmp.owner = SAM;
    cmp.cc = true;
    await cmp.save();
    expect(store.updateExpense).toHaveBeenCalledWith('e1', {
      amount: 60, category: 'Transport', date: '2026-09-20', memberId: SAM, cc: true, versementToMemberId: null,
    });
    expect(toastShow).toHaveBeenCalledWith('Dépense modifiée.');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('un Versement garde son destinataire', async () => {
    const store = makeStore({ expenses: [expense({ category: 'Versement', versementToMemberId: SAM })] });
    const { cmp } = create('expense', 'e1', store);
    await cmp.save();
    expect(store.updateExpense).toHaveBeenCalledWith('e1', expect.objectContaining({ versementToMemberId: SAM }));
  });

  it("un ancien Versement sans destinataire reçoit « l'autre membre », jamais l'émetteur", async () => {
    const store = makeStore({ expenses: [expense({ category: 'Versement', versementToMemberId: null })] });
    const { cmp } = create('expense', 'e1', store);
    await cmp.save();
    expect(store.updateExpense).toHaveBeenCalledWith('e1', expect.objectContaining({ versementToMemberId: SAM }));
  });

  it("changer l'émetteur d'un versement ne peut pas en faire un versement à soi-même", async () => {
    const store = makeStore({ expenses: [expense({ category: 'Versement', memberId: ALEX, versementToMemberId: SAM })] });
    const { cmp } = create('expense', 'e1', store);
    cmp.owner = SAM;
    cmp.onOwnerChange();
    await cmp.save();
    expect(store.updateExpense).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ memberId: SAM, versementToMemberId: ALEX }),
    );
  });

  it("une dépense qui cesse d'être un Versement perd son destinataire", async () => {
    const store = makeStore({ expenses: [expense({ category: 'Versement', versementToMemberId: SAM })] });
    const { cmp } = create('expense', 'e1', store);
    cmp.category = 'Transport';
    await cmp.save();
    expect(store.updateExpense).toHaveBeenCalledWith('e1', expect.objectContaining({ versementToMemberId: null }));
  });

  it('une dépense qui devient un Versement reçoit un destinataire valide', async () => {
    const store = makeStore({ expenses: [expense()] });
    const { cmp } = create('expense', 'e1', store);
    cmp.category = 'Versement';
    await cmp.save();
    expect(store.updateExpense).toHaveBeenCalledWith('e1', expect.objectContaining({ versementToMemberId: SAM }));
  });

  it('propose la catégorie actuelle même archivée, sans « Revenu » ni le paiement de carte', () => {
    const store = makeStore({
      expenses: [expense({ category: 'Ancienne catégorie' })],
      categories: ['Épicerie', 'Revenu', 'Remboursement Carte Crédit', 'Transport'],
    });
    const { cmp } = create('expense', 'e1', store);
    expect(cmp.categoryOptions()).toEqual(['Ancienne catégorie', 'Épicerie', 'Transport']);
  });

  it('verrouille la catégorie « Remboursement Carte Crédit » et la conserve', async () => {
    const store = makeStore({ expenses: [expense({ category: 'Remboursement Carte Crédit' })] });
    const { cmp, el } = create('expense', 'e1', store);
    expect(cmp.categoryLocked).toBe(true);
    expect((el.querySelector('#edit-category') as HTMLInputElement).disabled).toBe(true);
    cmp.amount = 99;
    await cmp.save();
    expect(store.updateExpense).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ category: 'Remboursement Carte Crédit' }),
    );
  });

  it("refuse un montant invalide : le bouton est désactivé et le store n'est pas appelé", async () => {
    const store = makeStore({ expenses: [expense()] });
    const { fixture, cmp, el, done } = create('expense', 'e1', store);
    for (const v of [null, 0, -5]) {
      cmp.amount = v;
      await cmp.save();
    }
    expect(store.updateExpense).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    fixture.detectChanges();
    const submit = el.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("affiche l'erreur du store, garde la fenêtre ouverte et réactive le bouton", async () => {
    const store = makeStore({
      expenses: [expense()],
      updateExpense: vi.fn().mockRejectedValue(new Error('Le mois 2026-10 est clôturé')),
    });
    const { cmp, done, toastShow } = create('expense', 'e1', store);
    cmp.date = '2026-10-02';
    await cmp.save();
    expect(toastShow).toHaveBeenCalledWith('Le mois 2026-10 est clôturé');
    expect(done).not.toHaveBeenCalled();
    expect(cmp.saving()).toBe(false);
  });

  it('un vrai clic sur « Enregistrer » envoie le formulaire', async () => {
    const store = makeStore({ expenses: [expense()] });
    const { fixture, el, done } = create('expense', 'e1', store);
    await fixture.whenStable(); // ngModel s'enregistre de façon asynchrone
    const amount = el.querySelector('#edit-amount') as HTMLInputElement;
    amount.value = '77';
    amount.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(store.updateExpense).toHaveBeenCalledWith('e1', expect.objectContaining({ amount: 77 }));
    expect(done).toHaveBeenCalledTimes(1);
  });

  describe('mois clôturé', () => {
    it("explique pourquoi et n'offre ni formulaire ni suppression", () => {
      const store = makeStore({ expenses: [expense()], closed: ['2026-09'] });
      const { el } = create('expense', 'e1', store);
      expect(el.textContent).toContain('clôturé');
      expect(el.querySelector('form')).toBeNull();
      expect(buttonText(el).join(' ')).not.toMatch(/Supprimer|Enregistrer/);
    });
  });

  describe('versement réparti entre des provisions', () => {
    const split = () =>
      makeStore({
        expenses: [expense({ id: 'v1', category: 'Versement', amount: 500, versementToMemberId: SAM })],
        provisions: [{ id: 'p1', adjustments: [{ id: 'a1', versementExpenseId: 'v1', amount: 500, date: '2026-09-12' }] }],
      });

    it("n'offre ni modification ni suppression, seulement l'annulation de la répartition", () => {
      const { el } = create('expense', 'v1', split());
      expect(el.querySelector('form')).toBeNull();
      expect(buttonText(el)).toEqual(['Annuler la répartition']);
      expect(el.textContent).toContain('réparti');
    });

    it("l'annulation demande une confirmation, puis rend le versement modifiable", async () => {
      const store = split();
      const { fixture, cmp, el, toastShow } = create('expense', 'v1', store);
      await cmp.cancelSplit();
      expect(store.cancelVersementSplit).not.toHaveBeenCalled();
      expect(cmp.confirmCancelSplit()).toBe(true);

      await cmp.cancelSplit();
      expect(store.cancelVersementSplit).toHaveBeenCalledWith('v1');
      expect(toastShow).toHaveBeenCalledWith('Répartition annulée.');
      fixture.detectChanges();
      expect(el.querySelector('form')).not.toBeNull();
    });
  });

  describe('suppression', () => {
    it('demande une confirmation avant de toucher au store, puis supprime et ferme', async () => {
      const store = makeStore({ expenses: [expense()] });
      const { cmp, done, toastShow } = create('expense', 'e1', store);
      await cmp.remove();
      expect(store.removeExpense).not.toHaveBeenCalled();
      expect(cmp.confirmDelete()).toBe(true);
      await cmp.remove();
      expect(store.removeExpense).toHaveBeenCalledWith('e1');
      expect(toastShow).toHaveBeenCalledWith('Dépense supprimée.');
      expect(done).toHaveBeenCalledTimes(1);
    });

    it("si le store refuse, annule la confirmation et affiche l'erreur (l'ancienne liste l'ignorait)", async () => {
      const store = makeStore({
        expenses: [expense()],
        removeExpense: vi.fn().mockRejectedValue(new Error('Le mois 2026-09 est clôturé')),
      });
      const { cmp, done, toastShow } = create('expense', 'e1', store);
      await cmp.remove();
      await cmp.remove();
      expect(toastShow).toHaveBeenCalledWith('Le mois 2026-09 est clôturé');
      expect(cmp.confirmDelete()).toBe(false);
      expect(done).not.toHaveBeenCalled();
    });
  });

  it("si la dépense n'existe plus, le dit sans planter", () => {
    const { el } = create('expense', 'inconnu', makeStore());
    expect(el.textContent).toContain("n'existe plus");
    expect(el.querySelector('form')).toBeNull();
  });
});

describe('EditMovement — revenu', () => {
  const template = (o: Record<string, unknown> = {}) => ({ id: 't1', active: true, ...o });

  it('revenu ponctuel : enregistre montant, type, date et note (rognée)', async () => {
    const store = makeStore({ incomes: [income()] });
    const { cmp, done, toastShow } = create('income', 'i1', store);
    cmp.amount = 2100;
    cmp.type = 'Bonus';
    cmp.date = '2026-09-05';
    cmp.note = '  prime  ';
    await cmp.save();
    expect(store.updateIncome).toHaveBeenCalledWith('i1', {
      amount: 2100, type: 'Bonus', date: '2026-09-05', note: 'prime',
    });
    expect(toastShow).toHaveBeenCalledWith('Revenu modifié.');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('paie générée : seul le montant est envoyé, et les autres champs ne sont pas proposés', async () => {
    const store = makeStore({
      incomes: [income({ recurringSourceId: 't1', recurring: true })],
      recurringIncomes: [template({ active: false })],
    });
    const { cmp, el } = create('income', 'i1', store);
    expect(el.querySelector('#edit-type')).toBeNull();
    expect(el.querySelector('#edit-date')).toBeNull();
    cmp.amount = 2150;
    cmp.type = 'Bonus'; // ne doit pas partir
    cmp.date = '2026-10-01'; // ne doit pas partir
    await cmp.save();
    expect(store.updateIncome).toHaveBeenCalledWith('i1', { amount: 2150 });
  });

  it("un type inconnu (import, ancien réglage) reste proposé plutôt que d'être remplacé en silence", () => {
    const { cmp } = create('income', 'i1', makeStore({ incomes: [income({ type: 'Freelance' })] }));
    expect(cmp.incomeTypeOptions()[0]).toBe('Freelance');
  });

  it("affiche l'erreur du store et garde la fenêtre ouverte", async () => {
    const store = makeStore({
      incomes: [income()],
      updateIncome: vi.fn().mockRejectedValue(new Error('Le mois 2026-09 est clôturé')),
    });
    const { cmp, done, toastShow } = create('income', 'i1', store);
    await cmp.save();
    expect(toastShow).toHaveBeenCalledWith('Le mois 2026-09 est clôturé');
    expect(done).not.toHaveBeenCalled();
  });

  it('mois clôturé : lecture seule avec la raison', () => {
    const { el } = create('income', 'i1', makeStore({ incomes: [income()], closed: ['2026-09'] }));
    expect(el.textContent).toContain('clôturé');
    expect(el.querySelector('form')).toBeNull();
  });

  it('revenu ponctuel : suppression en deux temps', async () => {
    const store = makeStore({ incomes: [income()] });
    const { cmp, done, toastShow } = create('income', 'i1', store);
    await cmp.remove();
    expect(store.removeIncome).not.toHaveBeenCalled();
    await cmp.remove();
    expect(store.removeIncome).toHaveBeenCalledWith('i1');
    expect(toastShow).toHaveBeenCalledWith('Revenu supprimé.');
    expect(done).toHaveBeenCalledTimes(1);
  });

  describe("paie d'un revenu récurrent ACTIF", () => {
    const active = () =>
      makeStore({
        incomes: [income({ recurringSourceId: 't1', recurring: true })],
        recurringIncomes: [template()],
      });

    it("ne propose pas de supprimer (la paie serait recréée) mais d'arrêter le revenu récurrent", () => {
      const { cmp, el } = create('income', 'i1', active());
      expect(cmp.templateActive()).toBe(true);
      const buttons = buttonText(el).join(' | ');
      expect(buttons).toContain('Arrêter ce revenu récurrent');
      expect(buttons).not.toContain('Supprimer ce revenu');
      expect(el.textContent).toContain('recréée');
    });

    it("l'arrêt demande une confirmation, puis la suppression devient possible", async () => {
      const store = active();
      const { fixture, cmp, el, toastShow } = create('income', 'i1', store);
      await cmp.stopRecurring();
      expect(store.removeRecurringIncome).not.toHaveBeenCalled();
      expect(cmp.confirmStop()).toBe(true);

      await cmp.stopRecurring();
      expect(store.removeRecurringIncome).toHaveBeenCalledWith('t1');
      expect(toastShow).toHaveBeenCalledWith('Revenu récurrent arrêté.');

      fixture.detectChanges();
      expect(cmp.templateActive()).toBe(false);
      expect(buttonText(el).join(' | ')).toContain('Supprimer ce revenu');
    });

    it('un modèle déjà arrêté (inactif) ou disparu ne bloque plus la suppression', () => {
      for (const recurringIncomes of [[template({ active: false })], []]) {
        const store = makeStore({
          incomes: [income({ recurringSourceId: 't1', recurring: true })],
          recurringIncomes,
        });
        const { cmp } = create('income', 'i1', store);
        expect(cmp.templateActive()).toBe(false);
      }
    });

    it("si l'arrêt échoue, affiche l'erreur et annule la confirmation", async () => {
      const store = active();
      store.removeRecurringIncome = vi.fn().mockRejectedValue(new Error('Réseau'));
      const { cmp, toastShow } = create('income', 'i1', store);
      await cmp.stopRecurring();
      await cmp.stopRecurring();
      expect(toastShow).toHaveBeenCalledWith('Réseau');
      expect(cmp.confirmStop()).toBe(false);
    });
  });
});
