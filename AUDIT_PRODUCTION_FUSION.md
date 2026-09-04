# Audit production-readiness — Traqueur de Budget (fusion V1 + V2)

**Audits d'origine** : `AUDIT_PRODUCTION.md` (V1, 15 août 2026) et `AUDIT_PRODUCTION_V2.md` (V2, 15 août 2026, contre-expertise du même jour).
**Ce document** : fusionne les deux en une seule référence, sans redondance, et **vérifie l'état réel de chaque constat dans le code actuel** (1er septembre 2026) plutôt que de simplement recopier les deux plans côte à côte.
**Portée** : code source (Angular 21 + Supabase/Postgres), schéma SQL, hébergement (GitHub Pages), dépendances.
**Objectif déclaré** : passer d'une app privée pour un foyer (« Moi » + « Madame », compte partagé) à une app **publique**, potentiellement multi-utilisateurs.

---

## 1. Résumé exécutif

**Mise à jour (3 septembre 2026) : le P0 est implémenté.** Un modèle multi-foyers (`households`/`household_members`) remplace les policies ouvertes à tout compte authentifié — chaque compte doit maintenant créer ou rejoindre un foyer (via un code à 6 caractères) pour accéder à quoi que ce soit, et les policies RLS scopent toutes les lectures/écritures à ce foyer. **Testé unitairement (258 tests), pas encore vérifié contre une vraie base Postgres avec 2 vrais comptes** — voir la note ⚠️ dans le plan d'action (§10, ligne 5) avant de considérer ce point définitivement clos.

La V2 avait ajouté un axe que la V1 sous-estimait : des **bugs de fiabilité des données qui existent même à un seul utilisateur** (sauvegarde/réinitialisation incomplètes, absence de transactions, pas de détection de panne au chargement). **Ce bloc-là aussi est en grande partie corrigé** (voir §3).

| Catégorie | Statut actuel (vérifié aujourd'hui) | Bloquant pour le public ? |
|---|---|---|
| Isolation des données entre comptes | 🟡 Implémentée, testée unitairement — **vérification en conditions réelles (2 vrais comptes) encore à faire** | **Oui, tant que la vérification réelle n'est pas faite** |
| Fiabilité des données (reset/export/erreurs de chargement) | ✅ Corrigée depuis l'audit | Réglé |
| Atomicité des opérations (import, répartition de versement) | 🟡 Partielle (le reset est atomique, pas l'import) | Recommandé |
| Tests automatisés | ✅ 249 tests, logique métier critique couverte | Réglé |
| Authentification self-service | ❌ Toujours absente (comptes créés à la main) | Oui si self-service public |
| Validation des données (DB) | 🟡 Montants couverts, longueurs de texte non | Non, mais recommandé |
| Concurrence (2 sessions simultanées) | ❌ Toujours aucun mécanisme | Recommandé si usage simultané fréquent |
| Dépendances | ❌ Toujours 4 vulnérabilités (2 modérées, 2 élevées) | Non (pas dans le bundle livré) |
| Chiffrement transit/repos | ✅ Géré nativement (HTTPS + Supabase/Postgres) | — |
| XSS / injection | ✅ Rien trouvé | — |
| Headers de sécurité (CSP, HSTS...) | ❌ Toujours aucun (limite GitHub Pages) | Recommandé |
| Monitoring d'erreurs / sauvegardes serveur / mentions légales | ❌ Toujours absents | Recommandé avant un vrai lancement public |

---

## 2. 🔴 P0 — Isolation des données entre comptes — ✅ implémenté (option B), ⚠️ vérification réelle restante

**Ce qui a changé (3 septembre 2026)** : `migration-017-households.sql` remplace toutes les policies `using (auth.role() = 'authenticated')` par des policies scoped par foyer :
```sql
create policy "household_scoped_expenses" on expenses
  for all using (household_id = auth_household_id())
  with check (household_id = auth_household_id());
```
où `auth_household_id()` est une fonction `security definer` qui résout le foyer du compte connecté via une nouvelle table `household_members`. Chaque compte doit créer un foyer (`create_household()`) ou en rejoindre un existant via un code à 6 caractères (`join_household()`) — ces deux fonctions RPC, également `security definer`, sont les SEULES portes d'entrée pour créer un foyer ou y adhérer (aucune policy d'écriture directe sur `households`/`household_members`).

**Option retenue : B** — chaque personne a désormais son propre compte Supabase Auth, relié au même foyer via `household_members` (au lieu du compte unique partagé jusqu'ici). Le champ `owner` (`moi`/`madame`) existant reste utilisé pour l'affichage/filtrage dans l'app, mais n'est plus l'unique frontière : `household_id` est maintenant la vraie frontière de sécurité Postgres.

**Testé (258 tests automatisés)** : logique de `create_household()`/`join_household()` (un compte = un seul foyer, un foyer = un "moi" + une "madame" maximum), présence de `household_id` sur chaque écriture (27 emplacements vérifiés), vidage complet de l'état applicatif à la déconnexion (empêche qu'un 2e compte, connecté sans recharger la page, hérite un instant des données du 1er).

> ⚠️ **Ce qui N'A PAS pu être testé automatiquement** : ces tests tournent contre un faux client en mémoire, jamais contre une vraie base Postgres — ils ne peuvent donc pas confirmer que le SQL des policies RLS est syntaxiquement correct une fois réellement appliqué à Supabase, ni qu'un vrai compte B ne peut vraiment rien voir/modifier des données d'un vrai compte A. **Il reste à exécuter la migration sur le vrai projet, créer 2 vrais comptes, et vérifier à la main.**

### 2.1 Tables enfants — réglé

`provision_adjustments` et `savings_goal_contributions` ont désormais leur propre colonne `household_id` (pas seulement une clé étrangère vers leur table parente) — la lacune notée par la V2 est comblée.

### 2.2 Catégories — un jeu par foyer

Point additionnel découvert en implémentant : les catégories (ajoutées après les deux audits d'origine) sont maintenant scoped par foyer elles aussi — chaque nouveau foyer reçoit sa propre copie des 32 catégories par défaut à sa création (`create_household()` les sème), personnalisable ensuite indépendamment par foyer.

### 2.3 Ce qu'il reste à faire manuellement

1. Exécuter `migration-017-households.sql` sur le vrai projet Supabase.
2. Récupérer le code du foyer créé pour les données existantes (`select join_code from households;`).
3. Créer 2 vrais comptes dans Supabase Auth > Users (un pour toi, un pour Madame) si pas déjà fait.
4. Se connecter avec chacun dans l'app, rejoindre ce même foyer via le code (l'app affiche l'écran dédié automatiquement).
5. **Vérifier à la main** qu'un 3ᵉ compte de test, dans un foyer différent, ne voit strictement rien des données du foyer principal.

---

## 3. 🔴 P1 — Intégrité et fiabilité des données (ajout V2) — ✅ largement corrigé depuis l'audit

C'était l'apport principal de la V2 : des bugs qui affectent même l'usage actuel à un seul foyer. **Bonne nouvelle : la quasi-totalité est corrigée.**

| Constat V2 | Statut vérifié aujourd'hui |
|---|---|
| `resetEverything()` incomplet (oubliait `recurring_expenses`) | ✅ **Corrigé** — passe maintenant par une fonction RPC Postgres (`reset_everything()`, migration-008/013/015) qui supprime bien `recurring_expenses`, `recurring_incomes` et `credit_card_payments` en plus des tables déjà couvertes |
| `exportData()` incomplet (oubliait `recurringExpenses`) | ✅ **Corrigé** — `recurringExpenses: this.recurringExpenses()` bien présent dans l'export |
| `loadAll()` masque les pannes en état "aucune donnée" | ✅ **Corrigé** — signal `loadError()` + détection par table (`failedTables`), avec un composant `load-error-banner` dédié |
| Import/reset non transactionnels | 🟡 **Partiel** — le reset est maintenant atomique (RPC), **l'import reste séquentiel** (une dizaine d'`insert` indépendants depuis Angular, pas de RPC englobante) |
| Opérations métier non atomiques (`addExpense`, `splitVersementIntoProvisions`) | 🟡 **Partiel** — `splitVersementIntoProvisions()` boucle toujours séquentiellement sur `addProvisionAdjustment`, sans transaction ni détection d'échec partiel |
| Concurrence (2 sessions, même compte) | ❌ **Toujours absent** — aucune colonne `updated_at` trouvée dans `schema.sql` ni les migrations, aucun mécanisme de verrouillage optimiste |
| `owner` non lié à l'identité réelle | ❌ Constat toujours valide (rejoint le §2) — rien n'empêche un client d'envoyer `owner: "madame"` sur une entrée qui devrait être « Moi » |
| `importData()` trop permissif (pas de validation de schéma) | ✅ **Corrigé** — `validateImportPayload()` valide maintenant types/bornes/valeurs autorisées avant tout import, et le rejette *avant* de toucher aux données existantes |
| Sauvegarde pas fiable (export manuel navigateur uniquement) | 🟡 **Inchangé sur le fond** (toujours un téléchargement manuel), mais moins risqué qu'à l'audit puisque export/import sont maintenant complets et validés |

**Reste à faire sur ce bloc** : rendre l'import et la répartition de versement transactionnels (RPC), et ajouter un mécanisme de concurrence minimal (`updated_at`).

---

## 4. 🟠 P1 — Autres constats importants

### 4.1 Contraintes de validation en base — 🟡 partiellement corrigé

**Vérifié** : `migration-010-amount-check-constraints.sql` ajoute déjà `check (amount > 0)` sur `expenses`, `incomes`, `recurring_expenses`, `provisions` (+ `every_n > 0`, `allocation_percent between 0 and 100`, `rolling_count >= 0`), `provision_adjustments`, `savings_goals`, `savings_goal_contributions`, et `check (amount >= 0)` sur `category_budgets` — **exactement les exemples cités par la contre-expertise V2**, et plus complet que la demande initiale de la V1.

**Ce qui manque encore** : aucune limite de longueur sur `category`/`name`/`note` (`char_length(...) <= N`). N'importe qui avec la clé anon peut toujours insérer une catégorie de 50 000 caractères en contournant l'app.

### 4.2 Dépendances avec vulnérabilités connues — ❌ inchangé

`npm audit` relancé aujourd'hui sur le `package-lock.json` actuel rapporte **encore exactement les 4 mêmes vulnérabilités** (2 modérées, 2 élevées : `undici`, `hono`, `nanoid`, toutes via le devDependency `@angular/build` — donc toujours aucun risque direct pour le bundle livré aux visiteurs, mais `npm audit fix` n'a toujours pas été exécuté).

### 4.3 Aucun header de sécurité HTTP — ❌ inchangé

Toujours aucun `netlify.toml`/`vercel.json`/`_headers` dans le repo : l'app est toujours sur un hébergeur (GitHub Pages, à confirmer) qui ne permet pas de headers HTTP personnalisés.

### 4.4 Pas d'inscription ni de réinitialisation de mot de passe — ❌ inchangé

**Vérifié** : `src/app/features/auth/login/` ne contient toujours qu'un `signIn(email, password)`. Aucune trace de `signUp` ni `resetPasswordForEmail` dans le code. Cohérent avec le modèle actuel (comptes créés à la main), mais bloquant pour du self-service public.

### 4.5 Import de fichier — validation de schéma faite, limite de taille manquante

**Vérifié** : `validateImportPayload()` couvre maintenant la validation de schéma en profondeur (voir §3), y compris pour les entités ajoutées depuis l'audit (`recurringIncomes`, `categories`). En revanche, `onFileSelected()` dans `data-management.ts` ne vérifie toujours pas la taille du fichier avant de le lire (`file.text()` direct, sans garde-fou).

### 4.6 Messages d'erreur bruts remontés à l'utilisateur — non revérifié en détail

Constat V1 non re-vérifié précisément dans cette passe ; probablement encore valide (`data-management.ts` remonte `err?.message` dans le toast). Faible priorité tant que l'usage reste privé.

---

## 5. 🟡 P2 — Tests automatisés — ✅ fait

**C'était la recommandation centrale de la V2 : verrouiller les calculs avant de toucher au schéma de données (§2).** C'est fait.

**Vérifié** : la suite est passée d'un seul fichier boilerplate à **249 tests sur 13 fichiers** :
- Utils purs, dans l'ordre recommandé par la V2 : `provision.utils.spec.ts` (59 tests), `income.utils.spec.ts`, `savings.utils.spec.ts`, `date.utils.spec.ts`, `recurring-expense.utils.spec.ts`, `categories.spec.ts`, `currency.utils.spec.ts`.
- `budget-store.service.spec.ts` : **102 tests d'intégration** avec un faux client Supabase en mémoire — calculs de budget, clôture de mois (et son report, corrigé récemment pour les deux profils), catégories dynamiques (ajout/renommage/archivage, y compris le respect des mois clôturés), revenus récurrents, cartes de crédit.
- Quelques composants (`money-pulse`, `load-error-banner`, `versement-splitter`, `app`, `theme.service`).

**Ce qui manque encore** : aucun test ne peut couvrir la RLS au sens strict (isolation entre deux vrais comptes) tant que le §2 n'est pas implémenté — normal, ce n'est testable qu'une fois le modèle de données changé. Aucun test E2E Playwright réellement intégré non plus (voir §6.1).

---

## 6. 🟡 P2 — Points additionnels

### 6.1 Playwright / README — 🟡 partiellement corrigé

**Au moment de l'audit** : `test-checkbox.cjs` pointait vers un chemin absolu propre au sandbox où il avait été écrit, `playwright` n'apparaissait nulle part dans `package.json`, et le README affirmait de façon non vérifiable « vérifié avec un test automatisé (Playwright) ».

**Vérifié aujourd'hui** :
- ✅ `@playwright/test` est maintenant une vraie dépendance déclarée dans `package.json`.
- ✅ Le README ne fait plus l'affirmation trompeuse — il précise explicitement que la vérification était manuelle, via un « script ad hoc, non conservé dans le repo », et renvoie vers la vraie suite de tests (§5).
- ❌ Mais `test-checkbox.cjs` **existe toujours** à la racine, avec le même chemin absolu cassé — ce qui contredit la propre affirmation du README (« non conservé dans le repo »).
- ❌ Aucun `playwright.config.ts` ni script `test:e2e` : Playwright n'est pas « réellement intégré », juste installé.

**Reste à faire** : supprimer `test-checkbox.cjs`, ou l'intégrer proprement (config + script npm) si des tests E2E sont voulus.

### 6.2 CI de sécurité — ❌ inchangé

Aucun `.github/dependabot.yml` ni job CI qui lance `npm audit`/`ng build`/tests sur chaque pull request. Aucun répertoire `.github` trouvé dans le repo actuel (la mention en V1 §7 d'un « CI/CD déjà en place » pour le déploiement n'a pas pu être vérifiée dans cette version du projet).

### 6.3 Stockage du token en `localStorage`, pas de monitoring, pas de sauvegarde serveur, pas de mentions légales — ❌ inchangés

Constats V1 (§4.1, 4.2, 4.4, 4.5) toujours valides, non re-détaillés ici pour éviter la redondance — voir les fichiers sources si besoin du détail complet.

---

## 7. 🟢 Qualité Angular / TypeScript (apport V2, toujours valide)

**Vérifié — `tsconfig.json`** : configuration stricte au-delà du minimum (`strict`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `strictTemplates`, etc.). Usage cohérent de `signal()`/`computed()`, découpage `features/`/`core/` sain.

**Point à surveiller (non urgent)** : `budget-store.service.ts` a grossi (CRUD de 8+ entités, tous les calculs métier, import/export, sync des provisions, répartition des versements, gestion des catégories) — un « God Service » encore lisible aujourd'hui grâce aux commentaires, mais à découper en facades par domaine avant que l'app ne double de taille. Plus facile à faire maintenant que les tests (§5) existent pour valider qu'aucun comportement ne change pendant le découpage.

---

## 8. Sur le chiffrement (« encodage des informations »), pour clarifier les termes

*(Section V1, toujours d'actualité — pas de changement à date.)*

- **Chiffrement en transit** : ✅ déjà fait (HTTPS partout).
- **Chiffrement au repos** : ✅ déjà fait nativement par Supabase/Postgres.
- **Chiffrement applicatif au niveau des champs** : ❌ absent, et **toujours pas recommandé** pour ce type de données (montants de dépenses catégorisées) — le coût dépasse largement le bénéfice.
- **Hachage des mots de passe** : ✅ déjà géré nativement par Supabase Auth (bcrypt).

**Il n'y a pas de chantier de chiffrement à mener. Le seul chantier de confidentialité qui compte, c'est l'isolation des données entre comptes (§2).**

---

## 9. Notes par domaine

| Domaine | Note | Évolution vs. audit |
|---|---|---|
| Architecture Angular | 8/10 | Stable |
| Qualité TypeScript | 8/10 | Stable |
| Organisation du projet | 8/10 | Stable |
| Sécurité — usage actuel (foyer unique) | 6/10 | Stable |
| Sécurité — multi-utilisateurs public | 1/10 → **7/10** | **Nettement amélioré — reste la vérification en conditions réelles (§2.3)** |
| Intégrité des données | 4/10 → **7/10** | **Nettement amélioré** (reset/export/erreurs corrigés) |
| Résilience aux erreurs | 4/10 → **7/10** | **Amélioré** (`loadError`), mais concurrence toujours absente |
| Tests | 2/10 → **8/10** | **Nettement amélioré** (249 tests) |
| Préparation production (public) | 4/10 | **Inchangé** — le P0 (§2) domine toujours la note globale |

---

## 10. Plan d'action unifié et priorisé

Fusion des plans V1 (11 items) et V2 (11 phases), dédupliqués, avec le statut vérifié dans le code le 1er septembre 2026.

| # | Action | Priorité | Effort estimé | Statut |
|---|---|---|---|---|
| 1 | Tests sur la logique métier critique (utils purs, puis `BudgetStore`) | 🟡 P1 — **à faire avant le #3** | 2-3 jours | ✅ Done |
| 2 | Corriger `resetEverything` (RPC complet), `exportData` (export complet), `loadAll` (détection d'erreur par table) | 🔴 P1 | 1 jour | ✅ Done |
| 3 | Modèle de données : `household_id`/`user_id` sur les 10 tables de données **+ les 2 tables enfants** (`provision_adjustments`, `savings_goal_contributions`) | 🔴 P0 — bloquant | 1-2 jours | ✅ Done |
| 4 | Décider du modèle de compte (option A `user_id` simple vs. option B `households`/`household_members`) | 🔴 P0 | 1h de réflexion | ✅ Done — option B retenue |
| 5 | Réécrire les policies RLS scoped + **tester activement avec 2 comptes distincts** | 🔴 P0 — bloquant | Inclus dans le #3 | 🟡 Partiel — voir note ⚠️ ci-dessous
| 6 | Contraintes `check` sur les longueurs de texte (`category`/`name`/`note`) — les montants sont déjà couverts | 🟠 P1 | 1h | 🟡 Partiel |
| 7 | Transactions PostgreSQL (RPC) pour l'import complet et la répartition de versement — le reset est déjà atomique | 🟠 P1 | 1-2 jours | 🟡 Partiel |
| 8 | Concurrence : colonne `updated_at` + rechargement post-mutation sur `budgets`/`category_budgets` | 🟠 P1 | 1 jour | ❌ To Do |
| 9 | Flux inscription + mot de passe oublié + confirmation email | 🟠 P1 — seulement si self-service public | 1-2 jours | ❌ To Do |
| 10 | Activer *leaked password protection* + longueur mini dans Supabase Auth Settings | 🟠 P1 | 5 min | ❌ To Do |
| 11 | `npm audit fix` + activer Dependabot + job CI de sécurité | 🟡 P2 | 30 min - 1h | ❌ To Do |
| 12 | Supprimer `test-checkbox.cjs` (orphelin) ou intégrer Playwright proprement (config + script `test:e2e`) | 🟡 P2 | 5 min (suppression) à 1 jour (intégration complète) | 🟡 Partiel |
| 13 | Limiter la taille du fichier importé (la validation de schéma, elle, est déjà faite) | 🟢 P3 | 30 min | 🟡 Partiel |
| 14 | Monitoring d'erreurs (Sentry ou équivalent) | 🟢 P3 | 2-3h | ❌ To Do |
| 15 | Évaluer un changement d'hébergeur pour une vraie CSP/headers (Cloudflare Pages, Netlify) | 🟢 P3 | 1 jour | ❌ To Do |
| 16 | Mentions légales / politique de confidentialité si public | 🟢 P3 (légalement important) | Dépend de la juridiction | ❌ To Do |

**Ordre recommandé** : 1 ✅ → 2 ✅ → **3 → 4 → 5** (le vrai P0, rien d'autre ne compte tant que ce n'est pas fait) → 6 → 10 → 11, puis 7 et 8 (fiabilité/concurrence), puis 9 seulement si l'inscription libre est vraiment voulue, puis 12-16 selon le temps disponible.

> ⚠️ **Ligne 5 — ce qui est fait vs. ce qui reste à vérifier avant d'ouvrir l'app au public.**
> Fait et validé par 258 tests automatisés (dont 8 dédiés spécifiquement au modèle multi-foyers) : la logique métier des fonctions `create_household()`/`join_household()` (un compte = un seul foyer, un foyer = un "moi" + une "madame" maximum), la génération de `household_id` sur chaque écriture, le vidage complet de l'état du store à la déconnexion (anti-fuite si deux comptes se connectent successivement dans le même onglet sans recharger la page).
>
> **Non fait, et volontairement pas simulable par ces tests** : les tests ci-dessus tournent contre un faux client en mémoire, jamais contre une vraie base Postgres — ils ne peuvent donc pas confirmer que les *policies RLS elles-mêmes* (le SQL de `migration-017-households.sql`) sont syntaxiquement correctes une fois appliquées, ni qu'un vrai compte B ne peut vraiment rien voir/modifier des données d'un vrai compte A. **Il reste à exécuter la migration sur le vrai projet Supabase, créer 2 vrais comptes, et vérifier à la main (ou via un test Playwright, voir ligne 12) qu'un compte ne voit jamais les données de l'autre.** Tant que cette vérification manuelle n'est pas faite, ne considère pas le P0 comme définitivement clos.

**En une phrase** : le P0 est implémenté et son code testé unitairement (lignes 3 et 4 vraiment faites) — mais la ligne 5 garde un astérisque tant que la vérification en conditions réelles (2 vrais comptes Supabase) n'a pas été faite ; c'est la seule étape qui sépare encore l'app d'un vrai feu vert pour un lancement public restreint (voir l'avertissement ci-dessus).

---

## 11. Ce qui est déjà bien fait

- **Isolation des données par foyer implémentée** : modèle `households`/`household_members`, RLS scoped, fonctions RPC sécurisées pour créer/rejoindre un foyer (voir §2).
- Clé anon Supabase traitée correctement comme publique.
- Aucun XSS, injection SQL ou usage dangereux (`eval`, `innerHTML`) trouvé.
- HTTPS de bout en bout, chiffrement au repos géré nativement par Supabase.
- Migrations SQL versionnées et documentées (17 migrations à ce jour), schéma de base tenu à jour pour les installations neuves.
- **Fiabilité des données largement consolidée depuis l'audit** : reset atomique (RPC), export/import complets et validés, détection d'erreur de chargement par table.
- **Suite de tests substantielle** (258 tests) sur la logique la plus critique (provisions, revenus, budget, clôture de mois, catégories, **et maintenant le modèle multi-foyers**).
- Configuration TypeScript/Angular stricte et cohérente.
- Export de données existant et maintenant complet — bonne base pour une stratégie de sauvegarde, à automatiser côté serveur.

---

## 12. Verdict final

**Le diagnostic change : le P0 est implémenté.** Le travail effectué depuis l'audit a suivi le bon ordre — fiabilité des données et tests d'abord (faits), puis le P0 lui-même (fait). Il ne reste qu'une étape avant de considérer le sujet réellement clos : **vérifier en conditions réelles, avec 2 vrais comptes Supabase, qu'aucune fuite de données n'existe entre foyers** (§2.3) — les tests automatisés couvrent la logique métier mais tournent contre un faux client, pas contre une vraie base Postgres avec RLS active. Une fois cette vérification faite, l'app est raisonnablement prête pour un lancement public à échelle contrôlée (les points P2/P3 restants — CI, monitoring, mentions légales — sont recommandés mais non bloquants).
