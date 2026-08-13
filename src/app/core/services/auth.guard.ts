import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // Attend la relecture de la session sauvegardée (localStorage) avant de
  // juger — sinon, juste après un rafraîchissement de page, isLoggedIn()
  // renvoie faux par erreur pendant ce court instant et nous renvoie à
  // tort vers /login même si l'utilisateur est bien connecté.
  await auth.waitUntilReady();
  if (auth.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
};
