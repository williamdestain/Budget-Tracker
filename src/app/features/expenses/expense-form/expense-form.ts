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
  // "Remboursement Carte Crédit" est retiré du choix manuel — c'est
  // maintenant la case à cocher dédiée ci-dessous qui l'assigne, pour ne
  // plus la traiter comme une catégorie de dépense ordinaire (elle ne
  // devrait pas non plus être budgétable dans "Budgets par catégorie",
  // voir category-budgets.ts).
  readonly categories = sortedAlpha(
    CATEGORIES.filter((c) => c !== 'Revenu' && c !== 'Remboursement Carte Crédit'),
  );

  amount: number | null = null;
  category = this.categories[0];
  date = isoOfDate(new Date());
  owner: Owner = 'moi';
  cc = false;
  // Remplace le choix manuel de la catégorie "Remboursement Carte
  // Crédit" — cocher ceci assigne automatiquement cette catégorie et
  // désactive "carte de crédit" (rembourser la carte n'est pas en
  // soi une nouvelle charge sur la carte).
  isReimbursement = false;

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
        category: this.isReimbursement ? 'Remboursement Carte Crédit' : this.category,
        date: this.date,
        owner: this.owner,
        // Un remboursement de carte doit garder cc=true : c'est ce que
        // "Remboursements effectués" (credit-card.ts) filtre pour
        // l'afficher — le mettre à false (comme je l'avais fait par
        // erreur) les rendait invisibles dans cette liste.
        cc: this.isReimbursement ? true : this.cc,
      });
      this.amount = null;
      this.cc = false;
      this.isReimbursement = false;
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.saving.set(false);
    }
  }
}
