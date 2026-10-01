import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { monthLabel, nextYM, prevYM } from '../../../core/utils/date.utils';
import { AddTransaction } from '../../../features/mouvements/add-transaction/add-transaction';
import { Button } from '../../ui/button/button';
import { Icon } from '../../ui/icon/icon';
import type { IconName } from '../../ui/icon/icon-names';
import { MemberSwitch, type SwitchMember } from '../../ui/member-switch/member-switch';
import { Modal } from '../../ui/modal/modal';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

// Les 7 destinations principales (bureau : sidebar ; mobile : 3 d'entre
// elles dans la barre du bas, les 4 autres + Paramètres dans "Plus").
const MAIN_NAV: NavItem[] = [
  { path: '/tableau-de-bord', label: 'Tableau de bord', icon: 'dashboard' },
  { path: '/mouvements', label: 'Mouvements', icon: 'transactions' },
  { path: '/budget', label: 'Budget & enveloppes', icon: 'envelope' },
  { path: '/epargne', label: 'Épargne & objectifs', icon: 'target' },
  { path: '/investissements', label: 'Investissements', icon: 'trending' },
  { path: '/comptes', label: 'Comptes', icon: 'wallet' },
  { path: '/rapports', label: 'Rapports', icon: 'chart' },
];

// Ce qui ne tient pas dans la barre du bas mobile (3 emplacements + le
// bouton "+" + Paramètres) part dans la feuille "Plus".
const MORE_NAV: NavItem[] = [
  { path: '/epargne', label: 'Épargne & objectifs', icon: 'target' },
  { path: '/investissements', label: 'Investissements', icon: 'trending' },
  { path: '/comptes', label: 'Comptes', icon: 'wallet' },
  { path: '/rapports', label: 'Rapports', icon: 'chart' },
  { path: '/parametres', label: 'Paramètres', icon: 'settings' },
];

// Coquille commune à toutes les routes authentifiées (voir app.routes.ts) :
// sidebar/barre du bas de navigation, en-tête (mois + membre), et
// <router-outlet> pour le contenu de la page active.
//
// Volontairement, ce composant ne touche à rien dans Dashboard : tant que
// la Phase 2 n'a pas migré /tableau-de-bord, cette page garde SON PROPRE
// en-tête (sélecteur Moi/Madame/Global, navigation de mois) en plus de
// celui-ci — une redondance visuelle temporaire et attendue, qui disparaît
// dès que /tableau-de-bord est migré (voir plan-industrialisation.md).
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AddTransaction, Button, Icon, MemberSwitch, Modal],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  private readonly router = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  readonly store = inject(BudgetStore);

  readonly mainNav = MAIN_NAV;
  readonly moreNav = MORE_NAV;
  readonly showMore = signal(false);

  // Fenêtre « Ajouter » (dépense ou revenu), ouverte depuis n'importe quelle
  // page : bouton « + » de la barre du bas (mobile) et bouton « Ajouter » de
  // la barre du haut (bureau).
  readonly addOpen = signal(false);

  // Titre affiché dans l'en-tête, tiré de `data.navTitle` de la route
  // active la plus profonde (voir app.routes.ts). Recalculé à chaque
  // navigation terminée.
  //
  // Valeur initiale volontairement vide plutôt que calculée ici : au
  // moment où le constructeur de AppShell s'exécute, le routeur n'a pas
  // encore fini d'attacher l'arbre ActivatedRoute des enfants (le
  // <router-outlet> ne s'active qu'après la construction du parent) — lire
  // `.snapshot` à cet instant plante (`Cannot read properties of undefined
  // (reading 'data')`). Le tout premier NavigationEnd (qui arrive de toute
  // façon très vite, avant que l'utilisateur ne voie quoi que ce soit)
  // remplit le vrai titre via l'abonnement ci-dessous.
  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.leafTitle()),
    ),
    { initialValue: '' },
  );

  // Bouton « Ajouter » de la barre du haut (bureau) : seulement sur les routes
  // qui le demandent (`data.showAdd`, voir app.routes.ts) — Mouvements et le
  // tableau de bord, comme dans le prototype où seul Mouvements l'a. Partout
  // ailleurs il n'apporte rien et encombre l'en-tête. Mobile : le « + » de la
  // barre du bas reste disponible sur toutes les pages.
  readonly showAdd = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.leafData('showAdd') === true),
    ),
    { initialValue: false },
  );

  private leafData(key: string): unknown {
    let r: ActivatedRoute | null = this.activatedRoute;
    while (r?.firstChild) r = r.firstChild;
    return r?.snapshot?.data?.[key];
  }

  private leafTitle(): string {
    return (this.leafData('navTitle') as string | undefined) ?? '';
  }

  // Membres réels du foyer, chargés par BudgetStore, plus la vue agrégée.
  // Aucun repli « Moi / Madame » : la migration 024 est en production, et un
  // repli inventé masquerait un vrai problème de chargement.
  readonly members = computed<SwitchMember[]>(() => [
    ...this.store.memberOptions(),
    { id: 'global', name: 'Global', color: 'var(--accent)' },
  ]);

  get monthLabel(): string {
    return monthLabel(this.store.current());
  }

  prevMonth(): void {
    this.store.current.set(prevYM(this.store.current()));
  }

  nextMonth(): void {
    this.store.current.set(nextYM(this.store.current()));
  }

  openAdd(): void {
    this.addOpen.set(true);
  }

  selectMember(id: string): void {
    this.store.activeOwner.set(id);
  }

  logout(): void {
    this.auth.signOut();
  }
}
