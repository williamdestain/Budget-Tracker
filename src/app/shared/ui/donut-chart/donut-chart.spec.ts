import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DonutChart, DonutSegment } from './donut-chart';

function createFixture(segments: DonutSegment[], centerLabel?: string) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(DonutChart);
  fixture.componentRef.setInput('segments', segments);
  if (centerLabel !== undefined) fixture.componentRef.setInput('centerLabel', centerLabel);
  fixture.detectChanges();
  return fixture;
}

describe('DonutChart', () => {
  it('construit un dégradé conique cumulatif à partir des segments', () => {
    const fixture = createFixture([
      { label: 'Épicerie', color: '#4c7a66', percent: 40 },
      { label: 'Transport', color: '#a15385', percent: 60 },
    ]);
    expect(fixture.componentInstance.gradient()).toBe(
      'conic-gradient(#4c7a66 0% 40%, #a15385 40% 100%)',
    );
  });

  it('gère une liste vide de segments sans planter (dégradé vide)', () => {
    const fixture = createFixture([]);
    expect(fixture.componentInstance.gradient()).toBe('conic-gradient()');
  });

  it('affiche le libellé central quand fourni, et rien sinon', () => {
    const withLabel = createFixture([{ label: 'A', color: '#000', percent: 100 }], '1 070 $');
    expect(
      (withLabel.nativeElement as HTMLElement).querySelector('.donut-center')?.textContent?.trim(),
    ).toBe('1 070 $');

    const withoutLabel = createFixture([{ label: 'A', color: '#000', percent: 100 }]);
    expect(
      (withoutLabel.nativeElement as HTMLElement).querySelector('.donut-center'),
    ).toBeNull();
  });

  it('rend une ligne de légende par segment, avec son nom et son pourcentage', () => {
    const fixture = createFixture([
      { label: 'Épicerie', color: '#4c7a66', percent: 40 },
      { label: 'Transport', color: '#a15385', percent: 60 },
    ]);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.donut-legend-row',
    );
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Épicerie');
    expect(rows[0].textContent).toContain('40%');
    expect(rows[1].textContent).toContain('Transport');
    expect(rows[1].textContent).toContain('60%');
  });

  it('utilise la taille par défaut (112px) et la reflète sur le conteneur', () => {
    const fixture = createFixture([{ label: 'A', color: '#000', percent: 100 }]);
    const donut = (fixture.nativeElement as HTMLElement).querySelector('.donut') as HTMLElement;
    expect(donut.style.width).toBe('112px');
  });
});
