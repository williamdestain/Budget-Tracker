import { Component, computed, input } from '@angular/core';

// Anneau de progression — réservé aux objectifs d'épargne (SavingsGoal),
// pour les distinguer visuellement des barres linéaires utilisées pour les
// budgets/enveloppes (ProgressBar) : linéaire = cycle qui se consomme,
// anneau = accumulation vers une cible sans échéance stricte. Voir
// description-prototype.md pour cette convention.
@Component({
  selector: 'app-progress-ring',
  imports: [],
  templateUrl: './progress-ring.html',
  styleUrl: './progress-ring.scss',
})
export class ProgressRing {
  readonly percent = input.required<number>();
  readonly size = input<number>(56);

  readonly clamped = computed(() => Math.max(0, Math.min(100, this.percent())));

  readonly background = computed(
    () => `conic-gradient(var(--accent) ${this.clamped()}%, var(--surface-soft) 0)`,
  );
}
