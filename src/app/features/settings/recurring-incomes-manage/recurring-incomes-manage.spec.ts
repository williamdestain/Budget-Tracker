import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { RecurringIncomesManage } from './recurring-incomes-manage';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { RecurringIncome } from '../../../core/models/budget.models';

const ALEX = '3f9c1c1e-0000-4000-8000-000000000001';

const income = (o: Partial<RecurringIncome> & { id: string }): RecurringIncome => ({
  amount: 2500, type: 'Salaire', memberId: ALEX, note: '', interval: 'monthly', dayOfMonth: 1,
  secondDayOfMonth: null, startDate: '2026-01-01', active: true, ...o,
});

function create(opts: { incomes?: RecurringIncome[]; remove?: ReturnType<typeof vi.fn> } = {}) {
  const list = signal(opts.incomes ?? []);
  const store = {
    visibleRecurringIncomes: () => list(),
    memberName: (id: string) => (id === ALEX ? 'Alex' : id),
    removeRecurringIncome: opts.remove ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore & Record<string, any>;
  TestBed.resetTestingModule();
  const toastShow = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: store },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  const fixture = TestBed.createComponent(RecurringIncomesManage);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, store, toastShow };
}

describe('RecurringIncomesManage', () => {
  it('sans revenu récurrent : explique comment en créer un', () => {
    const { el } = create();
    expect(el.textContent).toContain('Aucun revenu récurrent');
    expect(el.querySelector('.recurring')).toBeNull();
  });

  it('liste chaque revenu : type, montant, fréquence et membre', () => {
    const { el } = create({ incomes: [income({ id: 'a' }), income({ id: 'b', type: 'Allocations', amount: 300 })] });
    const rows = Array.from(el.querySelectorAll('.recurring-row')).map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Alex');
    expect(rows[0]).toMatch(/2\s?500/);
    expect(rows[1]).toContain('300');
  });

  it("signale un modèle inactif", () => {
    const { el } = create({ incomes: [income({ id: 'a', active: false })] });
    expect(el.textContent).toContain('Inactif');
  });

  it("l'arrêt demande une confirmation avant de toucher au store, puis arrête et confirme", async () => {
    const { fixture, cmp, el, store, toastShow } = create({ incomes: [income({ id: 'a' })] });
    await cmp.stop(income({ id: 'a' }));
    fixture.detectChanges();
    expect(store.removeRecurringIncome).not.toHaveBeenCalled();
    expect(el.textContent).toContain("paies déjà reçues restent dans l'historique");
    await cmp.stop(income({ id: 'a' }));
    expect(store.removeRecurringIncome).toHaveBeenCalledWith('a');
    expect(toastShow).toHaveBeenCalledWith('Revenu récurrent arrêté.');
    expect(cmp.confirmId()).toBeNull();
  });

  it("la confirmation est par ligne : confirmer une AUTRE ligne n'arrête pas la première", async () => {
    const { cmp, store } = create({ incomes: [income({ id: 'a' }), income({ id: 'b' })] });
    await cmp.stop(income({ id: 'a' }));
    await cmp.stop(income({ id: 'b' })); // premier clic sur b : redemande
    expect(store.removeRecurringIncome).not.toHaveBeenCalled();
    expect(cmp.confirmId()).toBe('b');
  });

  it("si le store refuse, affiche l'erreur et annule la confirmation", async () => {
    const { cmp, toastShow } = create({
      incomes: [income({ id: 'a' })],
      remove: vi.fn().mockRejectedValue(new Error('Réseau')),
    });
    await cmp.stop(income({ id: 'a' }));
    await cmp.stop(income({ id: 'a' }));
    expect(toastShow).toHaveBeenCalledWith('Réseau');
    expect(cmp.confirmId()).toBeNull();
  });
});
