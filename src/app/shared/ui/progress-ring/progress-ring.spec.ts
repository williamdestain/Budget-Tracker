import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProgressRing } from './progress-ring';

function createFixture(percent: number, size?: number) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(ProgressRing);
  fixture.componentRef.setInput('percent', percent);
  if (size !== undefined) fixture.componentRef.setInput('size', size);
  fixture.detectChanges();
  return fixture;
}

describe('ProgressRing', () => {
  it('affiche le pourcentage clampé dans le libellé central', () => {
    const fixture = createFixture(63);
    const label = (fixture.nativeElement as HTMLElement).querySelector('.app-ring-label')!;
    expect(label.textContent?.trim()).toBe('63%');
  });

  it('clampe un pourcentage hors bornes (négatif ou > 100)', () => {
    expect(createFixture(-10).componentInstance.clamped()).toBe(0);
    expect(createFixture(250).componentInstance.clamped()).toBe(100);
  });

  it('utilise la taille par défaut (56px) et la reflète sur le conteneur', () => {
    const fixture = createFixture(50);
    const ring = (fixture.nativeElement as HTMLElement).querySelector('.app-ring') as HTMLElement;
    expect(ring.style.width).toBe('56px');
    expect(ring.style.height).toBe('56px');
  });

  it('reflète une taille personnalisée', () => {
    const fixture = createFixture(50, 90);
    const ring = (fixture.nativeElement as HTMLElement).querySelector('.app-ring') as HTMLElement;
    expect(ring.style.width).toBe('90px');
  });

  it('construit un dégradé conique proportionnel au pourcentage clampé', () => {
    const fixture = createFixture(75);
    expect(fixture.componentInstance.background()).toBe(
      'conic-gradient(var(--accent) 75%, var(--surface-soft) 0)',
    );
  });
});
