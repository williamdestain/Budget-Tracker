import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProvisionCard } from './provision-card';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { Expense, Provision } from '../../../core/models/budget.models';
import { fmt } from '../../../core/utils/currency.utils';

// Bug rapporté par un utilisateur le 17-18 septembre 2026 : une provision
// annuelle échue ce mois-ci, dont la cagnotte accumulée (908,00 $) couvrait
// déjà largement la cible (905,49 $) mais dont AUCUN paiement n'avait
// encore été enregistré, affichait "Échéance ce mois — 905,49 $ restant à
// payer" en orange/avertissement — facilement lu comme "vous n'avez pas
// assez économisé", alors que la cagnotte suffisait. Corrigé dans
// provision-card.ts (stats()) : ce cas distingue maintenant "prêt à payer"
// (cagnotte suffisante) de "cagnotte insuffisante" (vrai manque).

function makeProvision(overrides: Partial<Provision> = {}): Provision {
  return {
    id: 'prov-1',
    name: 'Taxe fonciere/municipale',
    amount: 905.49,
    everyN: 12,
    intervalUnit: 'months',
    startYM: '2025-10',
    startDate: '',
    category: 'Taxe fonciere/municipale',
    owner: 'moi',
    autoRecalibrate: true,
    allocationPercent: 0,
    rollingCount: 0,
    monthlyReminder: null,
    adjustments: [],
    ...overrides,
  };
}

function makeFakeStore(ym: string, expenses: Expense[]) {
  return {
    current: () => ym,
    expenses: () => expenses,
    colorFor: () => '#4c7a66',
  } as unknown as BudgetStore;
}

function createFixture(provision: Provision, ym: string, expenses: Expense[] = []) {
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: makeFakeStore(ym, expenses) },
      { provide: ToastService, useValue: { show: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(ProvisionCard);
  fixture.componentRef.setInput('provision', provision);
  return fixture;
}

describe('ProvisionCard', () => {
  afterEach(() => vi.useRealTimers());

  it('se construit et se rend sans erreur', () => {
    const fixture = createFixture(makeProvision(), '2026-09');
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it(
    'échéance ce mois, cagnotte DÉJÀ suffisante (908 $ pour 905,49 $ visés), rien payé ' +
      'encore : affiche "prêt à payer", pas un avertissement de manque',
    () => {
      const p = makeProvision({
        startYM: '2025-09', // échue en 2026-09 (12 mois plus tard)
        adjustments: [{ id: 'a1', amount: 908.0, date: '2025-10-15', note: '' }],
      });
      const fixture = createFixture(p, '2026-09', []);
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(text).toContain('prêt à payer');
      expect(text).toContain(fmt(905.49));
      expect(text).not.toContain('restant à payer');
      expect(text).not.toMatch(/manque/i);
    },
  );

  it('échéance ce mois et cagnotte VRAIMENT insuffisante : garde un avertissement clair', () => {
    const p = makeProvision({
      startYM: '2025-09',
      adjustments: [{ id: 'a1', amount: 400, date: '2025-10-15', note: '' }],
    });
    const fixture = createFixture(p, '2026-09', []);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('cagnotte insuffisante');
    expect(text).toContain(fmt(505.49)); // 905.49 - 400 manquants
  });

  it('échéance ce mois et déjà payée intégralement : "Échéance couverte"', () => {
    const p = makeProvision({
      startYM: '2025-09',
      adjustments: [{ id: 'a1', amount: 908.0, date: '2025-10-15', note: '' }],
    });
    const expenses: Expense[] = [
      { id: 'e1', amount: 905.49, category: 'Taxe fonciere/municipale', date: '2026-09-16', owner: 'moi', cc: false },
    ];
    const fixture = createFixture(p, '2026-09', expenses);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Échéance couverte');
  });

  it('pas encore échue, cagnotte déjà suffisante : "Prêt ✓"', () => {
    const p = makeProvision({
      startYM: '2026-01', // pas encore échue en 2026-09
      adjustments: [{ id: 'a1', amount: 908.0, date: '2026-01-15', note: '' }],
    });
    const fixture = createFixture(p, '2026-09', []);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Prêt');
    expect(text).toContain('objectif atteint');
  });

  it('pas encore échue, cagnotte insuffisante : "En accumulation — manque"', () => {
    const p = makeProvision({
      startYM: '2026-01',
      adjustments: [{ id: 'a1', amount: 200, date: '2026-01-15', note: '' }],
    });
    const fixture = createFixture(p, '2026-09', []);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('En accumulation');
    expect(text).toMatch(/manque/i);
  });
});
