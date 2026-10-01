import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, it, expect, vi } from 'vitest';
import { AppShell } from './app-shell';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { AuthService } from '../../../core/services/auth.service';
import { ExpenseForm } from '../../../features/expenses/expense-form/expense-form';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';

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
    activeOwner: signal<string>('3f9c1c1e-0000-4000-8000-000000000001'),
    memberOptions: () => [
      { id: '3f9c1c1e-0000-4000-8000-000000000001', name: 'Alex', color: '#4a6fa1' },
      { id: '3f9c1c1e-0000-4000-8000-000000000002', name: 'Sam', color: '#a15385' },
    ],
    // Lus par les formulaires de la fenêtre « Ajouter » quand elle s'ouvre.
    myMemberId: () => '3f9c1c1e-0000-4000-8000-000000000001',
    activeCategoryNames: signal(['Épicerie']),
    addExpense: vi.fn().mockResolvedValue({}),
    addIncome: vi.fn().mockResolvedValue(undefined),
    addRecurringIncome: vi.fn().mockResolvedValue({}),
  } as unknown as BudgetStore;
}

const testRoutes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      { path: 'tableau-de-bord', component: FakePage, data: { navTitle: 'Tableau de bord', showAdd: true } },
      { path: 'budget', component: FakePage, data: { navTitle: 'Budget & enveloppes' } },
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

  describe('fenêtre « Ajouter »', () => {
    async function open(selector: string) {
      const harness = await RouterTestingHarness.create('/tableau-de-bord');
      await harness.fixture.whenStable();
      const root = harness.routeNativeElement as HTMLElement;
      (root.querySelector(selector) as HTMLElement).click();
      harness.fixture.detectChanges();
      await harness.fixture.whenStable();
      return { harness, root };
    }

    it('le « + » de la barre du bas est un bouton (plus un lien vers /mouvements) et ouvre la fenêtre', async () => {
      const { harness, root } = await open('.tab-item--fab');
      expect((root.querySelector('.tab-item--fab') as HTMLElement).tagName).toBe('BUTTON');
      expect(root.querySelector('app-modal [aria-label="Ajouter"]')).not.toBeNull();
      expect(root.querySelector('app-add-transaction')).not.toBeNull();
      // Ouvrir la fenêtre ne change pas de page.
      expect(TestBed.inject(Router).url).toBe('/tableau-de-bord');
      expect(harness.routeDebugElement).not.toBeNull();
    });

    it("le bouton « Ajouter » de la barre du haut (bureau) ouvre la même fenêtre", async () => {
      const { root } = await open('.add-desktop button');
      expect(root.querySelector('app-add-transaction')).not.toBeNull();
    });

    it("le bouton « Ajouter » de la barre du haut n'apparaît que sur les routes qui le demandent", async () => {
      const harness = await RouterTestingHarness.create('/tableau-de-bord');
      await harness.fixture.whenStable();
      const root = harness.routeNativeElement as HTMLElement;
      expect(root.querySelector('.add-desktop')).not.toBeNull();

      await harness.navigateByUrl('/budget');
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
      expect(root.querySelector('.add-desktop')).toBeNull();
      // Le « + » de la barre du bas (mobile) reste, lui, sur toutes les pages.
      expect(root.querySelector('.tab-item--fab')).not.toBeNull();

      await harness.navigateByUrl('/tableau-de-bord');
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
      expect(root.querySelector('.add-desktop')).not.toBeNull();
    });

    it("n'affiche aucune fenêtre tant qu'on n'a pas cliqué", async () => {
      const harness = await RouterTestingHarness.create('/tableau-de-bord');
      await harness.fixture.whenStable();
      expect((harness.routeNativeElement as HTMLElement).querySelector('app-add-transaction')).toBeNull();
    });

    it('se ferme avec la touche Échap', async () => {
      const { harness, root } = await open('.tab-item--fab');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      harness.fixture.detectChanges();
      expect(root.querySelector('app-add-transaction')).toBeNull();
    });

    it('se ferme avec la croix', async () => {
      const { harness, root } = await open('.tab-item--fab');
      (root.querySelector('.modal-close') as HTMLElement).click();
      harness.fixture.detectChanges();
      expect(root.querySelector('app-add-transaction')).toBeNull();
    });

    it('se ferme une fois la dépense enregistrée', async () => {
      const { harness, root } = await open('.tab-item--fab');
      const form = harness.fixture.debugElement.query(By.directive(ExpenseForm)).componentInstance as ExpenseForm;
      form.amount = 42;
      await form.submit();
      harness.fixture.detectChanges();
      expect(root.querySelector('app-add-transaction')).toBeNull();
    });

    it("un seul champ « Montant » dans la page (pas d'id dupliqué avec un formulaire en ligne)", async () => {
      const { root } = await open('.tab-item--fab');
      expect(root.querySelectorAll('#exp-amount').length).toBe(1);
    });
  });
});
