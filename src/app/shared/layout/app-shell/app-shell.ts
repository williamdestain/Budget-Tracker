import { Component, inject, signal } from '@angular/core';
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
import { OWNERS } from '../../../core/utils/categories';
import { monthLabel, nextYM, prevYM } from '../../../core/utils/date.utils';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, MemberSwitch, Modal],
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

  private leafTitle(): string {
    let r: ActivatedRoute | null = this.activatedRoute;
    while (r?.firstChild) r = r.firstChild;
    return (r?.snapshot?.data?.['navTitle'] as string | undefined) ?? '';
  }

  // Tableau statique temporaire — reproduit "Moi"/"Madame"/"Global" en
  // attendant la vraie table `members` (MODELE.md section 6). Les couleurs
  // référencent les tokens existants (--owner-moi, --pink, --accent), pas
  // des valeurs figées, donc le mode sombre s'applique automatiquement.
  readonly members: SwitchMember[] = [
    { id: 'moi', name: OWNERS['moi'], color: 'var(--owner-moi)' },
    { id: 'madame', name: OWNERS['madame'], color: 'var(--pink)' },
    { id: 'global', name: 'Global', color: 'var(--accent)' },
  ];

  get monthLabel(): string {
    return monthLabel(this.store.current());
  }

  prevMonth(): void {
    this.store.current.set(prevYM(this.store.current()));
  }

  nextMonth(): void {
    this.store.current.set(nextYM(this.store.current()));
  }

  selectMember(id: string): void {
    this.store.activeOwner.set(id as 'moi' | 'madame' | 'global');
  }

  logout(): void {
    this.auth.signOut();
  }
}
