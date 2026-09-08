# Phase 0 — Complément (Modal, graphiques, sélecteur de membres)

Deuxième et dernier lot de la Phase 0 — fait suite à
`fina-phase0-fondations-visuelles.zip`. Mêmes consignes : décompressez à la
racine du dépôt, `git diff` avant de commiter.

## Vérifié avant livraison

- `ng build` (configuration development) : ✅ compile sans erreur.
- `ng test` : ✅ **266 tests passent, 0 régression.**

## Fichiers modifiés (3)

`src/app/features/design-system/` (`.ts`/`.html`/`.scss`) — la vitrine
affiche maintenant les 4 nouveaux composants en plus des 6 précédents.

## Fichiers ajoutés (12)

- `src/app/shared/ui/modal/` — fenêtre centrée sur bureau, feuille qui
  remonte du bas sous 768px (vraie media query). Ferme au clic sur le
  fond, au clic sur le bouton, ou avec Échap. Chaque écran l'inclut dans
  son propre template derrière un `@if` local — volontairement pas de
  service dédié comme pour `ToastComponent`, puisque le contenu projeté
  est trop varié (formulaire, liste...) pour transiter proprement par un
  service. Point non couvert : un vrai piège à focus (cycler Tab à
  l'intérieur) — juste le focus initial et Échap.
- `src/app/shared/ui/donut-chart/` — répartition par catégorie ou
  allocation de portefeuille, légende intégrée.
- `src/app/shared/ui/bar-line-chart/` — **un seul composant** pour la vue
  annuelle (barres + ligne) et l'évolution du portefeuille (ligne seule) ;
  remplace les deux composants prévus séparément dans
  `plan-industrialisation.md` (voir ce fichier pour le pourquoi).
- `src/app/shared/ui/member-switch/` — rendu dynamique à partir d'un
  tableau de membres, pas de "Moi"/"Madame" codés en dur dans le
  composant. La vitrine lui passe un tableau statique à 2 entrées pour
  l'instant (voir `MODELE.md`, section 6, pour le vrai câblage plus tard).

## État de la Phase 0 après cette livraison

Complète, à l'exception du remplacement des emojis dans les templates
existants — explicitement le travail de la Phase 2, pas de la Phase 0
(voir `plan-industrialisation.md`, mis à jour).

## Pour vérifier chez vous

```bash
npm start     # puis ouvrir /design-system
npm test      # confirmer les 266 tests toujours au vert
```
