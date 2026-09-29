import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Button, ButtonVariant } from './button';

@Component({
  imports: [Button],
  template: `<app-button
    [variant]="variant"
    [type]="type"
    [disabled]="disabled"
    [fullWidth]="fullWidth"
    (click)="clicks = clicks + 1"
    >Valider</app-button
  >`,
})
class HostComponent {
  variant: ButtonVariant = 'primary';
  type: 'button' | 'submit' = 'button';
  disabled = false;
  fullWidth = false;
  clicks = 0;
}

function createFixture(overrides: Partial<Pick<HostComponent, 'variant' | 'type' | 'disabled' | 'fullWidth'>> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  return fixture;
}

describe('Button', () => {
  it('projette le contenu et utilise les valeurs par défaut (primary, type button)', () => {
    const fixture = createFixture();
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(btn.textContent?.trim()).toBe('Valider');
    expect(btn.type).toBe('button');
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains('app-btn--ghost')).toBe(false);
    expect(btn.classList.contains('app-btn--full')).toBe(false);
  });

  it('applique la classe ghost quand variant="ghost"', () => {
    const fixture = createFixture({ variant: 'ghost' });
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(btn.classList.contains('app-btn--ghost')).toBe(true);
  });

  it('applique la classe pleine largeur quand fullWidth=true', () => {
    const fixture = createFixture({ fullWidth: true });
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(btn.classList.contains('app-btn--full')).toBe(true);
  });

  it('reflète type="submit" et disabled=true sur le bouton natif', () => {
    const fixture = createFixture({ type: 'submit', disabled: true });
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(btn.type).toBe('submit');
    expect(btn.disabled).toBe(true);
  });

  it("remonte le clic natif jusqu'au (click) posé par l'appelant", () => {
    const fixture = createFixture();
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    btn.click();
    expect(fixture.componentInstance.clicks).toBe(1);
  });
});
