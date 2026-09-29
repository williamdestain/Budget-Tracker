import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './progress-bar';

function createFixture(percent: number, tone?: 'primary' | 'gold' | 'danger') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(ProgressBar);
  fixture.componentRef.setInput('percent', percent);
  if (tone) fixture.componentRef.setInput('tone', tone);
  fixture.detectChanges();
  return fixture;
}

describe('ProgressBar', () => {
  it('affiche la largeur telle quelle pour un pourcentage normal', () => {
    const fixture = createFixture(42);
    expect(fixture.componentInstance.clamped()).toBe(42);
    const fill = (fixture.nativeElement as HTMLElement).querySelector(
      '.app-progress-fill',
    ) as HTMLElement;
    expect(fill.style.width).toBe('42%');
  });

  it('clampe un pourcentage négatif à 0', () => {
    const fixture = createFixture(-15);
    expect(fixture.componentInstance.clamped()).toBe(0);
  });

  it('clampe un pourcentage supérieur à 100 (budget dépassé) à 100', () => {
    const fixture = createFixture(180);
    expect(fixture.componentInstance.clamped()).toBe(100);
  });

  it('applique la classe "gold" ou "danger" selon le ton demandé', () => {
    const gold = createFixture(50, 'gold');
    expect(
      (gold.nativeElement as HTMLElement)
        .querySelector('.app-progress-fill')!
        .classList.contains('app-progress-fill--gold'),
    ).toBe(true);

    const danger = createFixture(50, 'danger');
    expect(
      (danger.nativeElement as HTMLElement)
        .querySelector('.app-progress-fill')!
        .classList.contains('app-progress-fill--danger'),
    ).toBe(true);
  });
});
