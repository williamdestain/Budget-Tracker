import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BarLineChart, ChartSeries } from './bar-line-chart';

function createFixture(categories: string[], series: ChartSeries[], zeroBased?: boolean, showLegend?: boolean) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(BarLineChart);
  fixture.componentRef.setInput('categories', categories);
  fixture.componentRef.setInput('series', series);
  if (zeroBased !== undefined) fixture.componentRef.setInput('zeroBased', zeroBased);
  if (showLegend !== undefined) fixture.componentRef.setInput('showLegend', showLegend);
  fixture.detectChanges();
  return fixture;
}

describe('BarLineChart', () => {
  it('produit une barre par catégorie pour une série "bar", proportionnelle à la valeur (base zéro)', () => {
    const fixture = createFixture(
      ['Jan', 'Fév'],
      [{ name: 'Dépenses', color: 'red', kind: 'bar', values: [10, 20] }],
    );
    const bars = fixture.componentInstance.bars();
    expect(bars.length).toBe(2);
    // La valeur double (20 vs 10) donne une hauteur double, base = 0.
    expect(bars[1].height).toBeCloseTo(bars[0].height * 2, 5);
    expect(bars.every((b) => b.color === 'red')).toBe(true);
    // Plus la valeur est grande, plus le sommet de la barre (y) est haut sur l'écran (y plus petit).
    expect(bars[1].y).toBeLessThan(bars[0].y);
  });

  it('ignore les séries "line" dans bars() et les séries "bar" dans lineSeries()', () => {
    const fixture = createFixture(
      ['Jan', 'Fév', 'Mar'],
      [
        { name: 'Dépenses', color: 'red', kind: 'bar', values: [10, 20, 15] },
        { name: 'Solde net', color: 'blue', kind: 'line', values: [5, 8, 3] },
      ],
    );
    expect(fixture.componentInstance.bars().every((b) => b.color === 'red')).toBe(true);
    const lines = fixture.componentInstance.lineSeries();
    expect(lines.length).toBe(1);
    expect(lines[0].color).toBe('blue');
    expect(lines[0].points.length).toBe(3);
  });

  it('produit un point de ligne par catégorie, avec des abscisses régulièrement espacées', () => {
    const fixture = createFixture(
      ['Jan', 'Fév', 'Mar'],
      [{ name: 'Solde', color: 'green', kind: 'line', values: [1, 2, 3] }],
    );
    const points = fixture.componentInstance.lineSeries()[0].points;
    const gap1 = points[1].x - points[0].x;
    const gap2 = points[2].x - points[1].x;
    expect(gap1).toBeCloseTo(gap2, 5);
  });

  it('avec zeroBased=false, deux valeurs égales donnent la même ordonnée (portefeuille resserré autour des valeurs)', () => {
    const fixture = createFixture(
      ['Jan', 'Fév', 'Mar'],
      [{ name: 'Portefeuille', color: 'purple', kind: 'line', values: [100, 100, 150] }],
      false,
    );
    const points = fixture.componentInstance.lineSeries()[0].points;
    expect(points[0].y).toBeCloseTo(points[1].y, 5);
    // Une valeur plus haute (150) doit être plus haute à l'écran (y plus petit).
    expect(points[2].y).toBeLessThan(points[0].y);
  });

  it('produit un libellé d\'axe X par catégorie, dans l\'ordre', () => {
    const fixture = createFixture(
      ['Jan', 'Fév', 'Mar'],
      [{ name: 'S', color: 'red', kind: 'bar', values: [1, 2, 3] }],
    );
    const labels = fixture.componentInstance.xLabels();
    expect(labels.map((l) => l.label)).toEqual(['Jan', 'Fév', 'Mar']);
  });

  it('formate une liste de points en chaîne SVG "x,y x,y"', () => {
    const fixture = createFixture(['Jan'], [{ name: 'S', color: 'red', kind: 'line', values: [1] }]);
    expect(
      fixture.componentInstance.pointsToString([
        { x: 1, y: 2 },
        { x: 3.5, y: 4 },
      ]),
    ).toBe('1,2 3.5,4');
  });

  it('affiche ou masque la légende selon showLegend', () => {
    const series: ChartSeries[] = [{ name: 'Dépenses', color: 'red', kind: 'bar', values: [1, 2] }];
    const shown = createFixture(['Jan', 'Fév'], series, true, true);
    expect((shown.nativeElement as HTMLElement).querySelector('.chart-legend')).toBeTruthy();
    expect((shown.nativeElement as HTMLElement).textContent).toContain('Dépenses');

    const hidden = createFixture(['Jan', 'Fév'], series, true, false);
    expect((hidden.nativeElement as HTMLElement).querySelector('.chart-legend')).toBeNull();
  });

  it('ne plante pas avec une série vide', () => {
    const fixture = createFixture(['Jan'], []);
    expect(fixture.componentInstance.bars()).toEqual([]);
    expect(fixture.componentInstance.lineSeries()).toEqual([]);
  });
});
