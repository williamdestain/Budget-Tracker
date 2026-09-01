import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { Owner, IncomeRecurringInterval } from '../../../core/models/budget.models';
import { isoOfDate } from '../../../core/utils/date.utils';
import { sortedAlpha } from '../../../core/utils/categories';
import {
  INCOME_TYPE_LABELS,
  RECURRING_INTERVAL_LABELS,
} from '../../../core/utils/income.utils';

@Component({
  selector: 'app-income-form',
  imports: [FormsModule],
  templateUrl: './income-form.html',
  styleUrl: './income-form.scss',
})
export class IncomeForm {
  // Trié sur la clé (Salaire, Remboursement, ...), pas sur le libellé
  // affiché (qui a un emoji en préfixe — trier dessus donnerait un ordre
  // sans rapport avec l'alphabet).
  readonly typeOptions = sortedAlpha(Object.keys(INCOME_TYPE_LABELS));
  readonly intervalOptions = Object.entries(RECURRING_INTERVAL_LABELS).filter(
    ([key]) => key !== 'once',
  );
  readonly typeLabels = INCOME_TYPE_LABELS;

  amount: number | null = null;
  type = this.typeOptions[0];
  date = isoOfDate(new Date());
  owner: Owner = 'moi';
  note = '';
  recurring = false;
  recurringInterval: IncomeRecurringInterval = 'monthly';
  // Jour du 2e versement du mois — utilisé seulement si l'intervalle est
  // '2x par mois' (semimonthly). Par défaut, 15 jours après le 1er jour
  // (celui de `date`), borné au 28 pour rester valide dans tous les mois.
  secondDayOfMonth: number | null = null;

  readonly saving = signal(false);

  constructor(private store: BudgetStore, private toast: ToastService) {
    // Garde le profil du formulaire aligné sur l'onglet actif (Moi/Madame),
    // y compris si on change d'onglet après l'ouverture de la page — pas
    // seulement au premier chargement.
    effect(() => {
      const active = this.store.activeOwner();
      if (active === 'moi' || active === 'madame') this.owner = active;
    });
  }

  onIntervalChange(): void {
    if (this.recurringInterval === 'semimonthly' && this.secondDayOfMonth == null && this.date) {
      const day = Number(this.date.slice(-2));
      this.secondDayOfMonth = Math.min(day + 15, 28);
    }
  }

  async submit(): Promise<void> {
    if (!this.amount || this.amount <= 0 || !this.date) return;
    this.saving.set(true);
    try {
      if (this.recurring) {
        const dayOfMonth = Number(this.date.slice(-2));
        await this.store.addRecurringIncome({
          amount: this.amount,
          type: this.type,
          owner: this.owner,
          note: this.note,
          interval: this.recurringInterval,
          dayOfMonth,
          secondDayOfMonth:
            this.recurringInterval === 'semimonthly' ? this.secondDayOfMonth : null,
          startDate: this.date,
          active: true,
        });
        this.toast.show(
          '✅ Revenu récurrent créé — les paies déjà passées ont été ajoutées automatiquement.',
        );
      } else {
        await this.store.addIncome({
          amount: this.amount,
          type: this.type,
          date: this.date,
          owner: this.owner,
          note: this.note,
          recurring: false,
          recurringInterval: 'once',
          recurringStartMonth: this.store.current(),
          recurringSourceId: null,
        });
      }
      this.amount = null;
      this.note = '';
      this.recurring = false;
      this.secondDayOfMonth = null;
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.saving.set(false);
    }
  }
}
