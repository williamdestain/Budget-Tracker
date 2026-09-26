import { describe, it, expect } from 'vitest';
import { Mouvements } from './mouvements';
import { BudgetStore } from '../../core/services/budget-store.service';

function makeFakeStore() {
  return {
    activeOwner: () => 'moi',
    current: () => '2026-08',
    visibleExpenses: () => [
      {
        id: 'exp-1',
        amount: 120,
        category: 'Courses',
        owner: 'moi',
        date: '2026-08-12',
      },
      {
        id: 'exp-2',
        amount: 40,
        category: 'Transport',
        owner: 'madame',
        date: '2026-08-05',
      },
    ],
    visibleIncomes: () => [
      {
        id: 'inc-1',
        amount: 3200,
        type: 'Salaire',
        owner: 'moi',
        date: '2026-08-01',
      },
      {
        id: 'inc-2',
        amount: 700,
        type: 'Freelance',
        owner: 'madame',
        date: '2026-08-08',
      },
    ],
    rolloverFor: () => 0,
    expenses: () => [
      {
        id: 'versement-1',
        amount: 500,
        category: 'Versement',
        owner: 'madame',
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
        owner: 'moi',
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
        owner: 'moi',
        adjustments: [
          { id: 'adj-1', amount: 450, date: '2026-08-15', note: '', versementExpenseId: 'versement-1' },
        ],
      },
    ] as ReturnType<BudgetStore['visibleProvisions']>;

    const component = new Mouvements(store);

    expect(component.entries().some((entry) => entry.id === 'provision-prov-reee-adj-1')).toBe(false);
  });
});