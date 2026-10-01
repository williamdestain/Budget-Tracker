import { Component, output, signal } from '@angular/core';
import { ExpenseForm } from '../../expenses/expense-form/expense-form';
import { IncomeForm } from '../../incomes/income-form/income-form';
import { Chip } from '../../../shared/ui/chip/chip';

export type TransactionKind = 'expense' | 'income';

// Contenu de la fenêtre « Ajouter » ouverte par le bouton « + » de la barre du
// bas (mobile) et par le bouton « Ajouter » de la barre du haut (bureau) — voir
// AppShell. Un sélecteur Dépense / Revenu, puis le formulaire existant : aucune
// logique de saisie n'est dupliquée ici, seuls le choix du type et la
// fermeture (`done`, dès que le formulaire signale `saved`) sont propres à
// ce composant.
//
// Changer de type recrée le formulaire : ce qui a été saisi dans l'autre est
// perdu. Volontaire — les deux formulaires n'ont presque aucun champ commun.
@Component({
  selector: 'app-add-transaction',
  imports: [Chip, ExpenseForm, IncomeForm],
  templateUrl: './add-transaction.html',
  styleUrl: './add-transaction.scss',
})
export class AddTransaction {
  readonly done = output<void>();
  readonly kind = signal<TransactionKind>('expense');
}
