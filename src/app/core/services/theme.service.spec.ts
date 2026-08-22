import { TestBed } from '@angular/core/testing';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ThemeService } from './theme.service';

// jsdom n'implémente pas matchMedia par défaut — on le simule nous-mêmes
// plutôt que d'espionner une propriété absente (vi.spyOn échoue sur
// undefined).
function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(() => ({ matches })),
  });
}

describe('ThemeService', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it("retombe sur 'light' quand rien n'est sauvegardé et que le système ne préfère pas le sombre", () => {
    stubMatchMedia(false);
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it("respecte la préférence système (prefers-color-scheme: dark) quand rien n'est sauvegardé", () => {
    stubMatchMedia(true);
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');
  });

  it('un choix déjà sauvegardé prime sur la préférence système', () => {
    localStorage.setItem('budget-tracker:theme', 'dark');
    stubMatchMedia(false);
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');
  });

  it('toggle() bascule le thème, met à jour le DOM, et persiste le choix', () => {
    stubMatchMedia(false);
    TestBed.configureTestingModule({});
    const service = TestBed.inject(ThemeService);
    const initial = service.theme();

    service.toggle();

    expect(service.theme()).not.toBe(initial);
    expect(document.documentElement.getAttribute('data-theme')).toBe(service.theme());
    expect(localStorage.getItem('budget-tracker:theme')).toBe(service.theme());
  });
});
