import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

function createAuth(session: unknown = null, signInError: { message: string } | null = null) {
  const getSession = vi.fn().mockResolvedValue({ data: { session } });
  const onAuthStateChange = vi.fn();
  const signInWithPassword = vi.fn().mockResolvedValue({ error: signInError });
  const signOut = vi.fn().mockResolvedValue(undefined);
  const supabase = {
    client: {
      auth: { getSession, onAuthStateChange, signInWithPassword, signOut },
    },
  } as unknown as SupabaseService;

  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: supabase }],
  });
  return {
    auth: TestBed.inject(AuthService),
    getSession,
    onAuthStateChange,
    signInWithPassword,
    signOut,
  };
}

describe('AuthService', () => {
  it('attend la session initiale et considère l’utilisateur comme connecté', async () => {
    const { auth, getSession } = createAuth({ access_token: 'tok' });

    await auth.waitUntilReady();

    expect(getSession).toHaveBeenCalledOnce();
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.isReady()).toBe(true);
  });

  it('renvoie le message d’erreur de connexion ou null en cas de succès', async () => {
    const ok = createAuth(null, null);
    await ok.auth.waitUntilReady();
    await expect(ok.auth.signIn('a@b.c', 'secret')).resolves.toBeNull();
    expect(ok.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'secret' });

    TestBed.resetTestingModule();
    const fail = createAuth(null, { message: 'Invalid login' });
    await fail.auth.waitUntilReady();
    await expect(fail.auth.signIn('a@b.c', 'bad')).resolves.toBe('Invalid login');
  });

  it('délègue la déconnexion à Supabase', async () => {
    const { auth, signOut } = createAuth();
    await auth.waitUntilReady();
    await auth.signOut();
    expect(signOut).toHaveBeenCalledOnce();
  });
});
