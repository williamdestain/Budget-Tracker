import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SetupHousehold } from './setup-household';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { AuthService } from '../../../core/services/auth.service';

function createFixture(opts: {
  createHousehold?: ReturnType<typeof vi.fn>;
  joinHousehold?: ReturnType<typeof vi.fn>;
  signOut?: ReturnType<typeof vi.fn>;
} = {}) {
  const navigate = vi.fn();
  const store = {
    createHousehold: opts.createHousehold ?? vi.fn().mockResolvedValue({ joinCode: 'ABC123' }),
    joinHousehold: opts.joinHousehold ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
  const auth = { signOut: opts.signOut ?? vi.fn().mockResolvedValue(undefined) };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: store },
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: { navigate } },
    ],
  });
  const fixture = TestBed.createComponent(SetupHousehold);
  fixture.detectChanges();
  return { fixture, store, auth, navigate };
}

describe('SetupHousehold', () => {
  it('create() crée le foyer (nom nettoyé), mémorise le code d\'invitation, et passe en mode "created"', async () => {
    const { fixture, store } = createFixture();
    fixture.componentInstance.displayName = '  Moi  ';

    await fixture.componentInstance.create();

    expect(store.createHousehold).toHaveBeenCalledWith('Moi');
    expect(fixture.componentInstance.joinCode()).toBe('ABC123');
    expect(fixture.componentInstance.mode()).toBe('created');
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it("create() affiche l'erreur du store et reste en mode courant si la création échoue", async () => {
    const { fixture } = createFixture({
      createHousehold: vi.fn().mockRejectedValue(new Error('Code déjà utilisé')),
    });
    fixture.componentInstance.mode.set('create');

    await fixture.componentInstance.create();

    expect(fixture.componentInstance.error()).toBe('Code déjà utilisé');
    expect(fixture.componentInstance.mode()).toBe('create');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it("join() ne fait rien si le code saisi est vide/blanc", async () => {
    const { fixture, store } = createFixture();
    fixture.componentInstance.codeInput = '   ';
    await fixture.componentInstance.join();
    expect(store.joinHousehold).not.toHaveBeenCalled();
  });

  it('join() rejoint le foyer puis navigue vers "/"', async () => {
    const { fixture, store, navigate } = createFixture();
    fixture.componentInstance.codeInput = 'XYZ789';
    fixture.componentInstance.displayName = '  Madame  ';

    await fixture.componentInstance.join();

    expect(store.joinHousehold).toHaveBeenCalledWith('XYZ789', 'Madame');
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it("join() affiche l'erreur du store et ne navigue pas si le code est invalide", async () => {
    const { fixture, navigate } = createFixture({
      joinHousehold: vi.fn().mockRejectedValue(new Error('Code invalide')),
    });
    fixture.componentInstance.codeInput = 'BADCODE';

    await fixture.componentInstance.join();

    expect(fixture.componentInstance.error()).toBe('Code invalide');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('continueToApp() navigue vers "/"', () => {
    const { fixture, navigate } = createFixture();
    fixture.componentInstance.continueToApp();
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('logout() se déconnecte puis navigue vers "/login"', async () => {
    const { fixture, auth, navigate } = createFixture();
    await fixture.componentInstance.logout();
    expect(auth.signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
