import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { Owner, ProvisionIntervalUnit } from '../../../core/models/budget.models';
import { CATEGORIES, sortedAlpha } from '../../../core/utils/categories';
import { isoOfDate } from '../../../core/utils/date.utils';

const MOIS_NOMS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

@Component({
  selector: 'app-provision-form',
  imports: [FormsModule],
  templateUrl: './provision-form.html',
  styleUrl: './provision-form.scss',
})
export class ProvisionForm {
  readonly categories = sortedAlpha(
    CATEGORIES.filter((c) => !['Revenu', 'Versement'].includes(c)),
  );
  readonly open = signal(false);
  readonly saving = signal(false);

  readonly monthNames = MOIS_NOMS;
  // Quelques années avant/après aujourd'hui : large marge pour une
  // provision qui existe déjà depuis un moment, ou planifiée à l'avance.
  readonly years = Array.from({ length: 9 }, (_, i) => new Date().getFullYear() - 4 + i);

  name = '';
  category = this.categories[0];
  amount: number | null = null;
  intervalUnit: ProvisionIntervalUnit = 'months';
  everyN: number | null = null;
  startMonth = new Date().getMonth() + 1;
  startYear = new Date().getFullYear();
  startDate = isoOfDate(new Date());
  // Par défaut activé (comportement d'origine inchangé), mais maintenant
  // décoché possible : certains utilisateurs ne veulent pas qu'une
  // provision redémarre automatiquement un nouveau cycle dès qu'un
  // paiement réel est enregistré dans sa catégorie — ils préfèrent gérer
  // la date de la prochaine échéance eux-mêmes (voir provision-card).
  autoRecalibrate = true;

  constructor(private store: BudgetStore) {}

  toggle(): void {
    this.open.update((v) => !v);
  }

  async submit(): Promise<void> {
    const startYM = `${this.startYear}-${String(this.startMonth).padStart(2, '0')}`;
    if (
      !this.name ||
      !this.category ||
      (this.amount !== null && this.amount < 0) ||
      !this.everyN ||
      this.everyN <= 0 ||
      (this.intervalUnit === 'days' && !this.startDate)
    ) {
      return;
    }

    // Propriétaire : profil actif (Global → Moi par défaut, comme avant).
    const active = this.store.activeOwner();
    const owner: Owner = active === 'madame' ? 'madame' : 'moi';

    this.saving.set(true);
    try {
      await this.store.addProvision({
        name: this.name.trim() || this.category,
        category: this.category,
        amount: this.amount || 0,
        everyN: this.everyN,
        intervalUnit: this.intervalUnit,
        startYM: this.intervalUnit === 'months' ? startYM : this.startDate.slice(0, 7),
        startDate: this.intervalUnit === 'days' ? this.startDate : '',
        owner,
        autoRecalibrate: this.autoRecalibrate,
        allocationPercent: 0,
        rollingCount: 0,
        monthlyReminder: null,
      });
      this.name = '';
      this.amount = null;
      this.everyN = null;
      this.autoRecalibrate = true;
      this.open.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
