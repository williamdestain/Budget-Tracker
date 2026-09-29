import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Chip } from './chip';

@Component({
  imports: [Chip],
  template: `<app-chip
    [active]="active"
    [disabled]="disabled"
    (click)="clicks = clicks + 1"
    >Épicerie</app-chip
  >`,
})
class HostComponent {
  active = false;
  disabled = false;
  clicks = 0;
}

function createFixture(overrides: Partial<Pick<HostComponent, 'active' | 'disabled'>> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  return fixture;
}

describe('Chip', () => {
  it('projette le contenu, non actif et non désactivé par défaut', () => {
    const fixture = createFixture();
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(btn.textContent?.trim()).toBe('Épicerie');
    expect(btn.classList.contains('app-chip--active')).toBe(false);
    expect(btn.disabled).toBe(false);
  });

  it('applique la classe active quand active=true', () => {
    const fixture = createFixture({ active: true });
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(btn.classList.contains('app-chip--active')).toBe(true);
  });

  it('désactive le bouton natif quand disabled=true et bloque le clic', () => {
    const fixture = createFixture({ disabled: true });
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(fixture.componentInstance.clicks).toBe(0);
  });

  it("remonte le clic natif au (click) posé par l'appelant quand actif", () => {
    const fixture = createFixture();
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    btn.click();
    expect(fixture.componentInstance.clicks).toBe(1);
  });
});
