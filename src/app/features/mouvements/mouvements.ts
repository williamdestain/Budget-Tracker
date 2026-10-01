import { Component, computed, signal } from '@angular/core';
import { BudgetStore } from '../../core/services/budget-store.service';
import { fmt } from '../../core/utils/currency.utils';
import { fmtDate, monthLabel, prevYM } from '../../core/utils/date.utils';
import { provisionAdjustmentsForMonth } from '../../core/utils/provision.utils';
import { Card } from '../../shared/ui/card/card';
import { Chip } from '../../shared/ui/chip/chip';
import { Modal } from '../../shared/ui/modal/modal';
import { EditMovement, type MovementKind } from './edit-movement/edit-movement';

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
  // Seules les vraies dépenses et les vrais revenus se modifient ici. Les
  // autres lignes sont CALCULÉES (contribution à une provision, report du mois
  // précédent, « versement reçu » côté destinataire) : pas d'enregistrement
  // propre à éditer — elles reflètent une autre ligne, ou un calcul.
  source: MovementKind | null;
  sourceId: string | null;
}

@Component({
  selector: 'app-mouvements',
  imports: [Card, Chip, Modal, EditMovement],
  templateUrl: './mouvements.html',
  styleUrl: './mouvements.scss',
})
export class Mouvements {
  readonly filter = signal<MovementFilter>('all');
  readonly search = signal('');

  // Mouvement en cours de modification (fenêtre « Modifier »).
  readonly editing = signal<{ kind: MovementKind; id: string } | null>(null);

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
                this.store.memberOptions().find((member) => member.id !== expense.memberId)?.id ??
                null;
              return recipient === activeOwner;
            })
            .map((expense) => ({
              id: `transfer-income-${expense.id}`,
              type: 'income' as const,
              category: 'Versement',
              date: expense.date,
              amount: expense.amount,
              memberId: expense.memberId,
              details: `Versement reçu de ${this.store.memberName(expense.memberId)}`,
              color: this.store.colorFor('Versement'),
              source: null,
              sourceId: null,
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
          memberId: provision.memberId,
          details: `Contribution → ${provision.name}`,
          color: this.store.colorFor(provision.category),
          source: null,
          sourceId: null,
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
        memberId: expense.memberId,
        details: `Dépense · ${this.store.memberName(expense.memberId)}`,
        color: this.store.colorFor(expense.category),
        source: 'expense' as const,
        sourceId: expense.id,
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
              source: null,
              sourceId: null,
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
        memberId: income.memberId,
        details: `Revenu · ${this.store.memberName(income.memberId)}`,
        color: this.store.colorFor(income.type),
        source: 'income' as const,
        sourceId: income.id,
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

  isEditable(row: MovementEntry): boolean {
    return row.source !== null && row.sourceId !== null;
  }

  // Ouvre la fenêtre « Modifier » — sans effet sur une ligne calculée.
  openEdit(row: MovementEntry): void {
    if (row.source === null || row.sourceId === null) return;
    this.editing.set({ kind: row.source, id: row.sourceId });
  }

  closeEdit(): void {
    this.editing.set(null);
  }

  // Entrée / Espace ouvrent la ligne comme un clic (lignes cliquables =
  // role="button", donc clavier obligatoire). Espace ne doit pas faire défiler.
  onRowKey(event: Event, row: MovementEntry): void {
    event.preventDefault();
    this.openEdit(row);
  }

  editTitle(): string {
    return this.editing()?.kind === 'income' ? 'Modifier le revenu' : 'Modifier la dépense';
  }

  rowLabel(row: MovementEntry): string {
    return `Modifier : ${row.category}, ${this.fmt(row.amount)}, ${this.fmtDate(row.date)}`;
  }
}
