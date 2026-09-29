import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { Login } from './login';
import { AuthService } from '../../../core/services/auth.service';

function createFixture(signIn = vi.fn().mockResolvedValue(null)) {
  const navigate = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { signIn } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  const fixture = TestBed.createComponent(Login);
  fixture.detectChanges();
  return { fixture, signIn, navigate };
}

describe('Login', () => {
  it('appelle AuthService.signIn() avec les identifiants saisis', async () => {
    const { fixture, signIn } = createFixture();
    fixture.componentInstance.email = 'moi@exemple.com';
    fixture.componentInstance.password = 'motdepasse';

    await fixture.componentInstance.submit();

    expect(signIn).toHaveBeenCalledWith('moi@exemple.com', 'motdepasse');
  });

  it('redirige vers "/" et efface toute erreur précédente quand la connexion réussit', async () => {
    const { fixture, navigate } = createFixture(vi.fn().mockResolvedValue(null));
    fixture.componentInstance.error.set('Identifiants incorrects.');

    await fixture.componentInstance.submit();

    expect(fixture.componentInstance.error()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it("affiche un message d'erreur et ne navigue pas quand la connexion échoue", async () => {
    const { fixture, navigate } = createFixture(
      vi.fn().mockResolvedValue('Invalid login credentials'),
    );

    await fixture.componentInstance.submit();

    expect(fixture.componentInstance.error()).toBe('Identifiants incorrects.');
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('passe loading à true pendant la requête puis à false, que ça réussisse ou échoue', async () => {
    let resolveSignIn!: (v: string | null) => void;
    const pending = new Promise<string | null>((resolve) => {
      resolveSignIn = resolve;
    });
    const { fixture } = createFixture(vi.fn().mockReturnValue(pending));

    const submitPromise = fixture.componentInstance.submit();
    expect(fixture.componentInstance.loading()).toBe(true);

    resolveSignIn(null);
    await submitPromise;
    expect(fixture.componentInstance.loading()).toBe(false);
  });
});
