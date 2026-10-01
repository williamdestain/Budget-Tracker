import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { IncomeForm } from './income-form';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { INCOME_TYPE_LABELS } from '../../../core/utils/income.utils';
import { sortedAlpha } from '../../../core/utils/categories';

function makeFakeStore(opts: {
  activeOwner?: WritableSignal<'moi' | 'madame' | 'global'>;
  memberOptions?: { id: string; name: string }[];
  myMemberId?: string | null;
  addIncome?: ReturnType<typeof vi.fn>;
  addRecurringIncome?: ReturnType<typeof vi.fn>;
  current?: string;
} = {}) {
  return {
    activeOwner: opts.activeOwner ?? signal<'moi' | 'madame' | 'global'>('moi'),
    current: () => opts.current ?? '2026-09',
    memberOptions: () => opts.memberOptions ?? [{ id: 'moi', name: 'Moi' }, { id: 'madame', name: 'Madame' }],
    myMemberId: () => opts.myMemberId ?? null,
    addIncome: opts.addIncome ?? vi.fn().mockResolvedValue(undefined),
    addRecurringIncome: opts.addRecurringIncome ?? vi.fn().mockResolvedValue({}),
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
  const fixture = TestBed.createComponent(IncomeForm);
  fixture.detectChanges();
  return { fixture, toastShow };
}

describe('IncomeForm', () => {
  it('présente les types de revenu triés alphabétiquement (locale FR), sans "once" dans les intervalles', () => {
    const { fixture } = createFixture(makeFakeStore());
    expect(fixture.componentInstance.typeOptions).toEqual(
      sortedAlpha(Object.keys(INCOME_TYPE_LABELS)),
    );
    expect(fixture.componentInstance.intervalOptions.map(([key]) => key)).not.toContain('once');
  });

  it("aligne le profil du formulaire sur l'onglet actif, sauf en vue Global", () => {
    const { fixture } = createFixture(makeFakeStore({ activeOwner: signal('madame') }));
    expect(fixture.componentInstance.owner).toBe('madame');

    const { fixture: globalFixture } = createFixture(makeFakeStore({ activeOwner: signal('global') }));
    expect(globalFixture.componentInstance.owner).toBe('moi');
  });

  it("foyer à identifiants UUID, vue Global : membre connecté, jamais 'moi'", () => {
    const ALEX = '3f9c1c1e-0000-4000-8000-000000000001';
    const SAM = '3f9c1c1e-0000-4000-8000-000000000002';
    const members = [{ id: ALEX, name: 'Alex' }, { id: SAM, name: 'Sam' }];
    const { fixture } = createFixture(
      makeFakeStore({ activeOwner: signal('global'), memberOptions: members, myMemberId: SAM }),
    );
    expect(fixture.componentInstance.owner).toBe(SAM);

    const { fixture: sansConnu } = createFixture(
      makeFakeStore({ activeOwner: signal('global'), memberOptions: members }),
    );
    expect(sansConnu.componentInstance.owner).toBe(ALEX);
  });

  it('onIntervalChange() propose un 2e jour de paie (+15j, plafonné à 28) pour le semimonthly', () => {
    const { fixture } = createFixture(makeFakeStore());
    fixture.componentInstance.date = '2026-09-10';
    fixture.componentInstance.recurringInterval = 'semimonthly';
    fixture.componentInstance.secondDayOfMonth = null;

    fixture.componentInstance.onIntervalChange();

    expect(fixture.componentInstance.secondDayOfMonth).toBe(25);
  });

  it('onIntervalChange() plafonne le 2e jour de paie à 28', () => {
    const { fixture } = createFixture(makeFakeStore());
    fixture.componentInstance.date = '2026-09-20';
    fixture.componentInstance.recurringInterval = 'semimonthly';
    fixture.componentInstance.secondDayOfMonth = null;

    fixture.componentInstance.onIntervalChange();

    expect(fixture.componentInstance.secondDayOfMonth).toBe(28);
  });

  it("onIntervalChange() ne touche pas un 2e jour de paie déjà choisi", () => {
    const { fixture } = createFixture(makeFakeStore());
    fixture.componentInstance.date = '2026-09-10';
    fixture.componentInstance.recurringInterval = 'semimonthly';
    fixture.componentInstance.secondDayOfMonth = 3;

    fixture.componentInstance.onIntervalChange();

    expect(fixture.componentInstance.secondDayOfMonth).toBe(3);
  });

  it("ne soumet rien si le montant est nul, absent, <= 0, ou si la date est vide", async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.amount = -5;
    fixture.componentInstance.date = '2026-09-01';
    await fixture.componentInstance.submit();
    expect(store.addIncome).not.toHaveBeenCalled();

    fixture.componentInstance.amount = 500;
    fixture.componentInstance.date = '';
    await fixture.componentInstance.submit();
    expect(store.addIncome).not.toHaveBeenCalled();
  });

  it('soumet un revenu ponctuel via store.addIncome() et réinitialise montant / note / recurring', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.amount = 3000;
    fixture.componentInstance.type = 'Salaire';
    fixture.componentInstance.date = '2026-09-15';
    fixture.componentInstance.note = 'Paie du 15';

    await fixture.componentInstance.submit();

    expect(store.addIncome).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 3000,
        type: 'Salaire',
        date: '2026-09-15',
        note: 'Paie du 15',
        recurring: false,
        recurringInterval: 'once',
        recurringStartMonth: '2026-09',
      }),
    );
    expect(fixture.componentInstance.amount).toBeNull();
    expect(fixture.componentInstance.note).toBe('');
  });

  it('soumet un revenu récurrent via store.addRecurringIncome() avec le jour du mois dérivé de la date, et notifie l\'utilisateur', async () => {
    const store = makeFakeStore();
    const { fixture, toastShow } = createFixture(store);
    fixture.componentInstance.amount = 1500;
    fixture.componentInstance.type = 'Salaire';
    fixture.componentInstance.date = '2026-09-15';
    fixture.componentInstance.recurring = true;
    fixture.componentInstance.recurringInterval = 'monthly';

    await fixture.componentInstance.submit();

    expect(store.addRecurringIncome).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1500,
        dayOfMonth: 15,
        interval: 'monthly',
        secondDayOfMonth: null,
        startDate: '2026-09-15',
        active: true,
      }),
    );
    expect(store.addIncome).not.toHaveBeenCalled();
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('récurrent créé'));
    expect(fixture.componentInstance.recurring).toBe(false);
  });

  it('transmet secondDayOfMonth seulement pour un intervalle semimonthly', async () => {
    const store = makeFakeStore();
    const { fixture } = createFixture(store);
    fixture.componentInstance.amount = 800;
    fixture.componentInstance.date = '2026-09-01';
    fixture.componentInstance.recurring = true;
    fixture.componentInstance.recurringInterval = 'semimonthly';
    fixture.componentInstance.secondDayOfMonth = 16;

    await fixture.componentInstance.submit();

    expect(store.addRecurringIncome).toHaveBeenCalledWith(
      expect.objectContaining({ interval: 'semimonthly', secondDayOfMonth: 16 }),
    );
  });

  it("affiche un message d'erreur via ToastService si l'ajout échoue", async () => {
    const store = makeFakeStore({ addIncome: vi.fn().mockRejectedValue(new Error('Mois clôturé')) });
    const { fixture, toastShow } = createFixture(store);
    fixture.componentInstance.amount = 100;
    fixture.componentInstance.date = '2026-09-15';

    await fixture.componentInstance.submit();

    expect(toastShow).toHaveBeenCalledWith('Mois clôturé');
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  describe('fenêtre « Ajouter » : fermeture et confirmation', () => {
    it('revenu ponctuel : émet saved et confirme', async () => {
      const { fixture, toastShow } = createFixture(makeFakeStore());
      const saved = vi.fn();
      fixture.componentInstance.saved.subscribe(saved);
      fixture.componentInstance.amount = 1200;
      await fixture.componentInstance.submit();
      expect(saved).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledWith('Revenu ajouté.');
    });

    it('revenu récurrent : émet saved, avec son propre message (pas de double confirmation)', async () => {
      const { fixture, toastShow } = createFixture(makeFakeStore());
      const saved = vi.fn();
      fixture.componentInstance.saved.subscribe(saved);
      fixture.componentInstance.amount = 1200;
      fixture.componentInstance.recurring = true;
      await fixture.componentInstance.submit();
      expect(saved).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(toastShow).not.toHaveBeenCalledWith('Revenu ajouté.');
    });

    it("n'émet pas saved si l'enregistrement échoue, et garde la saisie", async () => {
      const store = makeFakeStore({ addIncome: vi.fn().mockRejectedValue(new Error('Mois clôturé')) });
      const { fixture, toastShow } = createFixture(store);
      const saved = vi.fn();
      fixture.componentInstance.saved.subscribe(saved);
      fixture.componentInstance.amount = 1200;
      await fixture.componentInstance.submit();
      expect(saved).not.toHaveBeenCalled();
      expect(toastShow).toHaveBeenCalledWith('Mois clôturé');
      expect(fixture.componentInstance.amount).toBe(1200);
    });

    it('ne se présente plus comme une carte avec son propre titre', () => {
      const { fixture } = createFixture(makeFakeStore());
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('form.card')).toBeNull();
      expect(el.querySelector('h3')).toBeNull();
    });
  });
});
