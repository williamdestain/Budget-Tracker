import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { RoutePlaceholder } from './route-placeholder';

function createFixture(data: Record<string, unknown> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ActivatedRoute, useValue: { snapshot: { data } } }],
  });
  const fixture = TestBed.createComponent(RoutePlaceholder);
  fixture.detectChanges();
  return fixture;
}

describe('RoutePlaceholder', () => {
  it('affiche le titre et la note fournis par la route', () => {
    const fixture = createFixture({ navTitle: 'Rapports', placeholderNote: 'Bientôt disponible.' });
    expect(fixture.componentInstance.title).toBe('Rapports');
    expect(fixture.componentInstance.note).toBe('Bientôt disponible.');
  });

  it('retombe sur une note par défaut quand la route n\'en fournit pas', () => {
    const fixture = createFixture({ navTitle: 'Rapports' });
    expect(fixture.componentInstance.note).toContain('Phase 2');
  });

  it('retombe sur un titre vide quand la route n\'en fournit pas', () => {
    const fixture = createFixture({});
    expect(fixture.componentInstance.title).toBe('');
  });
});
