import { Component, computed, signal } from '@angular/core';
import { BudgetStore } from '../../core/services/budget-store.service';
import { fmt } from '../../core/utils/currency.utils';
import { fmtDate, monthLabel, prevYM } from '../../core/utils/date.utils';
import { provisionAdjustmentsForMonth } from '../../core/utils/provision.utils';
import { Card } from '../../shared/ui/card/card';
import { Chip } from '../../shared/ui/chip/chip';

type MovementFilter = 'all' | 'expense' | 'income';

interface MovementEntry {
  id: string;
  type: 'expense' | 'income';
  category: string;
  date: string;
  amount: number;
  memberId: string;
  details: string;
  color: string;
}

@Component({
  selector: 'app-mouvements',
  imports: [Card, Chip],
  templateUrl: './mouvements.html',
  styleUrl: './mouvements.scss',
})
export class Mouvements {
  readonly filter = signal<MovementFilter>('all');
  readonly search = signal('');

  constructor(public store: BudgetStore) {}

  // Ne PAS ré-additionner les lignes de entries() ici : la liste montre
  // volontairement des choses qui se chevauchent pour l'historique (une
  // dépense REEE réelle ET la contribution qui l'a couverte, un Versement
  // ET la ligne "reçu de" côté destinataire) — les re-sommer donnerait un
  // total différent de celui du Dashboard. budgetSummary() reste la seule
  // source de vérité pour "combien j'ai vraiment dépensé/disponible ce
  // mois-ci", partout dans l'app.
  readonly summary = computed(() => {
    const s = this.store.budgetSummary();
    return {
      incomes: s.budget,
      expenses: s.spent,
      net: s.soldeNet,
      count: this.entries().length,
    };
  });

  readonly entries = computed<MovementEntry[]>(() => {
    const query = this.search().trim().toLowerCase();
    const activeOwner = this.store.activeOwner();
    const currentYm = this.store.current();
    const rollover = this.store.rolloverFor(activeOwner, currentYm);

    const incomingTransfers =
      activeOwner === 'global'
        ? []
        : this.store
            .expenses()
            .filter((expense) => {
              if (expense.category !== 'Versement' || !expense.date.startsWith(currentYm)) {
                return false;
              }
              const recipient =
                expense.versementToMemberId ??
                this.store.memberOptions().find((member) => member.id !== expense.owner)?.id ??
                null;
              return recipient === activeOwner;
            })
            .map((expense) => ({
              id: `transfer-income-${expense.id}`,
              type: 'income' as const,
              category: 'Versement',
              date: expense.date,
              amount: expense.amount,
              memberId: expense.owner,
              details: `Versement reçu de ${this.store.memberName(expense.owner)}`,
              color: this.store.colorFor('Versement'),
            }));

    // Contributions du mois aux provisions (ex. "200 $ mis de côté dans
    // REEE") : PAS des Expense, un type d'objet à part
    // (Provision.adjustments) — sans ça elles n'apparaissaient jamais dans
    // ce flux alors qu'elles comptent bien contre le budget (voir
    // countedExpenses()). On exclut celles créées par un versement réparti
    // (versementExpenseId défini) : cette part-là est déjà visible via la
    // ligne "Versement → …" plus bas, l'ajouter aussi ferait doublon.
    const contributions: MovementEntry[] = this.store.visibleProvisions().flatMap((provision) =>
      provisionAdjustmentsForMonth(provision, currentYm)
        .filter((adjustment) => adjustment.amount > 0 && !adjustment.versementExpenseId)
        .map((adjustment) => ({
          id: `provision-${provision.id}-${adjustment.id}`,
          type: 'expense' as const,
          category: provision.category,
          date: adjustment.date,
          amount: adjustment.amount,
          memberId: provision.owner,
          details: `Contribution → ${provision.name}`,
          color: this.store.colorFor(provision.category),
        })),
    );

    const base: MovementEntry[] = [
      ...contributions,
      ...this.store.visibleExpenses().map((expense) => ({
        id: `expense-${expense.id}`,
        type: 'expense' as const,
        category: expense.category,
        date: expense.date,
        amount: expense.amount,
        memberId: expense.owner,
        details: `Dépense · ${this.store.memberName(expense.owner)}`,
        color: this.store.colorFor(expense.category),
      })),
      ...(rollover !== 0
        ? [
            {
              id: `rollover-${activeOwner}-${currentYm}`,
              type: 'income' as const,
              category: 'Report',
              date: `${currentYm}-01`,
              amount: rollover,
              memberId: activeOwner,
              details: `Report de ${monthLabel(prevYM(currentYm))}`,
              color: '#f59e0b',
            },
          ]
        : []),
      ...incomingTransfers,
      ...this.store.visibleIncomes().map((income) => ({
        id: `income-${income.id}`,
        type: 'income' as const,
        category: income.type,
        date: income.date,
        amount: income.amount,
        memberId: income.owner,
        details: `Revenu · ${this.store.memberName(income.owner)}`,
        color: this.store.colorFor(income.type),
      })),
    ];

    return base
      .filter((row) => {
        if (this.filter() !== 'all' && row.type !== this.filter()) {
          return false;
        }
        if (!query) {
          return true;
        }
        return (
          row.category.toLowerCase().includes(query) ||
          row.details.toLowerCase().includes(query) ||
          this.store.memberName(row.memberId).toLowerCase().includes(query)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  });

  fmt(value: number): string {
    return fmt(value);
  }

  fmtDate(value: string): string {
    return fmtDate(value);
  }

  badgeLabel(row: MovementEntry): string {
    return row.type === 'income' ? 'Revenu' : 'Dépense';
  }

  setFilter(filter: MovementFilter): void {
    this.filter.set(filter);
  }
}
