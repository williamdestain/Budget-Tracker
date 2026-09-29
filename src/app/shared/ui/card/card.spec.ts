import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Card, CardSize } from './card';

@Component({
  imports: [Card],
  template: `<app-card [size]="size" [accent]="accent">Contenu</app-card>`,
})
class HostComponent {
  size: CardSize = 'md';
  accent: string | null = null;
}

function createFixture(overrides: Partial<Pick<HostComponent, 'size' | 'accent'>> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  return fixture;
}

describe('Card', () => {
  it("projette le contenu et ne porte aucune classe modificatrice par défaut (size=\"md\", pas d'accent)", () => {
    const fixture = createFixture();
    const div = (fixture.nativeElement as HTMLElement).querySelector('.app-card')!;
    expect(div.textContent?.trim()).toBe('Contenu');
    expect(div.classList.contains('app-card--lg')).toBe(false);
    expect(div.classList.contains('app-card--accent')).toBe(false);
  });

  it('applique la classe "lg" quand size="lg"', () => {
    const fixture = createFixture({ size: 'lg' });
    const div = (fixture.nativeElement as HTMLElement).querySelector('.app-card')!;
    expect(div.classList.contains('app-card--lg')).toBe(true);
  });

  it("applique la classe accent et la couleur de bordure quand accent est fourni", () => {
    const fixture = createFixture({ accent: 'var(--accent)' });
    const div = (fixture.nativeElement as HTMLElement).querySelector('.app-card') as HTMLElement;
    expect(div.classList.contains('app-card--accent')).toBe(true);
    expect(div.style.borderTopColor).toBeTruthy();
  });
});
