import { Component, OnInit, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { sortedAlpha } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';
import { fmtDate } from '../../../core/utils/date.utils';
import { INCOME_TYPE_LABELS } from '../../../core/utils/income.utils';
import { Button } from '../../../shared/ui/button/button';

export type MovementKind = 'expense' | 'income';

// Catégorie réservée au paiement de la carte : verrouillée à l'édition (le
// paiement a son propre circuit, « Payer la carte »).
const CARD_PAYMENT_CATEGORY = 'Remboursement Carte Crédit';

// Contenu de la fenêtre « Modifier » ouverte en cliquant une ligne de
// Mouvements. Reprend les règles d'ExpenseList / IncomeList (qui restent sur le
// tableau de bord jusqu'à son nettoyage) en les rendant EXPLICITES au lieu de
// laisser le store échouer après coup :
//
//  - mois clôturé          → lecture seule, avec la raison (le store refuse de
//                            toute façon, origine ET destination) ;
//  - versement réparti     → ni modification ni suppression : seulement
//                            « annuler la répartition », sinon des ajouts
//                            resteraient orphelins sur les provisions ;
//  - paie générée          → seul le montant se corrige ; et si son modèle
//                            récurrent est actif, pas de suppression — voir
//                            `templateActive` ci-dessous.
//
// Toute suppression passe par une confirmation en deux temps : aucune n'a
// d'annulation possible.
@Component({
  selector: 'app-edit-movement',
  imports: [FormsModule, Button],
  templateUrl: './edit-movement.html',
  styleUrl: './edit-movement.scss',
})
export class EditMovement implements OnInit {
  readonly kind = input.required<MovementKind>();
  readonly movementId = input.required<string>();
  readonly done = output<void>();

  readonly saving = signal(false);
  readonly confirmDelete = signal(false);
  readonly confirmCancelSplit = signal(false);
  readonly confirmStop = signal(false);

  // Champs communs / dépense
  amount: number | null = null;
  date = '';
  category = '';
  owner = '';
  cc = false;
  recipientId = '';
  // Champs revenu
  type = '';
  note = '';

  readonly typeLabels = INCOME_TYPE_LABELS;

  readonly expense = computed(() =>
    this.kind() === 'expense'
      ? (this.store.expenses().find((e) => e.id === this.movementId()) ?? null)
      : null,
  );

  readonly income = computed(() =>
    this.kind() === 'income'
      ? (this.store.incomes().find((i) => i.id === this.movementId()) ?? null)
      : null,
  );

  readonly record = computed(() => this.expense() ?? this.income());

  readonly monthClosed = computed(() => {
    const r = this.record();
    return r ? this.store.isMonthClosed(r.date.slice(0, 7)) : false;
  });

  // Un versement « réparti » a des ajouts de provisions liés (créés via
  // « Répartir un versement »).
  readonly splitVersement = computed(() => {
    const e = this.expense();
    return (
      !!e &&
      this.store.provisions().some((p) => p.adjustments.some((a) => a.versementExpenseId === e.id))
    );
  });

  // Paie produite par un modèle de revenu récurrent…
  readonly generated = computed(() => !!this.income()?.recurringSourceId);

  // …dont le modèle est ENCORE actif. syncRecurringIncomes() tourne à chaque
  // chargement et recrée toute occurrence manquante d'un modèle actif : la
  // supprimer la ferait simplement réapparaître. Tant que le modèle tourne, on
  // propose donc de l'arrêter plutôt qu'une suppression qui ne tient pas.
  readonly templateActive = computed(() => {
    const source = this.income()?.recurringSourceId;
    if (!source) return false;
    return this.store.recurringIncomes().some((r) => r.id === source && r.active);
  });

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    const e = this.expense();
    if (e) {
      this.amount = e.amount;
      this.date = e.date;
      this.category = e.category;
      this.owner = e.memberId;
      this.cc = e.cc;
      this.recipientId = e.versementToMemberId ?? this.firstOtherMember(e.memberId);
      return;
    }
    const i = this.income();
    if (i) {
      this.amount = i.amount;
      this.date = i.date;
      this.type = i.type;
      this.note = i.note;
      this.owner = i.memberId;
    }
  }

  fmt(n: number): string {
    return fmt(n);
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }

  get categoryLocked(): boolean {
    return this.expense()?.category === CARD_PAYMENT_CATEGORY;
  }

  // Même exclusion que le formulaire d'ajout, mais inclut toujours la
  // catégorie actuelle de la ligne, même archivée ou renommée depuis : ne
  // jamais changer une valeur existante en silence à l'ouverture.
  categoryOptions(): string[] {
    const active = this.store
      .activeCategoryNames()
      .filter((c) => c !== 'Revenu' && c !== CARD_PAYMENT_CATEGORY);
    return this.category && !active.includes(this.category) ? [this.category, ...active] : active;
  }

  incomeTypeOptions(): string[] {
    const known = sortedAlpha(Object.keys(INCOME_TYPE_LABELS));
    return this.type && !known.includes(this.type) ? [this.type, ...known] : known;
  }

  recipientOptions() {
    return this.store.memberOptions().filter((m) => m.id !== this.owner);
  }

  onOwnerChange(): void {
    if (this.recipientId === this.owner) this.recipientId = this.firstOtherMember(this.owner);
  }

  private firstOtherMember(ownerId: string): string {
    return this.store.memberOptions().find((m) => m.id !== ownerId)?.id ?? '';
  }

  get canSave(): boolean {
    return !!this.amount && this.amount > 0 && !!this.date;
  }

  async save(): Promise<void> {
    if (!this.canSave || this.saving()) return;
    this.saving.set(true);
    try {
      if (this.kind() === 'expense') {
        await this.saveExpense();
      } else {
        await this.saveIncome();
      }
      this.done.emit();
    } catch (err) {
      this.toast.show(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  private async saveExpense(): Promise<void> {
    const isVersement = this.category === 'Versement';
    // Le destinataire n'existe que pour un Versement ; sinon on l'efface
    // (une dépense qui cesse d'être un versement ne doit pas en garder un).
    // Jamais l'émetteur lui-même.
    const recipient = isVersement
      ? this.recipientId && this.recipientId !== this.owner
        ? this.recipientId
        : this.firstOtherMember(this.owner) || null
      : null;
    await this.store.updateExpense(this.movementId(), {
      amount: this.amount!,
      category: this.category,
      date: this.date,
      memberId: this.owner,
      cc: this.cc,
      versementToMemberId: recipient,
    });
    this.toast.show('Dépense modifiée.');
  }

  private async saveIncome(): Promise<void> {
    // Paie générée : le montant seul, pour corriger une paie dont le vrai
    // montant diffère du modèle. Changer sa date ou son type fausserait le
    // décompte par mois du générateur (il recréerait une paie « manquante »).
    const changes = this.generated()
      ? { amount: this.amount! }
      : { amount: this.amount!, type: this.type, date: this.date, note: this.note.trim() };
    await this.store.updateIncome(this.movementId(), changes);
    this.toast.show('Revenu modifié.');
  }

  async remove(): Promise<void> {
    if (!this.record() || this.saving()) return;
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      return;
    }
    try {
      if (this.kind() === 'expense') {
        await this.store.removeExpense(this.movementId());
        this.toast.show('Dépense supprimée.');
      } else {
        await this.store.removeIncome(this.movementId());
        this.toast.show('Revenu supprimé.');
      }
      this.done.emit();
    } catch (err) {
      this.confirmDelete.set(false);
      this.toast.show(errorMessage(err));
    }
  }

  async cancelSplit(): Promise<void> {
    if (!this.expense()) return;
    if (!this.confirmCancelSplit()) {
      this.confirmCancelSplit.set(true);
      return;
    }
    try {
      await this.store.cancelVersementSplit(this.movementId());
      this.confirmCancelSplit.set(false);
      this.toast.show('Répartition annulée.');
    } catch (err) {
      this.confirmCancelSplit.set(false);
      this.toast.show(errorMessage(err));
    }
  }

  // Arrête le modèle récurrent : les paies déjà reçues restent dans
  // l'historique, seules les suivantes cessent d'être générées.
  async stopRecurring(): Promise<void> {
    const source = this.income()?.recurringSourceId;
    if (!source) return;
    if (!this.confirmStop()) {
      this.confirmStop.set(true);
      return;
    }
    try {
      await this.store.removeRecurringIncome(source);
      this.confirmStop.set(false);
      this.toast.show('Revenu récurrent arrêté.');
    } catch (err) {
      this.confirmStop.set(false);
      this.toast.show(errorMessage(err));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue.';
}
