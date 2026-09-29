import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { IncomeList } from './income-list';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';

function makeFakeStore(opts: {
  visibleIncomes?: unknown[];
  visibleRecurringIncomes?: unknown[];
  updateIncome?: ReturnType<typeof vi.fn>;
  removeIncome?: ReturnType<typeof vi.fn>;
  removeRecurringIncome?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    visibleIncomes: () => opts.visibleIncomes ?? [],
    visibleRecurringIncomes: () => opts.visibleRecurringIncomes ?? [],
    memberName: (owner: string) => (owner === 'moi' ? 'Moi' : 'Madame'),
    updateIncome: opts.updateIncome ?? vi.fn().mockResolvedValue(undefined),
    removeIncome: opts.removeIncome ?? vi.fn().mockResolvedValue(undefined),
    removeRecurringIncome: opts.removeRecurringIncome ?? vi.fn().mockResolvedValue(undefined),
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
  const fixture = TestBed.createComponent(IncomeList);
  fixture.detectChanges();
  return { fixture, toastShow };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IncomeList', () => {
  it('typeLabel()/intervalLabel() retombent sur la clé brute si aucun libellé connu', () => {
    const { fixture } = createFixture(makeFakeStore());
    expect(fixture.componentInstance.typeLabel('Salaire')).toContain('Salaire');
    expect(fixture.componentInstance.typeLabel('TypeInconnu')).toBe('TypeInconnu');
    expect(fixture.componentInstance.intervalLabel('monthly')).toBe('Chaque mois');
    expect(fixture.componentInstance.intervalLabel('inconnu')).toBe('inconnu');
  });

  it('ownerBadge() délègue au store', () => {
    const { fixture } = createFixture(makeFakeStore());
    expect(fixture.componentInstance.ownerBadge('madame')).toBe('Madame');
  });

  it('startEdit() puis cancelEdit() gèrent le montant en édition', () => {
    const { fixture } = createFixture(makeFakeStore());
    fixture.componentInstance.startEdit('i1', 42);
    expect(fixture.componentInstance.editingId()).toBe('i1');
    expect(fixture.componentInstance.editAmount).toBe(42);

    fixture.componentInstance.cancelEdit();
    expect(fixture.componentInstance.editingId()).toBeNull();
    expect(fixture.componentInstance.editAmount).toBeNull();
  });

  it('saveEdit() ne fait rien si le montant édité est nul, absent ou <= 0', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.editAmount = 0;
    await fixture.componentInstance.saveEdit('i1');
    expect(store.updateIncome).not.toHaveBeenCalled();
  });

  it('saveEdit() met à jour le montant et referme l\'édition', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.editingId.set('i1');
    fixture.componentInstance.editAmount = 88;

    await fixture.componentInstance.saveEdit('i1');

    expect(store.updateIncome).toHaveBeenCalledWith('i1', { amount: 88 });
    expect(fixture.componentInstance.editingId()).toBeNull();
  });

  it("saveEdit() affiche une erreur via ToastService si la mise à jour échoue", async () => {
    const store = makeFakeStore({
      updateIncome: vi.fn().mockRejectedValue(new Error('Mois clôturé')),
    });
    const { fixture, toastShow } = createFixture(store);
    fixture.componentInstance.editAmount = 88;

    await fixture.componentInstance.saveEdit('i1');

    expect(toastShow).toHaveBeenCalledWith('Mois clôturé');
  });

  it('remove() délègue au store et notifie en cas d\'échec', async () => {
    const okStore = makeFakeStore();
    await createFixture(okStore).fixture.componentInstance.remove('i1');
    expect(okStore.removeIncome).toHaveBeenCalledWith('i1');

    const failingStore = makeFakeStore({ removeIncome: vi.fn().mockRejectedValue(new Error('Oups')) });
    const { fixture, toastShow } = createFixture(failingStore);
    await fixture.componentInstance.remove('i1');
    expect(toastShow).toHaveBeenCalledWith('Oups');
  });

  it("stopRecurring() ne fait rien si l'utilisateur annule la confirmation", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    await fixture.componentInstance.stopRecurring('r1', 'Salaire');
    expect(store.removeRecurringIncome).not.toHaveBeenCalled();
  });

  it('stopRecurring() délègue au store si confirmé', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    await fixture.componentInstance.stopRecurring('r1', 'Salaire');
    expect(store.removeRecurringIncome).toHaveBeenCalledWith('r1');
  });

  it('affiche le message vide quand il n\'y a aucun revenu ce mois', () => {
    const { fixture } = createFixture(makeFakeStore({ visibleIncomes: [] }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Aucun revenu ce mois.');
  });
});
