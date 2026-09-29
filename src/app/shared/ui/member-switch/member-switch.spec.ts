import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MemberSwitch, SwitchMember } from './member-switch';

const MEMBERS: SwitchMember[] = [
  { id: 'moi', name: 'Moi', color: '#4a6fa1' },
  { id: 'madame', name: 'Madame', color: '#a15385' },
];

function createFixture(activeId = 'moi', members = MEMBERS) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(MemberSwitch);
  fixture.componentRef.setInput('members', members);
  fixture.componentRef.setInput('activeId', activeId);
  fixture.detectChanges();
  return fixture;
}

describe('MemberSwitch', () => {
  it('rend un bouton par membre, avec son nom', () => {
    const fixture = createFixture();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.member-switch-btn',
    );
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent?.trim()).toBe('Moi');
    expect(buttons[1].textContent?.trim()).toBe('Madame');
  });

  it('marque uniquement le membre actif avec la classe active', () => {
    const fixture = createFixture('madame');
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.member-switch-btn',
    );
    expect(buttons[0].classList.contains('member-switch-btn--active')).toBe(false);
    expect(buttons[1].classList.contains('member-switch-btn--active')).toBe(true);
  });

  it('émet select avec l\'id du membre cliqué', () => {
    const fixture = createFixture('moi');
    const spy = vi.fn();
    fixture.componentInstance.select.subscribe(spy);
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.member-switch-btn',
    );
    (buttons[1] as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith('madame');
  });

  it('ne fait aucune hypothèse sur le nombre de membres (0, 1 ou plusieurs)', () => {
    expect(() => createFixture('x', [])).not.toThrow();
    const one = createFixture('solo', [{ id: 'solo', name: 'Solo', color: '#000' }]);
    expect(
      (one.nativeElement as HTMLElement).querySelectorAll('.member-switch-btn').length,
    ).toBe(1);
  });
});
