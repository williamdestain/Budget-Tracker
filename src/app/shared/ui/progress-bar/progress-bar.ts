import { Component, computed, input } from '@angular/core';

export type ProgressTone = 'primary' | 'gold' | 'danger';

@Component({
  selector: 'app-progress-bar',
  imports: [],
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.scss',
})
export class ProgressBar {
  /** Pourcentage 0-100. Les valeurs hors bornes sont clampées à l'affichage
   *  (un budget dépassé peut légitimement donner > 100 en amont). */
  readonly percent = input.required<number>();
  readonly tone = input<ProgressTone>('primary');

  readonly clamped = computed(() => Math.max(0, Math.min(100, this.percent())));
}
