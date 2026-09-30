import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { SavingsContribution, SavingsGoal } from '../../../core/models/budget.models';
import { fmt } from '../../../core/utils/currency.utils';
import { defaultMemberId } from '../../../core/utils/members.utils';
import { fmtDate, isoOfDate } from '../../../core/utils/date.utils';
import {
  GoalStatus,
  contributedInMonth,
  goalMonthlyRhythm,
  goalPot,
  goalProgressPct,
  goalStatus,
} from '../../../core/utils/savings.utils';
import { ToastService } from '../../../core/services/toast.service';
import { Card } from '../../../shared/ui/card/card';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { ProgressRing } from '../../../shared/ui/progress-ring/progress-ring';

export interface GoalRow {
  goal: SavingsGoal;
  pot: number;
  /** Arrondi : l'anneau affiche la valeur telle quelle. */
  pct: number;
  status: GoalStatus;
  /** Évolution récente : contributions datées du mois en cours. */
  thisMonth: number;
  /** Rythme moyen sur les mois complets précédents, null = pas d'historique. */
  rhythm: number | null;
  ownerLabel: string;
}

// Écran /epargne — Phase 2, vague B (plan-industrialisation.md).
//
// Réutilise les méthodes existantes du store (addSavingsGoal, contributions,
// suppression) et les calculs de savings.utils.ts. Aucun champ nouveau en
// base : « ce mois-ci » et le rythme sont DÉDUITS des contributions (voir
// le commentaire de savings.utils.ts). Le composant du tableau de bord
// (SavingsGoalList) reste inchangé.
@Component({
  selector: 'app-savings-page',
  imports: [FormsModule, Card, Button, Icon, Modal, ProgressRing],
  templateUrl: './savings-page.html',
  styleUrl: './savings-page.scss',
})
export class SavingsPage {
  // Fixé à la construction : borne des dates de contribution et « mois
  // courant » des statistiques.
  readonly today = isoOfDate(new Date());
  readonly currentYM = this.today.slice(0, 7);

  readonly saving = signal(false);

  // --- Modale d'ajout d'un objectif ---
  readonly addOpen = signal(false);
  name = '';
  targetAmount: number | null = null;
  targetDate = '';
  ownerId = '';

  // --- Modale de détail ---
  readonly selectedId = signal<string | null>(null);
  readonly confirmDelete = signal(false);
  readonly confirmRemoveId = signal<string | null>(null);
  amount: number | null = null;
  date = this.today;
  note = '';

  readonly rows = computed<GoalRow[]>(() =>
    this.store.visibleSavingsGoals().map((goal) => this.toRow(goal)),
  );

  readonly summary = computed(() => {
    const rows = this.rows();
    return {
      count: rows.length,
      saved: round2(rows.reduce((s, r) => s + r.pot, 0)),
      target: round2(rows.reduce((s, r) => s + r.goal.targetAmount, 0)),
      reached: rows.filter((r) => r.status.kind === 'reached').length,
      thisMonth: round2(rows.reduce((s, r) => s + r.thisMonth, 0)),
    };
  });

  readonly selected = computed<GoalRow | null>(() => {
    const id = this.selectedId();
    return this.rows().find((r) => r.goal.id === id) ?? null;
  });

  // Historique du détail : du plus récent au plus ancien.
  readonly contributions = computed<SavingsContribution[]>(() => {
    const row = this.selected();
    if (!row) return [];
    return [...row.goal.contributions].sort(
      (a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)),
    );
  });

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  fmt(n: number): string {
    return fmt(n);
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }

  private toRow(goal: SavingsGoal): GoalRow {
    return {
      goal,
      pot: goalPot(goal),
      pct: Math.round(goalProgressPct(goal)),
      status: goalStatus(goal),
      thisMonth: contributedInMonth(goal, this.currentYM),
      rhythm: goalMonthlyRhythm(goal, this.today),
      ownerLabel: this.store.memberName(goal.memberId),
    };
  }

  // Texte d'état, sans emoji (le design system utilise des icônes).
  statusText(row: GoalRow): string {
    const s = row.status;
    switch (s.kind) {
      case 'reached':
        return 'Objectif atteint';
      case 'overdue':
        return `Date cible dépassée — il manque ${fmt(s.remaining)}`;
      case 'soon':
        return `${s.daysLeft === 0 ? "Aujourd'hui" : `Dans ${s.daysLeft} j`} — il manque ${fmt(s.remaining)}`;
      default:
        return `Il manque ${fmt(s.remaining)}`;
    }
  }

  // --- Ajout d'un objectif ---

  openAdd(): void {
    const active = this.store.activeOwner();
    this.name = '';
    this.targetAmount = null;
    this.targetDate = '';
    // Vue globale : pas de propriétaire évident → le membre connecté, modifiable.
    this.ownerId = defaultMemberId(active, this.store.myMemberId(), this.store.memberOptions().map((m) => m.id));
    this.addOpen.set(true);
  }

  closeAdd(): void {
    this.addOpen.set(false);
  }

  async submitAdd(): Promise<void> {
    if (this.saving()) return;
    if (!this.name.trim() || !this.targetAmount || this.targetAmount <= 0) return;
    if (!this.ownerId) {
      this.toast.show('Choisissez le propriétaire de cet objectif.');
      return;
    }
    if (this.targetDate && this.targetDate < this.today) {
      this.toast.show('La date cible ne peut pas être dans le passé.');
      return;
    }
    this.saving.set(true);
    try {
      await this.store.addSavingsGoal({
        name: this.name.trim(),
        targetAmount: this.targetAmount,
        targetDate: this.targetDate || null,
        memberId: this.ownerId,
      });
      this.addOpen.set(false);
      this.toast.show('Objectif créé.');
    } catch (err) {
      this.toast.show(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  // --- Détail / contributions / suppression ---

  openDetail(goalId: string): void {
    this.selectedId.set(goalId);
    this.confirmDelete.set(false);
    this.confirmRemoveId.set(null);
    this.amount = null;
    this.date = this.today;
    this.note = '';
  }

  closeDetail(): void {
    this.selectedId.set(null);
    this.confirmDelete.set(false);
    this.confirmRemoveId.set(null);
  }

  async submitContribution(): Promise<void> {
    const row = this.selected();
    if (!row || this.saving()) return;
    if (!this.amount || this.amount <= 0 || !this.date) return;
    // Une contribution datée du futur gonflerait la cagnotte dès maintenant
    // (goalPot additionne tout, sans regarder la date).
    if (this.date > this.today) {
      this.toast.show('La date ne peut pas être dans le futur.');
      return;
    }
    this.saving.set(true);
    try {
      await this.store.addSavingsGoalContribution(row.goal.id, this.amount, this.date, this.note.trim());
      this.amount = null;
      this.note = '';
      this.toast.show('Montant ajouté.');
    } catch (err) {
      // Inclut le cas d'un mois clôturé (le store refuse).
      this.toast.show(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  // Suppression d'une contribution en deux temps : la note et la date
  // saisies sont perdues, et le total baisse.
  async removeContribution(contributionId: string): Promise<void> {
    const row = this.selected();
    if (!row) return;
    if (this.confirmRemoveId() !== contributionId) {
      this.confirmRemoveId.set(contributionId);
      return;
    }
    try {
      await this.store.removeSavingsGoalContribution(row.goal.id, contributionId);
      this.confirmRemoveId.set(null);
      this.toast.show('Ajout supprimé.');
    } catch (err) {
      this.confirmRemoveId.set(null);
      this.toast.show(errorMessage(err));
    }
  }

  // Supprimer un objectif efface aussi toutes ses contributions (cascade
  // en base) et n'a pas d'annulation : confirmation en deux temps.
  async deleteGoal(): Promise<void> {
    const row = this.selected();
    if (!row) return;
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      return;
    }
    try {
      await this.store.removeSavingsGoal(row.goal.id);
      this.closeDetail();
      this.toast.show('Objectif supprimé.');
    } catch (err) {
      this.confirmDelete.set(false);
      this.toast.show(errorMessage(err));
    }
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue.';
}
