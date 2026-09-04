import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { BudgetStore } from './budget-store.service';

// À exécuter APRÈS authGuard (l'utilisateur est déjà connecté à ce stade).
// Résout le foyer du compte connecté : s'il n'en a aucun, redirige vers
// l'écran d'accueil dédié (créer/rejoindre) plutôt que d'afficher un
// tableau de bord vide ou de laisser une écriture échouer plus tard sans
// explication claire (voir BudgetStore.hid()).
export const householdGuard: CanActivateFn = async () => {
  const store = inject(BudgetStore);
  const router = inject(Router);

  if (!store.householdId()) {
    await store.resolveHousehold();
  }
  if (store.needsHouseholdSetup()) {
    router.navigate(['/setup-household']);
    return false;
  }
  return true;
};

// Pour la route /setup-household elle-même : si le compte a déjà un
// foyer, inutile de revoir cet écran — direction le tableau de bord.
export const alreadyHasHouseholdGuard: CanActivateFn = async () => {
  const store = inject(BudgetStore);
  const router = inject(Router);

  if (!store.householdId() && !store.needsHouseholdSetup()) {
    await store.resolveHousehold();
  }
  if (store.householdId()) {
    router.navigate(['/']);
    return false;
  }
  return true;
};
