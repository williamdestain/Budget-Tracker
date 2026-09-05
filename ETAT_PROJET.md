# État du projet — Traqueur de Budget (Angular + Supabase)

Document de reprise pour continuer dans une nouvelle conversation sans
réimporter tout l'historique. À utiliser avec le zip du projet
(`budget-tracker-angular.zip`) et `AUDIT_PRODUCTION_FUSION.md` (l'audit de
référence à jour, qui contient le détail complet de chaque point).

## Le projet

App de budget personnel Angular 21 + Supabase, foyer "Moi"/"Madame".
Fonctionnalités : dépenses, revenus (ponctuels + récurrents), provisions
(fonds d'échéances), objectifs d'épargne, budgets par catégorie, suivi de
carte de crédit, clôture mensuelle avec report, catégories personnalisables,
import/export JSON.

**Stack** : Angular 21 (signals, `@for`/`@if`), Supabase (Postgres + Auth),
Vitest pour les tests (258 tests, 13 fichiers).

## Décisions d'architecture prises dans cette conversation

- **Revenus récurrents** : refaits sur le modèle des dépenses récurrentes —
  chaque paie est une vraie ligne datée générée automatiquement
  (`RecurringIncome` + `Income.recurringSourceId`), plus de moyenne
  mensuelle. Voir `syncRecurringIncomes()` dans le store.
- **Catégories** : gérées dynamiquement (table `categories`), plus une
  liste codée en dur. Ajout/renommage/archivage via "🏷️ Gérer les
  catégories". Renommer respecte les mois clôturés (jamais modifiés).
- **Modèle multi-foyers (le gros chantier, le P0 de l'audit)** : chaque
  personne a son propre compte Supabase Auth, relié à un foyer via
  `households`/`household_members`. RLS scoped par `household_id` sur les
  14 tables de données. Fonctions RPC `create_household()`/
  `join_household()` (code à 6 caractères). **Implémenté ET vérifié en
  conditions réelles le 4 septembre 2026** (2 comptes/1 foyer + 1 compte/
  foyer séparé, aucune fuite constatée — un bug trouvé pendant cette
  vérification a été corrigé : `resolveHousehold()` plantait dès qu'un
  foyer avait 2 membres, corrigé en filtrant par `user_id`).

## Statut du plan d'action (voir AUDIT_PRODUCTION_FUSION.md §10 pour le détail)

✅ **Fait** : tests (266), fiabilité des données (reset/export/erreurs),
modèle de compte décidé (option B), `household_id` partout, RLS réécrite
et vérifiée en réel, contraintes de longueur SQL (#6), `npm audit fix` +
Dependabot + CI (#11), concurrence `updated_at` + compare-and-swap sur
budgets par catégorie et clôtures de mois (#8), import complet et
répartition de versement transactionnels (#7, vraies transactions
Postgres, plus de rollback applicatif), nettoyage Playwright/
`test-checkbox.cjs` (#12), limite de taille du fichier importé (#13, 20 Mo).

🟡 **Partiel** : #10 (*leaked password protection* indisponible en plan
Free — compensé par longueur mini + mélange de caractères exigés, réglage
dashboard uniquement, pas rétroactif aux mots de passe déjà en place).

❌ **À faire** : inscription self-service (#9, pas urgent en usage privé) ;
Sentry (#14) ; changement d'hébergeur pour CSP (#15) ; mentions légales
(#16).

## #7 — détail de ce qui a été fait (5 septembre 2026)

Deux nouvelles RPC Postgres, toutes deux `security invoker` (les RLS déjà
en place s'appliquent normalement, aucun contournement) :

- `split_versement_into_provisions()` (migration-021) : crée la dépense
  "Versement" (ou réutilise une existante) ET tous les ajustements de
  provision dans une seule transaction.
- `import_household_data()` (migration-022) : va plus loin que prévu au
  départ — regroupe le VIDAGE (réutilise `reset_everything()` en interne,
  même transaction) ET la réécriture complète en une seule transaction.
  Toute la logique métier (mapping colonnes, génération de vrais UUID pour
  les anciens identifiants courts, dédoublonnage des catégories par nom)
  reste en TypeScript (`buildImportPayload()`) — la RPC ne fait que des
  inserts, sur des tableaux jsonb déjà entièrement construits.

Bug de dérive `schema.sql`/migrations trouvé et corrigé au passage :
`provisions.monthly_reminder` (migration-011) manquait dans `schema.sql`
— une install neuve n'aurait jamais eu cette colonne (elle est
directement référencée par `import_household_data()`).

12 tests dédiés ajoutés/adaptés (dont un test existant sur l'ancien
rollback applicatif, réécrit pour vérifier la vraie sémantique
transactionnelle : un échec ne laisse RIEN de modifié, contrairement à
l'ancien "tout revidé en compensation").

## Bug découvert en cours de route — corrigé

`reset_everything()` (RPC SQL) ne vidait pas la table `closed_months` —
contrairement à toutes les autres tables de données. Un "Réinitialiser
toutes les données" laissait donc les mois clôturés verrouillés après
coup. Trouvé en travaillant sur la concurrence (#8, même table).

**Corrigé** : `migration-020-reset-includes-closed-months.sql` (+ répercuté
dans `schema.sql`, qui ne définissait d'ailleurs jusqu'ici PAS du tout
`reset_everything()` — un autre oubli distinct, une install neuve via
`schema.sql` seul n'aurait jamais eu cette RPC ; corrigé en même temps).
Côté client, `resetEverything()` vide maintenant aussi `this.closedMonths`
et les caches de concurrence associés. Test dédié ajouté (264 tests au
total).

## Prochaine étape convenue avec l'utilisateur

Dans l'ordre :
1. ~~**Gains rapides** : #6, #11.~~ ✅ Fait.
2. ~~**Concurrence (#8)**.~~ ✅ Fait, plus le bug `reset_everything()` /
   `closed_months` découvert au passage.
3. ~~**#10** (leaked password protection).~~ 🟡 Indisponible en plan
   Free, compensé côté réglages Auth (longueur mini + mélange de
   caractères).
4. ~~**#7** (transactions RPC pour import complet + répartition de
   versement).~~ ✅ Fait, plus le bug `schema.sql`/`monthly_reminder`
   découvert au passage.
5. ~~**#12/#13** (nettoyage Playwright, limite de taille d'import).~~
   ✅ Fait.
6. Le reste (#9, #14-16) : pas urgent pour un usage à 2 comptes/1 foyer,
   à faire si l'usage grandit ou si l'app s'ouvre à d'autres foyers.

## Où sont les fichiers

- Projet de travail : `/home/claude/budget-tracker/` (dans le
  bac à sable — sera vide dans une nouvelle conversation, repartir du zip
  livré à l'utilisateur).
- Dernière livraison : `budget-tracker-angular.zip` +
  `AUDIT_PRODUCTION_FUSION.md` (contient tout l'historique détaillé des
  audits V1/V2 fusionnés, avec statut ligne par ligne).

## Conventions de travail établies

- Toujours vérifier `npx tsc --noEmit`, `ng build`, et `ng test
  --watch=false` (258 tests actuellement) avant de livrer.
- Toute nouvelle fonctionnalité touchant les données passe par : modèle
  (`budget.models.ts`) → mapper (`supabase-mappers.ts`) → store
  (`budget-store.service.ts`) → migration SQL numérotée (`supabase/
  migration-0XX-....sql`) → mise à jour de `schema.sql` pour les
  installations neuves.
- Toujours ajouter `household_id` sur toute nouvelle table/écriture
  (le store expose `this.hid()` pour ça, lève une erreur claire si le
  foyer n'est pas résolu).
- Le zip livré exclut `node_modules`/`dist`/`.angular` (à réinstaller via
  `npm install`).
