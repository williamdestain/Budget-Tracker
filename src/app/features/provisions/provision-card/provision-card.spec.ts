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
    memberId: 'moi',
    autoRecalibrate: true,
    allocationPercent: 0,
    rollingCount: 0,
    monthlyReminder: null,
    adjustments: [],
    ...overrides,
  };
}

function makeFakeStore(
  ym: string,
  expenses: Expense[],
  overrides: Partial<{
    payProvision: ReturnType<typeof vi.fn>;
    closeProvision: ReturnType<typeof vi.fn>;
    addProvisionAdjustment: ReturnType<typeof vi.fn>;
    removeProvisionAdjustment: ReturnType<typeof vi.fn>;
    removeProvision: ReturnType<typeof vi.fn>;
    updateProvision: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    current: () => ym,
    expenses: () => expenses,
    colorFor: () => '#4c7a66',
    payProvision: overrides.payProvision ?? vi.fn().mockResolvedValue(undefined),
    closeProvision: overrides.closeProvision ?? vi.fn().mockResolvedValue(0),
    addProvisionAdjustment: overrides.addProvisionAdjustment ?? vi.fn().mockResolvedValue(undefined),
    removeProvisionAdjustment: overrides.removeProvisionAdjustment ?? vi.fn(),
    removeProvision: overrides.removeProvision ?? vi.fn(),
    updateProvision: overrides.updateProvision ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
}

function createFixture(
  provision: Provision,
  ym: string,
  expenses: Expense[] = [],
  storeOverrides: Parameters<typeof makeFakeStore>[2] = {},
  toastShow = vi.fn(),
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: makeFakeStore(ym, expenses, storeOverrides) },
      { provide: ToastService, useValue: { show: toastShow } },
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
      { id: 'e1', amount: 905.49, category: 'Taxe fonciere/municipale', date: '2026-09-16', memberId: 'moi', cc: false },
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

describe('ProvisionCard — actions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('colorDot() délègue au store avec la catégorie de la provision', () => {
    const fixture = createFixture(makeProvision({ category: 'Loisirs' }), '2026-09');
    fixture.detectChanges();
    expect(fixture.componentInstance.colorDot()).toBe('#4c7a66');
  });

  it('barWidth() ne descend jamais sous 2 (visibilité de la barre à 0%)', () => {
    const p = makeProvision({ startYM: '2026-01', amount: 1000, adjustments: [] });
    const fixture = createFixture(p, '2026-09');
    fixture.detectChanges();
    expect(fixture.componentInstance.barWidth()).toBe(2);
  });

  it('togglePay() préremplit le montant visé et ferme le panneau d\'ajustement', () => {
    const p = makeProvision({ startYM: '2025-09', amount: 905.49, adjustments: [] });
    const fixture = createFixture(p, '2026-09');
    fixture.detectChanges();
    fixture.componentInstance.adjustOpen.set(true);

    fixture.componentInstance.togglePay();

    expect(fixture.componentInstance.payOpen()).toBe(true);
    expect(fixture.componentInstance.adjustOpen()).toBe(false);
    expect(fixture.componentInstance.payAmount).toBe(905.49);
  });

  it('togglePay() réinitialise "dernier paiement" à la fermeture', () => {
    const fixture = createFixture(makeProvision(), '2026-09');
    fixture.detectChanges();
    fixture.componentInstance.payOpen.set(true);
    fixture.componentInstance.payIsFinal = true;

    fixture.componentInstance.togglePay();

    expect(fixture.componentInstance.payIsFinal).toBe(false);
  });

  it('toggleAdjust() ferme le panneau de paiement', () => {
    const fixture = createFixture(makeProvision(), '2026-09');
    fixture.detectChanges();
    fixture.componentInstance.payOpen.set(true);

    fixture.componentInstance.toggleAdjust();

    expect(fixture.componentInstance.adjustOpen()).toBe(true);
    expect(fixture.componentInstance.payOpen()).toBe(false);
  });

  it("submitPay() ne fait rien si le montant est nul, absent, <= 0, ou la date vide", async () => {
    const payProvision = vi.fn();
    const fixture = createFixture(makeProvision(), '2026-09', [], { payProvision });
    fixture.detectChanges();
    fixture.componentInstance.payAmount = 0;
    fixture.componentInstance.payDate = '2026-09-01';
    await fixture.componentInstance.submitPay();
    expect(payProvision).not.toHaveBeenCalled();
  });

  it('submitPay() enregistre le paiement et réinitialise le formulaire (sans "dernier paiement")', async () => {
    const payProvision = vi.fn().mockResolvedValue(undefined);
    const fixture = createFixture(makeProvision({ id: 'p1' }), '2026-09', [], { payProvision });
    fixture.detectChanges();
    fixture.componentInstance.payOpen.set(true);
    fixture.componentInstance.payAmount = 100;
    fixture.componentInstance.payDate = '2026-09-10';
    fixture.componentInstance.payCc = true;

    await fixture.componentInstance.submitPay();

    expect(payProvision).toHaveBeenCalledWith('p1', 100, '2026-09-10', true);
    expect(fixture.componentInstance.payOpen()).toBe(false);
    expect(fixture.componentInstance.payAmount).toBeNull();
    expect(fixture.componentInstance.payCc).toBe(false);
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('submitPay() avec "dernier paiement" ferme aussi la provision et notifie le solde reversé', async () => {
    const closeProvision = vi.fn().mockResolvedValue(42);
    const toastShow = vi.fn();
    const fixture = createFixture(
      makeProvision({ id: 'p1', name: 'Voyage' }),
      '2026-09',
      [],
      { closeProvision },
      toastShow,
    );
    fixture.detectChanges();
    fixture.componentInstance.payAmount = 100;
    fixture.componentInstance.payDate = '2026-09-10';
    fixture.componentInstance.payIsFinal = true;

    await fixture.componentInstance.submitPay();

    expect(closeProvision).toHaveBeenCalledWith('p1');
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('terminée après ce paiement'));
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining(fmt(42)));
  });

  it('submitPay() avec "dernier paiement" : le paiement reste acquis même si la fermeture auto échoue', async () => {
    const closeProvision = vi.fn().mockRejectedValue(new Error('boom'));
    const toastShow = vi.fn();
    const fixture = createFixture(
      makeProvision({ id: 'p1', name: 'Voyage' }),
      '2026-09',
      [],
      { closeProvision },
      toastShow,
    );
    fixture.detectChanges();
    fixture.componentInstance.payAmount = 100;
    fixture.componentInstance.payDate = '2026-09-10';
    fixture.componentInstance.payIsFinal = true;

    await fixture.componentInstance.submitPay();

    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('Paiement enregistré'));
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it("submitAdjust() ne fait rien si le montant est invalide", async () => {
    const addProvisionAdjustment = vi.fn();
    const fixture = createFixture(makeProvision(), '2026-09', [], { addProvisionAdjustment });
    fixture.detectChanges();
    fixture.componentInstance.adjustAmount = 0;
    await fixture.componentInstance.submitAdjust();
    expect(addProvisionAdjustment).not.toHaveBeenCalled();
  });

  it('submitAdjust() ajoute un ajustement et referme le panneau', async () => {
    const addProvisionAdjustment = vi.fn().mockResolvedValue(undefined);
    const fixture = createFixture(makeProvision({ id: 'p1' }), '2026-09', [], { addProvisionAdjustment });
    fixture.detectChanges();
    fixture.componentInstance.adjustOpen.set(true);
    fixture.componentInstance.adjustAmount = 50;
    fixture.componentInstance.adjustDate = '2026-09-05';
    fixture.componentInstance.adjustNote = 'Bonus';

    await fixture.componentInstance.submitAdjust();

    expect(addProvisionAdjustment).toHaveBeenCalledWith('p1', 50, '2026-09-05', 'Bonus');
    expect(fixture.componentInstance.adjustOpen()).toBe(false);
    expect(fixture.componentInstance.adjustAmount).toBeNull();
  });

  it('removeAdjustment()/remove() délèguent au store avec le bon id', () => {
    const removeProvisionAdjustment = vi.fn();
    const removeProvision = vi.fn();
    const fixture = createFixture(makeProvision({ id: 'p1' }), '2026-09', [], {
      removeProvisionAdjustment,
      removeProvision,
    });
    fixture.detectChanges();

    fixture.componentInstance.removeAdjustment('a9');
    expect(removeProvisionAdjustment).toHaveBeenCalledWith('p1', 'a9');

    fixture.componentInstance.remove();
    expect(removeProvision).toHaveBeenCalledWith('p1');
  });

  it("close() ne fait rien si l'utilisateur annule la confirmation", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const closeProvision = vi.fn();
    const fixture = createFixture(makeProvision(), '2026-09', [], { closeProvision });
    fixture.detectChanges();
    await fixture.componentInstance.close();
    expect(closeProvision).not.toHaveBeenCalled();
  });

  it('close() reverse le solde et notifie le montant ajouté quand la cagnotte est positive', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const closeProvision = vi.fn().mockResolvedValue(75);
    const toastShow = vi.fn();
    const p = makeProvision({
      id: 'p1',
      name: 'Voyage',
      startYM: '2026-01',
      adjustments: [{ id: 'a1', amount: 100, date: '2026-01-01', note: '' }],
    });
    const fixture = createFixture(p, '2026-09', [], { closeProvision }, toastShow);
    fixture.detectChanges();

    await fixture.componentInstance.close();

    expect(closeProvision).toHaveBeenCalledWith('p1');
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining(fmt(75)));
  });

  it('close() sans rien à reverser (cagnotte à 0) affiche un message simple', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const closeProvision = vi.fn().mockResolvedValue(0);
    const toastShow = vi.fn();
    const p = makeProvision({ id: 'p1', name: 'Voyage', startYM: '2026-01', adjustments: [] });
    const fixture = createFixture(p, '2026-09', [], { closeProvision }, toastShow);
    fixture.detectChanges();

    await fixture.componentInstance.close();

    expect(toastShow).toHaveBeenCalledWith('"Voyage" terminée.');
  });

  it('startEditPercent()/cancelEditPercent() ouvrent et ferment l\'édition, saveEditPercent() enregistre', async () => {
    const updateProvision = vi.fn().mockResolvedValue(undefined);
    const fixture = createFixture(
      makeProvision({ id: 'p1', allocationPercent: 30 }),
      '2026-09',
      [],
      { updateProvision },
    );
    fixture.detectChanges();

    fixture.componentInstance.startEditPercent();
    expect(fixture.componentInstance.percentOpen()).toBe(true);
    expect(fixture.componentInstance.editPercent).toBe(30);

    fixture.componentInstance.cancelEditPercent();
    expect(fixture.componentInstance.percentOpen()).toBe(false);

    fixture.componentInstance.editPercent = 45;
    await fixture.componentInstance.saveEditPercent();
    expect(updateProvision).toHaveBeenCalledWith('p1', { allocationPercent: 45 });
  });

  it("startEditStartDate() pré-remplit startDate pour une provision en jours, startYM pour une en mois", () => {
    const days = createFixture(
      makeProvision({ intervalUnit: 'days', startDate: '2026-05-01', startYM: '' }),
      '2026-09',
    );
    days.detectChanges();
    days.componentInstance.startEditStartDate();
    expect(days.componentInstance.editStartDate).toBe('2026-05-01');

    const months = createFixture(makeProvision({ intervalUnit: 'months', startYM: '2026-03' }), '2026-09');
    months.detectChanges();
    months.componentInstance.startEditStartDate();
    expect(months.componentInstance.editStartYM).toBe('2026-03');
  });

  it('saveEditStartDate() met à jour startDate (jours) ou startYM (mois) selon le type', async () => {
    const updateProvisionDays = vi.fn().mockResolvedValue(undefined);
    const days = createFixture(makeProvision({ id: 'p1', intervalUnit: 'days' }), '2026-09', [], {
      updateProvision: updateProvisionDays,
    });
    days.detectChanges();
    days.componentInstance.editStartDate = '2026-06-01';
    await days.componentInstance.saveEditStartDate();
    expect(updateProvisionDays).toHaveBeenCalledWith('p1', { startDate: '2026-06-01' });

    const updateProvisionMonths = vi.fn().mockResolvedValue(undefined);
    const months = createFixture(makeProvision({ id: 'p2', intervalUnit: 'months' }), '2026-09', [], {
      updateProvision: updateProvisionMonths,
    });
    months.detectChanges();
    months.componentInstance.editStartYM = '2026-04';
    await months.componentInstance.saveEditStartDate();
    expect(updateProvisionMonths).toHaveBeenCalledWith('p2', { startYM: '2026-04' });
  });

  it('toggleAutoRecalibrate() inverse le réglage actuel', async () => {
    const updateProvision = vi.fn().mockResolvedValue(undefined);
    const fixture = createFixture(makeProvision({ id: 'p1', autoRecalibrate: true }), '2026-09', [], {
      updateProvision,
    });
    fixture.detectChanges();
    await fixture.componentInstance.toggleAutoRecalibrate();
    expect(updateProvision).toHaveBeenCalledWith('p1', { autoRecalibrate: false });
  });

  it("saveEditEveryN() ignore une valeur nulle, absente ou <= 0", async () => {
    const updateProvision = vi.fn();
    const fixture = createFixture(makeProvision(), '2026-09', [], { updateProvision });
    fixture.detectChanges();
    fixture.componentInstance.editEveryN = 0;
    await fixture.componentInstance.saveEditEveryN();
    expect(updateProvision).not.toHaveBeenCalled();
  });

  it('startEditEveryN()/saveEditEveryN() éditent le cycle de la provision', async () => {
    const updateProvision = vi.fn().mockResolvedValue(undefined);
    const fixture = createFixture(makeProvision({ id: 'p1', everyN: 12 }), '2026-09', [], { updateProvision });
    fixture.detectChanges();

    fixture.componentInstance.startEditEveryN();
    expect(fixture.componentInstance.editEveryN).toBe(12);

    fixture.componentInstance.editEveryN = 6;
    await fixture.componentInstance.saveEditEveryN();
    expect(updateProvision).toHaveBeenCalledWith('p1', { everyN: 6 });
    expect(fixture.componentInstance.everyNEditOpen()).toBe(false);
  });

  it('saveEditReminder() envoie null quand le rappel est vide/nul/absent, sinon la valeur', async () => {
    const updateProvision = vi.fn().mockResolvedValue(undefined);
    const fixture = createFixture(makeProvision({ id: 'p1' }), '2026-09', [], { updateProvision });
    fixture.detectChanges();

    fixture.componentInstance.editReminder = 0;
    await fixture.componentInstance.saveEditReminder();
    expect(updateProvision).toHaveBeenLastCalledWith('p1', { monthlyReminder: null });

    fixture.componentInstance.editReminder = 25;
    await fixture.componentInstance.saveEditReminder();
    expect(updateProvision).toHaveBeenLastCalledWith('p1', { monthlyReminder: 25 });
    expect(fixture.componentInstance.reminderEditOpen()).toBe(false);
  });

  it('startEditReminder() pré-remplit depuis la provision', () => {
    const fixture = createFixture(makeProvision({ monthlyReminder: 60 }), '2026-09');
    fixture.detectChanges();
    fixture.componentInstance.startEditReminder();
    expect(fixture.componentInstance.editReminder).toBe(60);
    expect(fixture.componentInstance.reminderEditOpen()).toBe(true);
  });
});
