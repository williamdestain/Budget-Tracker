import { Component, computed, input } from '@angular/core';

export interface DonutSegment {
  label: string;
  color: string;
  percent: number;
}

// <app-donut-chart [segments]="..." centerLabel="1 070 $" />
// Répartition par catégorie (Rapports) ou allocation de portefeuille
// (Investissements) — même technique conic-gradient que ProgressRing, avec
// plusieurs segments et une légende intégrée.
@Component({
  selector: 'app-donut-chart',
  imports: [],
  templateUrl: './donut-chart.html',
  styleUrl: './donut-chart.scss',
})
export class DonutChart {
  readonly segments = input.required<DonutSegment[]>();
  readonly centerLabel = input<string>('');
  readonly size = input<number>(112);

  readonly gradient = computed(() => {
    let acc = 0;
    const stops = this.segments().map((s) => {
      const start = acc;
      acc += s.percent;
      return `${s.color} ${start}% ${acc}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  });
}
