import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './modal';

function createFixture(title = 'Ajouter une transaction') {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(Modal);
  fixture.componentRef.setInput('title', title);
  fixture.detectChanges();
  return fixture;
}

describe('Modal', () => {
  it('affiche le titre fourni', () => {
    const fixture = createFixture('Répartir un versement');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Répartir un versement',
    );
  });

  it('émet closed() lors de la touche Échap', () => {
    const fixture = createFixture();
    const spy = vi.fn();
    fixture.componentInstance.closed.subscribe(spy);
    fixture.componentInstance.onEscape();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('émet closed() sur un clic du fond (backdrop), pas sur un clic du panneau', () => {
    const fixture = createFixture();
    const spy = vi.fn();
    fixture.componentInstance.closed.subscribe(spy);

    const backdrop = document.createElement('div');
    const panel = document.createElement('div');

    // Clic sur le fond lui-même (target === currentTarget) : ferme.
    fixture.componentInstance.onBackdropClick({
      target: backdrop,
      currentTarget: backdrop,
    } as unknown as MouseEvent);
    expect(spy).toHaveBeenCalledOnce();

    // Clic sur un enfant (le panneau) qui a fait remonter l'évènement
    // jusqu'au fond : target !== currentTarget, ne ferme pas.
    fixture.componentInstance.onBackdropClick({
      target: panel,
      currentTarget: backdrop,
    } as unknown as MouseEvent);
    expect(spy).toHaveBeenCalledOnce();
  });
});
