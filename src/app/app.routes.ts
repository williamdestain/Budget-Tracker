import { Routes } from '@angular/router';
import { authGuard } from './core/services/auth.guard';
import { householdGuard, alreadyHasHouseholdGuard } from './core/services/household.guard';
import { AppShell } from './shared/layout/app-shell/app-shell';
import { RoutePlaceholder } from './shared/layout/route-placeholder/route-placeholder';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'setup-household',
    loadComponent: () =>
      import('./features/auth/setup-household/setup-household').then((m) => m.SetupHousehold),
    canActivate: [authGuard, alreadyHasHouseholdGuard],
  },
  // Phase 1 (plan-industrialisation.md) : AppShell héberge la navigation
  // (sidebar bureau / barre du bas mobile) pour les 8 destinations, plus
  // /carte-de-credit le temps de la preuve de concept de la vague A. Un
  // seul canActivate ici protège aussi tous les enfants.
  {
    path: '',
    component: AppShell,
    canActivate: [authGuard, householdGuard],
    children: [
      { path: '', redirectTo: 'tableau-de-bord', pathMatch: 'full' },
      {
        path: 'tableau-de-bord',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.Dashboard),
        data: { navTitle: 'Tableau de bord' },
      },
      {
        path: 'mouvements',
        loadComponent: () =>
          import('./shared/layout/route-placeholder/route-placeholder').then(
            (m) => m.RoutePlaceholder,
          ),
        data: { navTitle: 'Mouvements' },
      },
      {
        path: 'budget',
        loadComponent: () =>
          import('./shared/layout/route-placeholder/route-placeholder').then(
            (m) => m.RoutePlaceholder,
          ),
        data: { navTitle: 'Budget & enveloppes' },
      },
      {
        path: 'epargne',
        loadComponent: () =>
          import('./shared/layout/route-placeholder/route-placeholder').then(
            (m) => m.RoutePlaceholder,
          ),
        data: {
          navTitle: 'Épargne & objectifs',
          placeholderNote:
            'Dépend du modèle de comptes généralisé — voir MODELE.md, section 5.',
        },
      },
      {
        path: 'investissements',
        loadComponent: () =>
          import('./shared/layout/route-placeholder/route-placeholder').then(
            (m) => m.RoutePlaceholder,
          ),
        data: {
          navTitle: 'Investissements',
          placeholderNote:
            'Fonctionnalité entièrement nouvelle, rien à migrer — voir MODELE.md, section 5.',
        },
      },
      {
        path: 'comptes',
        loadComponent: () =>
          import('./shared/layout/route-placeholder/route-placeholder').then(
            (m) => m.RoutePlaceholder,
          ),
        data: {
          navTitle: 'Comptes',
          placeholderNote:
            'Dépend du modèle de comptes généralisé — voir MODELE.md, section 5.',
        },
      },
      {
        path: 'carte-de-credit',
        loadComponent: () =>
          import('./features/credit-card/credit-card/credit-card').then((m) => m.CreditCard),
        data: { navTitle: 'Carte de crédit' },
      },
      {
        path: 'rapports',
        loadComponent: () =>
          import('./shared/layout/route-placeholder/route-placeholder').then(
            (m) => m.RoutePlaceholder,
          ),
        data: { navTitle: 'Rapports' },
      },
      {
        path: 'parametres',
        loadComponent: () =>
          import('./shared/layout/route-placeholder/route-placeholder').then(
            (m) => m.RoutePlaceholder,
          ),
        data: { navTitle: 'Paramètres' },
      },
    ],
  },
  // Bac à sable Phase 0 (plan-industrialisation.md) — pas de garde
  // volontairement, pour rester consultable pendant le développement sans
  // dépendre de la connexion. À RETIRER avant la mise en production finale.
  {
    path: 'design-system',
    loadComponent: () =>
      import('./features/design-system/design-system').then((m) => m.DesignSystem),
  },
  { path: '**', redirectTo: '' },
];
