import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { describe, it, expect, vi } from 'vitest';
import { Mouvements } from './mouvements';
import { BudgetStore } from '../../core/services/budget-store.service';
import { ToastService } from '../../core/services/toast.service';
import { EditMovement } from './edit-movement/edit-movement';

function makeFakeStore() {
  return {
    activeOwner: () => 'moi',
    current: () => '2026-08',
    visibleExpenses: () => [
      {
        id: 'exp-1',
        amount: 120,
        category: 'Courses',
        memberId: 'moi',
        date: '2026-08-12',
      },
      {
        id: 'exp-2',
        amount: 40,
        category: 'Transport',
        memberId: 'madame',
        date: '2026-08-05',
      },
    ],
    visibleIncomes: () => [
      {
        id: 'inc-1',
        amount: 3200,
        type: 'Salaire',
        memberId: 'moi',
        date: '2026-08-01',
      },
      {
        id: 'inc-2',
        amount: 700,
        type: 'Freelance',
        memberId: 'madame',
        date: '2026-08-08',
      },
    ],
    rolloverFor: () => 0,
    expenses: () => [
      {
        id: 'versement-1',
        amount: 500,
        category: 'Versement',
        memberId: 'madame',
        date: '2026-08-15',
        versementToMemberId: 'moi',
      },
    ],
    provisions: () => [],
    visibleProvisions: () => [],
    // Reflète volontairement les mêmes totaux que l'ancienne somme brute
    // (4400/160/4240) pour les tests existants : ce qui compte ici, c'est
    // que summary() lise bien budgetSummary() et pas entries().
    budgetSummary: () => ({ spent: 160, budget: 4400, soldeNet: 4240, rollover: 0, versementsIn: 0 }),
    memberOptions: () => [
      { id: 'moi', name: 'Moi', color: '#4a6fa1' },
      { id: 'madame', name: 'Madame', color: '#a15385' },
    ],
    colorFor: (name: string) => (name === 'Courses' ? '#22c55e' : '#8b5cf6'),
    memberName: (id: string) => (id === 'moi' ? 'Moi' : 'Madame'),
  } as unknown as BudgetStore;
}

describe('Mouvements', () => {
  it('calcule le résumé du mois et liste les mouvements visibles', () => {
    const component = new Mouvements(makeFakeStore());

    expect(component.summary().incomes).toBe(4400);
    expect(component.summary().expenses).toBe(160);
    expect(component.summary().net).toBe(4240);
    expect(component.entries().some((entry) => entry.category === 'Versement' && entry.type === 'income')).toBe(true);
    expect(component.entries()).toHaveLength(5);
  });

  it('filtre uniquement les dépenses quand le filtre est activé', () => {
    const component = new Mouvements(makeFakeStore());
    component.setFilter('expense');

    expect(component.entries().every((entry) => entry.type === 'expense')).toBe(true);
    expect(component.entries()).toHaveLength(2);
  });

  it('recherche par mot-clé dans la catégorie ou le membre', () => {
    const component = new Mouvements(makeFakeStore());
    component.search.set('transport');

    expect(component.entries()).toHaveLength(1);
    expect(component.entries()[0].category).toBe('Transport');

    component.search.set('madame');
    expect(component.entries().some((entry) => entry.memberId === 'madame')).toBe(true);
  });

  it('affiche le report du mois précédent comme entrée de revenu pour le profil actif', () => {
    const store = makeFakeStore();
    store.rolloverFor = () => 250;
    (store as any).budgetSummary = () => ({ spent: 160, budget: 4650, soldeNet: 4490, rollover: 250, versementsIn: 0 });

    const component = new Mouvements(store);

    expect(component.entries().some((entry) => entry.category === 'Report' && entry.type === 'income')).toBe(true);
    expect(component.summary().incomes).toBe(4650);
  });

  it("n'additionne jamais les lignes affichées : summary() vient de budgetSummary(), pas de entries()", () => {
    const store = makeFakeStore();
    // Des totaux volontairement très différents de ce que entries() donnerait
    // en les ré-additionnant (160/4400) — pour prouver que summary() ne
    // recalcule rien lui-même à partir de la liste affichée.
    (store as any).budgetSummary = () => ({ spent: 999, budget: 111, soldeNet: -888, rollover: 0, versementsIn: 0 });

    const component = new Mouvements(store);

    expect(component.summary().expenses).toBe(999);
    expect(component.summary().incomes).toBe(111);
    expect(component.summary().net).toBe(-888);
  });

  it('affiche une contribution à une provision comme un mouvement de type dépense', () => {
    const store = makeFakeStore();
    (store as any).visibleProvisions = () => [
      {
        id: 'prov-reee',
        name: 'REEE',
        category: 'REEE',
        memberId: 'moi',
        adjustments: [
          { id: 'adj-1', amount: 200, date: '2026-08-10', note: '' },
          { id: 'adj-2', amount: -50, date: '2026-08-11', note: '' }, // ignorée (montant négatif)
        ],
      },
    ] as ReturnType<BudgetStore['visibleProvisions']>;

    const component = new Mouvements(store);
    const contribution = component.entries().find((entry) => entry.id === 'provision-prov-reee-adj-1');

    expect(contribution).toBeTruthy();
    expect(contribution?.type).toBe('expense');
    expect(contribution?.amount).toBe(200);
    expect(contribution?.details).toBe('Contribution → REEE');
    expect(component.entries().some((entry) => entry.id === 'provision-prov-reee-adj-2')).toBe(false);
  });

  it("n'affiche pas en double une contribution déjà issue d'un versement réparti", () => {
    const store = makeFakeStore();
    (store as any).visibleProvisions = () => [
      {
        id: 'prov-reee',
        name: 'REEE',
        category: 'REEE',
        memberId: 'moi',
        adjustments: [
          { id: 'adj-1', amount: 450, date: '2026-08-15', note: '', versementExpenseId: 'versement-1' },
        ],
      },
    ] as ReturnType<BudgetStore['visibleProvisions']>;

    const component = new Mouvements(store);

    expect(component.entries().some((entry) => entry.id === 'provision-prov-reee-adj-1')).toBe(false);
  });

  describe('modification depuis la liste', () => {
    // Le faux store de base, complété de ce que la fenêtre « Modifier » lit.
    function richStore() {
      const base = makeFakeStore() as unknown as Record<string, unknown>;
      return {
        ...base,
        expenses: signal([
          { id: 'exp-1', amount: 120, category: 'Courses', memberId: 'moi', date: '2026-08-12', cc: false, versementToMemberId: null },
          { id: 'exp-2', amount: 40, category: 'Transport', memberId: 'madame', date: '2026-08-05', cc: false, versementToMemberId: null },
          { id: 'versement-1', amount: 500, category: 'Versement', memberId: 'madame', date: '2026-08-15', cc: false, versementToMemberId: 'moi' },
        ]),
        incomes: signal([
          { id: 'inc-1', amount: 3200, type: 'Salaire', memberId: 'moi', date: '2026-08-01', note: '', recurringSourceId: null },
          { id: 'inc-2', amount: 700, type: 'Freelance', memberId: 'madame', date: '2026-08-08', note: '', recurringSourceId: null },
        ]),
        provisions: signal([]),
        recurringIncomes: signal([]),
        isMonthClosed: () => false,
        activeCategoryNames: () => ['Courses', 'Transport', 'Versement'],
        updateExpense: vi.fn().mockResolvedValue(undefined),
        removeExpense: vi.fn().mockResolvedValue(undefined),
        updateIncome: vi.fn().mockResolvedValue(undefined),
        removeIncome: vi.fn().mockResolvedValue(undefined),
      } as unknown as BudgetStore & Record<string, any>;
    }

    function render(store = richStore()) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: BudgetStore, useValue: store },
          { provide: ToastService, useValue: { show: vi.fn() } },
        ],
      });
      const fixture = TestBed.createComponent(Mouvements);
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement, store };
    }

    const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('.movement-row')) as HTMLElement[];
    const rowOf = (el: HTMLElement, category: string, kind: 'expense' | 'income') =>
      rows(el).find(
        (r) => r.textContent?.includes(category) && r.classList.contains(`movement-row--${kind}`),
      ) as HTMLElement;

    it('les lignes issues de vraies dépenses/revenus portent leur source ; les lignes calculées non', () => {
      const entries = new Mouvements(richStore()).entries();
      const byId = (id: string) => entries.find((e) => e.id === id)!;
      expect(byId('expense-exp-1')).toMatchObject({ source: 'expense', sourceId: 'exp-1' });
      expect(byId('income-inc-1')).toMatchObject({ source: 'income', sourceId: 'inc-1' });
      // Versement reçu : ligne calculée côté destinataire, elle appartient à l'émetteur.
      expect(byId('transfer-income-versement-1')).toMatchObject({ source: null, sourceId: null });
    });

    it('seules les lignes modifiables sont des boutons accessibles ; la ligne calculée ne l\'est pas', () => {
      const { el } = render();
      const clickable = rows(el).filter((r) => r.getAttribute('role') === 'button');
      expect(clickable.length).toBe(rows(el).length - 1);
      const derived = rows(el).find((r) => r.textContent?.includes('Versement'))!;
      expect(derived.getAttribute('role')).toBeNull();
      expect(derived.getAttribute('tabindex')).toBeNull();
      const first = clickable[0];
      expect(first.getAttribute('tabindex')).toBe('0');
      expect(first.getAttribute('aria-label')).toMatch(/^Modifier : /);
    });

    it('cliquer une dépense ouvre « Modifier la dépense » avec ses valeurs', async () => {
      const { fixture, el } = render();
      rowOf(el, 'Courses', 'expense').click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(el.querySelector('app-modal [aria-label="Modifier la dépense"]')).not.toBeNull();
      expect((el.querySelector('#edit-amount') as HTMLInputElement).value).toBe('120');
    });

    it('cliquer un revenu ouvre « Modifier le revenu »', () => {
      const { fixture, el } = render();
      rowOf(el, 'Salaire', 'income').click();
      fixture.detectChanges();
      expect(el.querySelector('app-modal [aria-label="Modifier le revenu"]')).not.toBeNull();
    });

    it('cliquer une ligne calculée ne fait rien', () => {
      const { fixture, el } = render();
      rows(el).find((r) => r.textContent?.includes('Versement'))!.click();
      fixture.detectChanges();
      expect(el.querySelector('app-modal')).toBeNull();
    });

    it("Entrée et Espace ouvrent la ligne, et Espace ne fait pas défiler la page", () => {
      const { fixture, el } = render();
      const row = rowOf(el, 'Courses', 'expense');
      const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true, bubbles: true });
      row.dispatchEvent(space);
      fixture.detectChanges();
      expect(space.defaultPrevented).toBe(true);
      expect(el.querySelector('app-modal')).not.toBeNull();

      fixture.componentInstance.closeEdit();
      fixture.detectChanges();
      expect(el.querySelector('app-modal')).toBeNull();

      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
      fixture.detectChanges();
      expect(el.querySelector('app-modal')).not.toBeNull();
    });

    it("n'ouvre aucune fenêtre tant qu'on n'a pas cliqué", () => {
      const { el } = render();
      expect(el.querySelector('app-modal')).toBeNull();
    });

    it('la fenêtre se ferme après une suppression réussie', async () => {
      const { fixture, el, store } = render();
      rowOf(el, 'Courses', 'expense').click();
      fixture.detectChanges();
      const edit = fixture.debugElement.query(By.directive(EditMovement)).componentInstance as EditMovement;
      await edit.remove();
      await edit.remove();
      fixture.detectChanges();
      expect(store.removeExpense).toHaveBeenCalledWith('exp-1');
      expect(el.querySelector('app-modal')).toBeNull();
    });

    it('la fenêtre se ferme avec Échap et avec la croix', () => {
      const { fixture, el } = render();
      rowOf(el, 'Courses', 'expense').click();
      fixture.detectChanges();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(el.querySelector('app-modal')).toBeNull();

      rowOf(el, 'Courses', 'expense').click();
      fixture.detectChanges();
      (el.querySelector('.modal-close') as HTMLElement).click();
      fixture.detectChanges();
      expect(el.querySelector('app-modal')).toBeNull();
    });
  });
});
