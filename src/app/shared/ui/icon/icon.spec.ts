import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Icon } from './icon';
import { ALL_ICON_NAMES } from './icon-names';

function createFixture() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(Icon);
  fixture.componentRef.setInput('name', 'close');
  return fixture;
}

describe('Icon', () => {
  it('applique la taille et l\'épaisseur de trait par défaut au <svg>', () => {
    const fixture = createFixture();
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.getAttribute('height')).toBe('18');
    expect(svg.getAttribute('stroke-width')).toBe('1.75');
  });

  it('reflète une taille et une épaisseur de trait personnalisées', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('size', 32);
    fixture.componentRef.setInput('strokeWidth', 2.5);
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('stroke-width')).toBe('2.5');
  });

  it('rend un tracé (au moins un enfant SVG) pour chaque icône du registre', () => {
    for (const name of ALL_ICON_NAMES) {
      const fixture = createFixture();
      fixture.componentRef.setInput('name', name);
      fixture.detectChanges();
      const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;
      expect(svg.children.length, `icône "${name}" ne rend aucun tracé`).toBeGreaterThan(0);
      fixture.destroy();
    }
  });
});
