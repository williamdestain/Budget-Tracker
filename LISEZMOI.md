# Phase 1 — Architecture de navigation

Décompressez à la racine du dépôt, puis `npm install` (2 nouvelles
dépendances ajoutées, voir plus bas) avant `git diff` / commit.

## Vérifié avant livraison

- `ng build --configuration development` : ✅
- **`ng build` (production, vrais budgets) : ✅** — voir la découverte
  ci-dessous, c'est ce qui a manqué de casser cette livraison.
- `ng test` : ✅ **266 tests passent, 0 régression.**

## Une vraie découverte en vérifiant le build de production

Le chargement des polices en CDN (Google Fonts) posé en Phase 0 **faisait
échouer `ng build` de production** : l'optimiseur Angular essaie d'inliner
le CSS des polices au moment du build (pas seulement au chargement dans le
navigateur), ce qui suppose que **la machine qui build** ait accès à
`fonts.googleapis.com` — pas seulement l'utilisateur final. Dans mon
environnement de vérification, ce domaine est bloqué, donc le build a
échoué avec une erreur 403.

Est-ce que ça aurait aussi échoué sur votre CI GitHub Actions ? Probablement
pas (les runners GitHub ont un accès internet non restreint, en général) —
mais je ne peux pas le garantir depuis ici, et j'avais déjà noté cette
dépendance comme un risque à corriger "en production" dans mon commentaire
de code de la Phase 0. Plutôt que de vous laisser découvrir ça au premier
push, j'ai corrigé maintenant : les polices sont **auto-hébergées** via
`@fontsource/fraunces` et `@fontsource/ibm-plex-sans` (deux nouvelles
dépendances npm, aucun réseau externe requis au build ni à l'exécution).

## Fichiers modifiés (6)

- `src/app/app.routes.ts` — restructuré : `AppShell` héberge maintenant les
  9 routes (8 destinations + `/carte-de-credit` temporaire) sous un seul
  `canActivate`. `/tableau-de-bord` charge le `Dashboard` existant, sans
  aucune modification. Les 8 autres routes chargent un composant
  `RoutePlaceholder` générique (voir plus bas).
- `src/styles.scss` — polices auto-hébergées (voir plus haut).
- `src/index.html` — retrait des balises Google Fonts (remplacées par
  l'import dans `styles.scss`).
- `src/app/shared/ui/icon/icon-names.ts` et `icon.html` — ajout de
  l'icône `more` (3 points), utilisée par l'onglet "Plus" de la barre
  mobile.
- `package.json` / `package-lock.json` — 2 dépendances ajoutées
  (`@fontsource/fraunces`, `@fontsource/ibm-plex-sans`).

## Fichiers ajoutés (6)

- `src/app/shared/layout/app-shell/` — la coquille de navigation :
  sidebar bureau (7 destinations + Paramètres + déconnexion), barre du bas
  mobile (Accueil, Mouvements, bouton **+**, Budget, Plus), en-tête avec
  navigation de mois et sélecteur de membre. Le sélecteur de membre et le
  mois sont **branchés sur le vrai store** (`store.activeOwner`,
  `store.current`) — pas des données de démonstration.
- `src/app/shared/layout/route-placeholder/` — un seul composant pour les
  8 destinations pas encore construites, plutôt que 8 fichiers presque
  identiques. Le titre et la note viennent de `data` sur la route.

## Une redondance temporaire, attendue

En ouvrant `/tableau-de-bord`, vous verrez **deux** sélecteurs de mois et
**deux** sélecteurs de profil : ceux du nouveau `AppShell`, et ceux que
`Dashboard` a toujours eus dans son propre en-tête. C'est volontaire —
Phase 1 ne touche à aucun fichier de `Dashboard` (routing seulement,
comme prévu). Cette redondance disparaît dès que "Tableau de bord" est
migré en Phase 2 (vague A, écran 3).

Le bouton **+** de la barre mobile navigue vers Mouvements plutôt
qu'ouvrir directement une modale d'ajout : le vrai formulaire est un
composant de Phase 2, pas de la coquille de navigation.

## Pour vérifier chez vous

```bash
npm install
npm start     # naviguer entre les 9 destinations, vérifier mois/profil
npm run build # confirmer que le build de production passe aussi chez vous
npm test      # confirmer les 266 tests toujours au vert
```

## Prochaine étape

**Carte de crédit** comme preuve de concept de la vague A (Phase 2) — la
première vraie migration d'écran, pas encore commencée.
