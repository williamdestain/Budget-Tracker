import { Injectable, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

// Authentification simple : un seul compte partagé pour Moi + Madame
// (pas de gestion multi-comptes, pas d'inscription en libre-service —
// le compte est créé une fois manuellement dans le dashboard Supabase).
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<Session | null>(null);
  readonly isReady = signal(false);

  constructor(private supabase: SupabaseService) {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      this.isReady.set(true);
    });
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
    });
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password,
    });
    return error ? error.message : null;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }

  isLoggedIn(): boolean {
    return this.session() !== null;
  }
}
