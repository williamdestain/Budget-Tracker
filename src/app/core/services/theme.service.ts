import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'budget-tracker:theme';

// Service minimal, sans dépendance à BudgetStore/Supabase : le thème est
// une préférence d'affichage locale à l'appareil, pas une donnée
// financière — elle n'a pas sa place dans la base partagée, et doit
// s'appliquer même sur l'écran de connexion (avant tout chargement de
// données).
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.resolveInitialTheme());

  constructor() {
    this.applyToDocument(this.theme());
  }

  toggle(): void {
    this.set(this.theme() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    this.applyToDocument(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Stockage indisponible (mode privé strict, quota, etc.) — le thème
      // reste appliqué pour la session en cours, juste pas mémorisé pour
      // la prochaine visite. Pas bloquant, on ne casse pas l'app pour ça.
    }
  }

  private resolveInitialTheme(): Theme {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // idem : stockage indisponible, on retombe sur la préférence système.
    }
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  private applyToDocument(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
