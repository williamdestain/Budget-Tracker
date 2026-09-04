import { Routes } from '@angular/router';
import { authGuard } from './core/services/auth.guard';
import { householdGuard, alreadyHasHouseholdGuard } from './core/services/household.guard';

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
  {
    path: '',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then((m) => m.Dashboard),
    canActivate: [authGuard, householdGuard],
  },
  { path: '**', redirectTo: '' },
];
