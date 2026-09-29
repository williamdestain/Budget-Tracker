import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ExpectedThisMonth } from './expected-this-month';
import { BudgetStore } from '../../../core/services/budget-store.service';

function makeFakeStore(opts: { expectedThisMonth?: unknown[]; confirmRecurringExpense?: ReturnType<typeof vi.fn> } = {}) {
  return {
    expectedThisMonth: () => opts.expectedThisMonth ?? [],
    colorFor: (c: string) => `color-${c}`,
    confirmRecurringExpense: opts.confirmRecurringExpense ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
}

function createFixture(store: BudgetStore) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: BudgetStore, useValue: store }] });
  const fixture = TestBed.createComponent(ExpectedThisMonth);
  fixture.detectChanges();
  return fixture;
}

describe('ExpectedThisMonth', () => {
  it('key() combine templateId et date suggérée pour distinguer deux occurrences du même gabarit', () => {
    const fixture = createFixture(makeFakeStore());
    expect(fixture.componentInstance.key('t1', '2026-09-05')).toBe('t1|2026-09-05');
    expect(fixture.componentInstance.key('t1', '2026-09-19')).not.toBe(
      fixture.componentInstance.key('t1', '2026-09-05'),
    );
  });

  it('amountFor()/dateFor()/ccFor() retombent sur les valeurs par défaut tant que rien n\'est édité', () => {
    const fixture = createFixture(makeFakeStore());
    expect(fixture.componentInstance.amountFor('k1', 42)).toBe(42);
    expect(fixture.componentInstance.dateFor('k1', '2026-09-05')).toBe('2026-09-05');
    expect(fixture.componentInstance.ccFor('k1')).toBe(false);
  });

  it('amountFor()/dateFor()/ccFor() reflètent une édition en cours', () => {
    const fixture = createFixture(makeFakeStore());
    fixture.componentInstance.amounts['k1'] = 55;
    fixture.componentInstance.dates['k1'] = '2026-09-10';
    fixture.componentInstance.ccs['k1'] = true;
    expect(fixture.componentInstance.amountFor('k1', 42)).toBe(55);
    expect(fixture.componentInstance.dateFor('k1', '2026-09-05')).toBe('2026-09-10');
    expect(fixture.componentInstance.ccFor('k1')).toBe(true);
  });

  it('confirm() ne fait rien si le montant (effectif) est <= 0 ou la date vide', async () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    await fixture.componentInstance.confirm('k1', 't1', 0, '2026-09-05');
    expect(store.confirmRecurringExpense).not.toHaveBeenCalled();

    await fixture.componentInstance.confirm('k1', 't1', 20, '');
    expect(store.confirmRecurringExpense).not.toHaveBeenCalled();
  });

  it('confirm() délègue au store avec les valeurs éditées, puis nettoie tout état local', async () => {
    const store = makeFakeStore();
    const fixture = createFixture(store);
    fixture.componentInstance.amounts['k1'] = 33;
    fixture.componentInstance.dates['k1'] = '2026-09-12';
    fixture.componentInstance.ccs['k1'] = true;

    await fixture.componentInstance.confirm('k1', 't1', 20, '2026-09-05');

    expect(store.confirmRecurringExpense).toHaveBeenCalledWith('t1', 33, '2026-09-12', true);
    expect(fixture.componentInstance.amounts['k1']).toBeUndefined();
    expect(fixture.componentInstance.dates['k1']).toBeUndefined();
    expect(fixture.componentInstance.ccs['k1']).toBeUndefined();
    expect(fixture.componentInstance.confirming().has('k1')).toBe(false);
  });

  it('confirm() nettoie aussi l\'état local si le store rejette (finally)', async () => {
    const store = makeFakeStore({ confirmRecurringExpense: vi.fn().mockRejectedValue(new Error('boom')) });
    const fixture = createFixture(store);
    fixture.componentInstance.amounts['k1'] = 33;

    await expect(fixture.componentInstance.confirm('k1', 't1', 20, '2026-09-05')).rejects.toThrow(
      'boom',
    );

    expect(fixture.componentInstance.amounts['k1']).toBeUndefined();
    expect(fixture.componentInstance.confirming().has('k1')).toBe(false);
  });

  it("n'affiche rien quand il n'y a aucune dépense attendue ce mois-ci", () => {
    const fixture = createFixture(makeFakeStore({ expectedThisMonth: [] }));
    expect((fixture.nativeElement as HTMLElement).querySelector('.expected-card')).toBeNull();
  });

  it('affiche une ligne par occurrence attendue ce mois-ci', () => {
    const fixture = createFixture(
      makeFakeStore({
        expectedThisMonth: [
          { template: { id: 't1', name: 'Netflix', category: 'Loisirs', amount: 18.99 }, suggestedDate: '2026-09-05' },
          { template: { id: 't1', name: 'Netflix', category: 'Loisirs', amount: 18.99 }, suggestedDate: '2026-09-19' },
        ],
      }),
    );
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.expected-row');
    expect(rows.length).toBe(2);
  });
});
