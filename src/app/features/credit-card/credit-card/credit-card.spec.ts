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
function makeFakeStore(balance: number) {
  return {
    activeOwner: () => 'moi' as const,
    current: () => '2026-08',
    creditCardBalance: () => balance,
    visibleExpenses: () => [],
    colorFor: () => '#4c7a66',
    creditCardPayments: () => [],
  } as unknown as BudgetStore;
}

function createFixture(balance = 120.5) {
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: makeFakeStore(balance) },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  return TestBed.createComponent(CreditCard);
}

describe('CreditCard', () => {
  it('se construit et se rend sans erreur', () => {
    const fixture = createFixture();
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('affiche le solde dû formaté quand positif (une dette)', () => {
    const fixture = createFixture(120.5);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(fmt(120.5));
    expect(text).toContain('Tu dois actuellement');
  });

  it('affiche "Crédit disponible" quand le solde est négatif', () => {
    const fixture = createFixture(-30);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Crédit disponible');
    expect(text).toContain(fmt(30));
  });
});
