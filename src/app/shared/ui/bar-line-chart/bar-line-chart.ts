import { Component, computed, input } from '@angular/core';

export interface ChartSeries {
  name: string;
  color: string;
  kind: 'bar' | 'line';
  values: number[];
}

interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface LinePoint {
  x: number;
  y: number;
}

interface LineSeriesGeometry {
  color: string;
  points: LinePoint[];
}

interface XLabel {
  x: number;
  label: string;
}

// <app-bar-line-chart [categories]="mois" [series]="[...]" />
//
// Remplace les deux composants "LineChartComponent"/"BarChartComponent"
// prévus séparément dans plan-industrialisation.md : la vue annuelle
// (barres Revenus/Dépenses + ligne Solde net) et l'évolution du
// portefeuille (une seule ligne) partagent exactement le même calcul de
// position sur un axe X à catégories — les dupliquer en deux composants
// aurait juste copié-collé la même géométrie deux fois.
//
// Les couleurs passées dans `series` peuvent être des var(--xxx) : ce sont
// de simples valeurs d'attribut SVG, non sanitizées par Angular, donc le
// dégradé clair/sombre s'applique automatiquement sans re-calculer le
// graphique au changement de thème.
@Component({
  selector: 'app-bar-line-chart',
  imports: [],
  templateUrl: './bar-line-chart.html',
  styleUrl: './bar-line-chart.scss',
})
export class BarLineChart {
  readonly categories = input.required<string[]>();
  readonly series = input.required<ChartSeries[]>();
  /** false = axe resserré autour des valeurs (utile pour une seule ligne de
   *  valeur de portefeuille, où partir de 0 écraserait la variation utile).
   *  Ne pas utiliser à false avec des séries "bar" : le calcul de hauteur
   *  de barre suppose une base à 0. */
  readonly zeroBased = input<boolean>(true);
  readonly showLegend = input<boolean>(true);

  private readonly viewBoxW = 724;
  private readonly viewBoxH = 222;
  private readonly padTop = 14;
  private readonly padBottom = 26;
  private readonly padSide = 4;

  private readonly bounds = computed(() => {
    const all = this.series().flatMap((s) => s.values);
    if (this.zeroBased()) {
      return { min: 0, max: Math.max(1, ...all) };
    }
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1;
    return { min: min - pad, max: max + pad };
  });

  private groupWidth(): number {
    const n = Math.max(1, this.categories().length);
    return (this.viewBoxW - this.padSide * 2) / n;
  }

  readonly bars = computed<BarRect[]>(() => {
    const barSeries = this.series().filter((s) => s.kind === 'bar');
    if (!barSeries.length) return [];
    const { min, max } = this.bounds();
    const range = max - min || 1;
    const groupW = this.groupWidth();
    const base = this.viewBoxH - this.padBottom;
    const plotH = base - this.padTop;
    const barW = Math.min(14, groupW / (barSeries.length + 1));
    const gap = 2;
    const totalW = barSeries.length * barW + (barSeries.length - 1) * gap;
    const result: BarRect[] = [];
    const n = this.categories().length;
    for (let i = 0; i < n; i++) {
      const groupCenter = this.padSide + groupW * i + groupW / 2;
      let x = groupCenter - totalW / 2;
      for (const s of barSeries) {
        const h = ((s.values[i] - min) / range) * plotH;
        result.push({ x, y: base - h, width: barW, height: h, color: s.color });
        x += barW + gap;
      }
    }
    return result;
  });

  readonly lineSeries = computed<LineSeriesGeometry[]>(() => {
    const lines = this.series().filter((s) => s.kind === 'line');
    const { min, max } = this.bounds();
    const range = max - min || 1;
    const groupW = this.groupWidth();
    const base = this.viewBoxH - this.padBottom;
    const plotH = base - this.padTop;
    return lines.map((s) => ({
      color: s.color,
      points: s.values.map((v, i) => ({
        x: this.padSide + groupW * i + groupW / 2,
        y: base - ((v - min) / range) * plotH,
      })),
    }));
  });

  readonly xLabels = computed<XLabel[]>(() => {
    const groupW = this.groupWidth();
    return this.categories().map((label, i) => ({
      x: this.padSide + groupW * i + groupW / 2,
      label,
    }));
  });

  readonly viewBox = `0 0 ${this.viewBoxW} ${this.viewBoxH}`;
  readonly labelY = this.viewBoxH - 8;

  pointsToString(points: LinePoint[]): string {
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  }
}
