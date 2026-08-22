# Traqueur de Budget — Angular + Supabase

Réécriture de l'application (initialement un fichier HTML unique) en Angular,
avec Supabase comme backend, déployée sur GitHub Pages.

## 1. Configurer Supabase

1. Crée un compte gratuit sur [supabase.com](https://supabase.com) → **New project**.
2. Une fois le projet créé, va dans **SQL Editor** → **New query**, colle le
   contenu de [`supabase/schema.sql`](./supabase/schema.sql) et clique **Run**.
   Ça crée toutes les tables (dépenses, revenus, provisions, budgets, reports).
3. Va dans **Authentication → Users → Add user**, et crée **un seul compte**
   (courriel + mot de passe) que Moi et Madame partagerez pour vous connecter.
4. Va dans **Project Settings → API**, note :
   - **Project URL**
   - **anon public key**
5. Ouvre `src/app/core/supabase.config.ts` et colle ces deux valeurs.

## 2. Développement local

```bash
npm install
npm start
```

Ouvre http://localhost:4200 — connecte-toi avec le compte créé à l'étape 1.3.

## 3. Tests

```bash
npm test
```

Lance la suite Vitest (via `@angular/build:unit-test`, intégré nativement à
Angular CLI — pas de config Karma/Jasmine séparée à maintenir).

- **Tests unitaires** (`src/app/core/utils/*.spec.ts`) : logique métier pure
  (dates, montants, revenus récurrents, provisions, épargne) — aucune
  dépendance, rapides, la majorité de la couverture.
- **Tests d'intégration** (`src/app/core/services/budget-store.service.spec.ts`) :
  `BudgetStore` complet contre un faux client Supabase en mémoire
  (`src/app/core/testing/fake-supabase-client.ts`), pas de dépendance réseau
  ni de vraie base — vérifie que requêtes, mapping ligne↔modèle et signals
  fonctionnent bien ensemble.

Certains tests documentent volontairement des **bugs connus** plutôt que le
comportement idéal (ex. `resetEverything()` qui n'efface pas les dépenses
récurrentes — voir `AUDIT_PRODUCTION_V2.md` §3.1). Ce sont des filets de
non-régression assumés : le jour où un correctif est appliqué, le test
correspondant est censé casser, et son assertion doit être mise à jour en
connaissance de cause plutôt que d'être découverte par accident.

Un workflow GitHub Actions (`.github/workflows/tests.yml`) lance cette
suite + un build de production sur chaque push et pull request.

## 4. Déployer sur GitHub Pages

1. Pousse ce projet sur un repo GitHub.
2. Dans le repo : **Settings → Pages → Source: GitHub Actions**.
3. À chaque `git push` sur `main`, le workflow
   [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
   build l'app et la publie automatiquement.
4. L'app sera accessible à `https://<ton-utilisateur>.github.io/<nom-du-repo>/`.

## Où en est la réécriture

- [x] Authentification (compte partagé Supabase Auth)
- [x] Schéma de données Supabase (dépenses, revenus, provisions, budgets, reports)
- [x] Déploiement automatique GitHub Pages
- [x] Revenus + barre "Entrées du mois" (versements, reports)
- [x] Dépenses (liste, ajout, édition, suppression)
- [x] Provisions (cagnotte, ajustements, marquer comme payé)
- [x] Carte de crédit + remboursements
- [x] Budget mensuel + graphique
- [x] Budget par catégorie
- [x] Prévision de fin de mois
- [x] Tableau "À payer bientôt"
- [x] Dépenses récurrentes (option B : suggestion à confirmer)
- [x] Alertes intelligentes
- [x] Répartition d'un versement entre plusieurs provisions
- [x] Pourcentage d'allocation par provision (préremplit la répartition)
- [x] Clôture du mois / report de solde
- [x] Gestion des données (réinitialisation, export)
- [x] Comparaison avec le mois précédent (total + par catégorie)
- [x] Vue annuelle (12 mois : dépenses, budget, solde net, revenus, provisions, carte de crédit)
- [x] Objectifs d'épargne (accumulation libre vers une cible, sans échéance de facture)

## Corrections récentes

- **Bug des cases à cocher (Gestion des données)** : le clic sur le fond de
  la modale utilisait `(click)="a === b && fermer()"` dans le template.
  Angular annule l'action par défaut d'un événement quand un binding
  `(click)` renvoie `false` — ce qui empêchait toute case à cocher de
  basculer dès qu'on cliquait à l'intérieur de la modale (l'événement
  remonte jusqu'au fond). Remplacé par une vraie méthode
  (`onOverlayClick()`). Vérifié manuellement en local avec Playwright au
  moment du correctif (script ad hoc, non conservé dans le repo — voir
  section Tests ci-dessous pour la suite de tests réellement reproductible).
- **Profil par défaut des formulaires** : "Ajouter un revenu", "Ajouter une
  dépense" et "Dépenses récurrentes" ne reprenaient l'onglet actif (Moi/
  Madame) qu'au tout premier chargement de la page, jamais après. Corrigé
  avec un `effect()` qui garde le profil du formulaire aligné sur l'onglet
  actif en permanence.
- Réorganisation de l'ordre des sections du tableau de bord, onglets et
  navigation de mois centrés, hauteur de "Dépenses" et "Budgets par
  catégorie" plafonnée (~10 éléments visibles, défilement interne) sans
  jamais masquer complètement la section.

## Notes sur les écarts volontaires avec l'ancienne app

- **Catégorie "Revenu"** retirée du formulaire de dépenses : c'était un
  système historique remplacé depuis longtemps par la table `incomes`
  ("Entrées du mois"). Comme la base Supabase démarre vide, il n'y avait pas
  de données historiques à préserver dans cet ancien format.
- **Budget manuel / boutons ± retirés** : dans l'ancienne app, ce champ
  écrivait une valeur qui n'était en réalité **jamais relue** nulle part dès
  qu'un profil avait des revenus enregistrés (ce qui est toujours le cas ici).
  C'était une fonctionnalité fantôme, cassée. Seul le budget calculé
  automatiquement (revenus + versements reçus) a été porté, car c'est le seul
  qui fonctionnait réellement.
