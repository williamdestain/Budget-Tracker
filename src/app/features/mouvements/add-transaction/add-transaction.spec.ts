import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import { AddTransaction } from './add-transaction';
import { ExpenseForm } from '../../expenses/expense-form/expense-form';
import { IncomeForm } from '../../incomes/income-form/income-form';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';

const ALEX = '3f9c1c1e-0000-4000-8000-000000000001';

function makeFakeStore(opts: { addExpense?: ReturnType<typeof vi.fn>; addIncome?: ReturnType<typeof vi.fn> } = {}) {
  return {
    activeOwner: signal(ALEX),
    current: () => '2026-09',
    myMemberId: () => ALEX,
    activeCategoryNames: signal(['Épicerie']),
    memberOptions: () => [{ id: ALEX, name: 'Alex' }],
    addExpense: opts.addExpense ?? vi.fn().mockResolvedValue({}),
    addIncome: opts.addIncome ?? vi.fn().mockResolvedValue(undefined),
    addRecurringIncome: vi.fn().mockResolvedValue({}),
  } as unknown as BudgetStore;
}

function create(store = makeFakeStore()) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: store },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(AddTransaction);
  fixture.detectChanges();
  const done = vi.fn();
  fixture.componentInstance.done.subscribe(done);
  return { fixture, done, store };
}

const chips = (root: HTMLElement) => Array.from(root.querySelectorAll('app-chip button')) as HTMLButtonElement[];

describe('AddTransaction', () => {
  it('propose une dépense par défaut', () => {
    const { fixture } = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-expense-form')).not.toBeNull();
    expect(el.querySelector('app-income-form')).toBeNull();
  });

  it('bascule vers le revenu puis revient à la dépense', () => {
    const { fixture } = create();
    const el = fixture.nativeElement as HTMLElement;
    chips(el)[1].click();
    fixture.detectChanges();
    expect(el.querySelector('app-income-form')).not.toBeNull();
    expect(el.querySelector('app-expense-form')).toBeNull();
    chips(el)[0].click();
    fixture.detectChanges();
    expect(el.querySelector('app-expense-form')).not.toBeNull();
  });

  it("expose le type choisi aux lecteurs d'écran (aria-pressed)", () => {
    const { fixture } = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(chips(el).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    chips(el)[1].click();
    fixture.detectChanges();
    expect(chips(el).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('signale done quand une dépense est enregistrée', async () => {
    const { fixture, done, store } = create();
    const form = fixture.debugElement.query(By.directive(ExpenseForm)).componentInstance as ExpenseForm;
    form.amount = 18.5;
    await form.submit();
    expect(store.addExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 18.5, memberId: ALEX }));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('signale done quand un revenu est enregistré', async () => {
    const { fixture, done, store } = create();
    chips(fixture.nativeElement)[1].click();
    fixture.detectChanges();
    const form = fixture.debugElement.query(By.directive(IncomeForm)).componentInstance as IncomeForm;
    form.amount = 2000;
    await form.submit();
    expect(store.addIncome).toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("ne signale pas done si l'enregistrement échoue : la fenêtre reste ouverte", async () => {
    const { fixture, done } = create(makeFakeStore({ addExpense: vi.fn().mockRejectedValue(new Error('Mois clôturé')) }));
    const form = fixture.debugElement.query(By.directive(ExpenseForm)).componentInstance as ExpenseForm;
    form.amount = 18.5;
    await form.submit();
    expect(done).not.toHaveBeenCalled();
  });

  it('un vrai clic sur « Ajouter » (saisie dans le champ, envoi du formulaire) enregistre et ferme', async () => {
    const { fixture, done, store } = create();
    // ngModel s'enregistre de façon asynchrone : sans cette attente, l'événement
    // `input` ci-dessous n'a encore aucun écouteur et la valeur est perdue.
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const amount = el.querySelector('#exp-amount') as HTMLInputElement;
    amount.value = '12.5';
    amount.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(store.addExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 12.5 }));
    expect(done).toHaveBeenCalledTimes(1);
  });
});
