import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, it, expect, vi } from 'vitest';
import { AppShell } from './app-shell';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { AuthService } from '../../../core/services/auth.service';

// Régression : la toute première version de AppShell calculait le titre de
// page (leafTitle()) directement dans l'initialiseur de champ, en lisant
// `ActivatedRoute.firstChild.snapshot.data`. Au moment où le constructeur
// de AppShell s'exécute, le routeur n'a pas encore fini d'attacher l'arbre
// des routes enfants (le <router-outlet> ne s'active qu'après la
// construction du parent) — ce qui plantait avec "Cannot read properties
// of undefined (reading 'data')" dès le premier chargement réel de
// l'appli. `ng build` et les tests unitaires en isolation ne l'ont pas
// détecté, puisque rien ne construisait AppShell via une vraie navigation
// imbriquée. Ce fichier corrige cet angle mort.

@Component({ selector: 'app-fake-page', template: 'page' })
class FakePage {}

function makeFakeStore(): BudgetStore {
  return {
    current: signal('2026-08'),
    activeOwner: signal<'moi' | 'madame' | 'global'>('moi'),
  } as unknown as BudgetStore;
}

const testRoutes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      { path: 'tableau-de-bord', component: FakePage, data: { navTitle: 'Tableau de bord' } },
    ],
  },
];

describe('AppShell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(testRoutes),
        { provide: BudgetStore, useValue: makeFakeStore() },
        { provide: AuthService, useValue: { signOut: vi.fn() } },
      ],
    });
  });

  it('se construit sans erreur quand le routeur active une route enfant', async () => {
    const harness = await RouterTestingHarness.create('/tableau-de-bord');
    expect(harness.routeDebugElement?.componentInstance).toBeInstanceOf(AppShell);
  });

  it("affiche le navTitle de la route enfant une fois la navigation terminée", async () => {
    const harness = await RouterTestingHarness.create('/tableau-de-bord');
    await harness.fixture.whenStable();
    const shell = harness.routeDebugElement?.componentInstance as AppShell;
    expect(shell.pageTitle()).toBe('Tableau de bord');
  });
});
