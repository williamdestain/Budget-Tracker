# Phase 0 — Fondations visuelles

Ce zip contient uniquement les fichiers touchés, avec la même arborescence
que votre projet (`src/...`) — vous pouvez le décompresser directement à la
racine de votre dépôt, ça écrasera les 4 fichiers modifiés et ajoutera les
nouveaux. Comme c'est un projet Git, faites un `git diff` juste après pour
relire chaque changement avant de commiter — je n'ai pas votre historique
Git donc je ne peux pas vous fournir un vrai patch, juste ces fichiers.

## Vérifié avant livraison

- `ng build` (configuration development) : ✅ compile sans erreur, y compris
  la nouvelle route `/design-system`.
- `ng test` : ✅ **266 tests passent, 0 régression** (13 fichiers de test) —
  rien dans `budget-store.service.ts` ni les autres fichiers de logique n'a
  été touché.

## Fichiers modifiés (4)

- `src/index.html` — chargement des polices Fraunces + IBM Plex Sans.
- `src/styles.scss` — nouvelle palette FINA. **Les noms de variables CSS
  n'ont pas changé** (`--bg`, `--accent`, `--green`, `--pink`, ...), juste
  leurs valeurs — donc tous vos écrans existants prennent déjà un peu la
  nouvelle couleur automatiquement, sans qu'on ait touché à leurs templates.
  Ajouts : `--primary`, `--primary-dark`, `--gold`, `--owner-moi` (+ leurs
  variantes), `--font-display`, `--font-body`, `--radius-lg`.
- `src/app/features/expenses/expense-list/expense-list.scss` — 2 lignes :
  le badge "Moi" utilisait `--accent` (devenu la couleur de marque), il
  utilise maintenant `--owner-moi` pour rester visuellement distinct des
  boutons. Sans ce correctif, les badges "Moi" seraient devenus verts comme
  tous les boutons de l'appli.
- `src/app/app.routes.ts` — ajout de la route `/design-system` (sans garde,
  volontairement — voir plus bas).

## Fichiers ajoutés (22)

`src/app/shared/ui/` — 5 composants réutilisables : `icon`, `button`,
`card`, `chip`, `progress-bar`, `progress-ring`. Chacun avec son `.ts`,
`.html`, `.scss`. Aucun n'est encore utilisé dans un écran réel — c'est
volontaire, la Phase 2 s'en chargera écran par écran.

`src/app/features/design-system/` — la page vitrine. Allez sur
`/design-system` après `npm start` pour voir tous les composants ensemble
(couleurs, boutons, chips, cartes, barres, anneaux, les 33 icônes).

## Ce qui n'est PAS dans cette livraison

- **`ModalComponent`** (bureau centré / feuille mobile) — plus complexe
  (accessibilité, focus, backdrop), volontairement laissé pour une prochaine
  fois plutôt que livré à moitié pensé.
- **Remplacement des emojis existants** par `<app-icon>` dans les templates
  actuels — l'infrastructure est prête (33 icônes disponibles), mais les
  toucher un par un dans les ~20 templates existants, c'est le travail de
  la Phase 2 (`plan-industrialisation.md`), pas de la Phase 0.
- Le radius (`--radius: 16px`) et les ombres (`--shadow`/`--shadow-sm`)
  n'ont volontairement pas changé de valeur : la direction FINA préfère des
  filets fins à des ombres marquées, mais retirer les ombres de tous les
  `.card` d'un coup, avant que chaque écran soit revu individuellement en
  Phase 2, risquait de donner un résultat à moitié fini plutôt qu'un vrai
  choix de design par écran.

## Pour vérifier chez vous

```bash
npm install   # si pas déjà fait
npm start     # puis ouvrir /design-system
npm test      # confirmer les 266 tests toujours au vert
```
