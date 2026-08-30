import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { Owner } from '../../../core/models/budget.models';
import { CATEGORIES, sortedAlpha } from '../../../core/utils/categories';
import { isoOfDate } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-expense-form',
  imports: [FormsModule],
  templateUrl: './expense-form.html',
  styleUrl: './expense-form.scss',
})
export class ExpenseForm {
  // "Remboursement Carte Crédit" est retiré définitivement du choix
  // manuel — remplacé par le nouveau modèle de solde dû (voir
  // credit-card.ts / creditCardBalance() dans le store) : un paiement de
  // carte se fait maintenant via le bouton "Payer la carte" dédié, plus
  // besoin d'une catégorie spéciale ni d'une case à cocher ici.
  readonly categories = sortedAlpha(
    CATEGORIES.filter((c) => c !== 'Revenu' && c !== 'Remboursement Carte Crédit'),
  );

  amount: number | null = null;
  category = this.categories[0];
  date = isoOfDate(new Date());
  owner: Owner = 'moi';
  cc = false;

  readonly saving = signal(false);

  constructor(private store: BudgetStore, private toast: ToastService) {
    // Garde le profil du formulaire aligné sur l'onglet actif (Moi/Madame),
    // y compris si on change d'onglet après l'ouverture de la page.
    effect(() => {
      const active = this.store.activeOwner();
      if (active === 'moi' || active === 'madame') this.owner = active;
    });
  }

  async submit(): Promise<void> {
    if (!this.amount || this.amount <= 0 || !this.date) return;
    this.saving.set(true);
    try {
      await this.store.addExpense({
        amount: this.amount,
        category: this.category,
        date: this.date,
        owner: this.owner,
        cc: this.cc,
      });
      this.amount = null;
      this.cc = false;
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.saving.set(false);
    }
  }
}
