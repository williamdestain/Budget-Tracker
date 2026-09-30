import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { Owner } from '../../../core/models/budget.models';
import { defaultMemberId } from '../../../core/utils/members.utils';

@Component({
  selector: 'app-savings-goal-form',
  imports: [FormsModule],
  templateUrl: './savings-goal-form.html',
  styleUrl: './savings-goal-form.scss',
})
export class SavingsGoalForm {
  readonly open = signal(false);
  readonly saving = signal(false);

  name = '';
  targetAmount: number | null = null;
  targetDate = '';

  constructor(private store: BudgetStore) {}

  toggle(): void {
    this.open.update((v) => !v);
  }

  async submit(): Promise<void> {
    if (!this.name.trim() || !this.targetAmount || this.targetAmount <= 0) return;

    // Propriétaire : profil actif ; en vue Global, le membre connecté.
    const active = this.store.activeOwner();
    const memberId: Owner = defaultMemberId(
      active,
      this.store.myMemberId(),
      this.store.memberOptions().map((m) => m.id),
    );
    // Sans aucun membre actif, aucun propriétaire valide n'existe : mieux
    // vaut ne rien écrire qu'envoyer un identifiant inventé.
    if (!memberId) return;

    this.saving.set(true);
    try {
      await this.store.addSavingsGoal({
        name: this.name.trim(),
        targetAmount: this.targetAmount,
        targetDate: this.targetDate || null,
        memberId,
      });
      this.name = '';
      this.targetAmount = null;
      this.targetDate = '';
      this.open.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
