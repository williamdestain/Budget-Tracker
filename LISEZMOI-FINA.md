# FINA — projet complet (snapshot du 9 septembre 2026)

Ce zip contient **tout le projet**, pas juste les fichiers touchés : le
code original + tout ce qui a été livré depuis (Phase 0 et Phase 1), plus
les documents de planification, qui vivent maintenant à la racine du
dépôt avec les documents d'audit déjà présents.

Si vous avez déjà appliqué les 3 zips précédents
(`fina-phase0-fondations-visuelles.zip`, `fina-phase0-complement.zip`,
`fina-phase1-navigation.zip`), ce zip ne contient **rien de nouveau** —
c'est le même état, juste consolidé en un seul endroit pour éviter de
devoir suivre plusieurs archives.

## Vérifié avant livraison

- `ng build` (développement **et production**) : ✅
- `ng test` : ✅ **271 tests passent, 0 régression.**

## Correctif du 9 septembre

Un plantage au tout premier chargement (`Cannot read properties of
undefined (reading 'data')` dans `AppShell`) a été trouvé en lançant
l'appli pour de vrai — ni le build ni les tests unitaires en isolation ne
pouvaient l'attraper. Corrigé, et couvert par un nouveau test qui
reproduit l'erreur exacte avant de confirmer le correctif. Détails dans
`plan-industrialisation.md`, section Phase 1.

## Où trouver quoi

- `plan-industrialisation.md` — le plan complet, avec l'état vrai de
  chaque phase (✅ fait / ⬜ pas fait). **Toujours commencer par ce
  fichier** pour savoir où on en est.
- `MODELE.md` — le modèle financier canonique (entités, règles de calcul,
  ce qui est vérifié dans le code vs conçu pour plus tard).
- `FINA-feuille-de-route-produit.md` — la feuille de route pour devenir un
  vrai produit (légal, bancaire, affaires), au-delà de la refonte visuelle.
- `FINA-concept-et-pages.md` — le concept et la description page par page
  du prototype fusionné.

## État actuel

- **Phase 0** (fondations visuelles) : ✅ complète.
- **Phase 1** (architecture de navigation) : ✅ complète.
- **Phase 2** (migration écran par écran) : en cours — vague A, écran 1
  (**Carte de crédit**) ✅ fait. Prochaine étape précise : **Rapports**
  (écran 2).

## Pour démarrer

```bash
npm install
npm start     # naviguer entre les 9 destinations
npm run build # confirmer que le build de production passe aussi chez vous
npm test      # confirmer les 271 tests toujours au vert
```
