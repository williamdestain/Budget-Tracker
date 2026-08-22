# Audit production-readiness V2 — Traqueur de Budget

**Date** : 15 août 2026
**Statut** : remplace/complète `AUDIT_PRODUCTION.md` (V1). Le diagnostic principal de la V1 (isolation des données, P0) reste valide et inchangé — cette V2 corrige une **sous-estimation** de la V1 sur l'intégrité des données, l'atomicité des opérations et la fiabilité des sauvegardes, à partir d'une contre-expertise externe.

**Méthodologie** : chaque point de la contre-expertise a été **vérifié indépendamment dans le code réel** (pas pris pour argent comptant) avant d'être intégré ici, avec ligne de code à l'appui. Deux ou trois nuances de sévérité ont été ajustées par rapport à la contre-expertise quand mon évaluation différait — c'est signalé explicitement à chaque fois.

---

## 1. Ce qui change par rapport à la V1

La V1 avait bien identifié le problème n°1 (isolation RLS) mais **sous-estimait un axe entier** : l'application n'est pas seulement « pas isolée entre comptes », elle a aussi des **trous de fiabilité des données** qui existent *même à un seul utilisateur* — donc même toi, aujourd'hui, tu pourrais perdre des données sans t'en rendre compte. C'est ce qu'apporte cette V2.

| Domaine | V1 | V2 (après vérification) |
|---|---|---|
| Isolation des données | 🔴 P0 | 🔴 P0 — confirmé, **enrichi** (tables enfants, modèle household) |
| Atomicité des opérations | Non identifié | 🔴 **P1 — confirmé dans le code** |
| `resetEverything()` incomplet | Non identifié | 🔴 **P1 — confirmé, bug réel** |
| Sauvegarde (`exportData`) incomplète | Sous-estimé (classé P2) | 🔴 **P1 — confirmé, bug réel** |
| Gestion d'erreurs `loadAll()` | Non identifié | 🟠 **P1 — confirmé** |
| Concurrence (2 navigateurs, même compte) | Non identifié | 🟠 **P1 — confirmé (absence totale de mécanisme)** |
| `owner` non lié à l'identité réelle | Non identifié | 🟠 **P1 — confirmé** |
| Test Playwright non reproductible | Non identifié | 🟡 **P2 — confirmé, et assez révélateur** |
| Qualité Angular/TypeScript | Peu analysée | 🟢 **Plutôt bonne — détaillé ici** |
| `BudgetStore` = God Service | Non mentionné | 🟡 **P2 — confirmé (1494 lignes)** |

---

## 2. 🔴 P0 — Isolation des données (rappel + compléments)

Le diagnostic de la V1 reste entier : les policies RLS (`using (auth.role() = 'authenticated')`) n'isolent rien entre comptes. Deux compléments importants qui n'étaient pas dans la V1 :

### 2.1 Les tables enfants n'ont même pas de colonne `owner`

**Vérifié — `supabase/schema.sql` lignes 71-96** : `provision_adjustments` et `savings_goal_contributions` n'ont **aucune colonne `owner` ni `user_id`** — seulement une clé étrangère vers leur parent (`provision_id`, `savings_goal_id`).

Conséquence concrète : même en ajoutant `user_id` sur `provisions` et `savings_goals` comme recommandé en V1, ça **ne suffit pas**. Il faut soit :
- dupliquer `user_id` (ou `household_id`) sur les tables enfants, avec une policy qui le vérifie directement (le plus simple et le plus performant), soit
- écrire des policies avec une sous-requête vers la table parente (`using (exists (select 1 from provisions where provisions.id = provision_adjustments.provision_id and provisions.user_id = auth.uid()))`) — plus lent, plus fragile à maintenir.

**Recommandation : dupliquer la colonne.** Un peu de redondance, mais des policies RLS simples et rapides.

### 2.2 Modèle recommandé : `households`, pas juste `users`

Ton modèle métier est « un **foyer** possède des données financières », pas « un utilisateur possède des données ». La V1 proposait `user_id` directement sur chaque table (Option A, rapide). C'est valide pour un premier lancement, mais la contre-expertise a raison de souligner que si tu veux un jour que Moi et Madame aient chacun leur propre login (au lieu du compte partagé actuel), tu referas cette migration une deuxième fois.

**Structure cible recommandée (si tu as le temps de le faire une fois, bien) :**
```
households
    │
    └── household_members (auth.users + role)

households (1) ──< toutes les tables de données (expenses, incomes, provisions,
                    provision_adjustments, savings_goals, savings_goal_contributions,
                    recurring_expenses, budgets, category_budgets, rollovers)
```
Chaque table de données porte un `household_id`, les policies RLS vérifient l'appartenance au foyer via `household_members`, plutôt que l'égalité stricte avec `auth.uid()`.

**Arbitrage honnête** : cette structure est plus de travail immédiat (une table de jointure en plus, des policies un peu plus complexes) mais évite une deuxième migration douloureuse plus tard. Si tu es pressé et acceptes de refaire ce travail une deuxième fois dans 6-12 mois si besoin, l'option A (V1, `user_id` direct) reste défendable pour un premier lancement à petite échelle.

### 2.3 Ne pas se contenter d'écrire les policies — les tester

Point simple mais souvent oublié : après avoir écrit les nouvelles policies RLS, il faut les **tester activement** avec deux comptes distincts (créés exprès pour le test), pas juste relire le SQL et supposer que c'est bon :
- Compte A ne doit pas pouvoir `SELECT` les lignes du compte B (ni via l'app, ni via un appel direct à l'API REST Supabase avec le token de A).
- Idem pour `UPDATE`, `DELETE`, et `INSERT` d'une ligne avec un `user_id`/`household_id` appartenant à B.
- Vérifier spécifiquement les tables enfants (2.1) — c'est l'endroit où un oubli passe le plus souvent inaperçu.

---

## 3. 🔴 P1 — Intégrité et fiabilité des données (nouveau bloc, absent de la V1)

C'est le point le plus important ajouté par la contre-expertise : **des bugs de fiabilité qui existent dès aujourd'hui**, avant même de toucher à la sécurité multi-utilisateur.

### 3.1 `resetEverything()` ne réinitialise pas vraiment tout

**Vérifié — `budget-store.service.ts` lignes 1301-1318.** La fonction supprime `expenses`, `incomes`, `provisions`, `savings_goals`, `budgets`, `category_budgets`, `rollovers` — **mais pas `recurring_expenses`**, et ne vide pas non plus le signal `this.recurringExpenses` en mémoire.

Résultat concret : un utilisateur qui clique « Réinitialiser toutes les données » retrouve ses dépenses récurrentes intactes après coup. Pour une fonction qui s'appelle `resetEverything`, c'est un bug fonctionnel réel, pas juste un cas limite.

**Correctif :**
```ts
async resetEverything(): Promise<void> {
  await Promise.all([
    this.supabase.client.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    this.supabase.client.from('incomes').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    this.supabase.client.from('provisions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    this.supabase.client.from('savings_goals').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    this.supabase.client.from('recurring_expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000'), // ← manquant
    this.supabase.client.from('budgets').delete().neq('owner', ''),
    this.supabase.client.from('category_budgets').delete().neq('owner', ''),
    this.supabase.client.from('rollovers').delete().neq('owner', ''),
  ]);
  this.expenses.set([]);
  this.incomes.set([]);
  this.provisions.set([]);
  this.savingsGoals.set([]);
  this.recurringExpenses.set([]); // ← manquant
  this.budgets.set(emptyMonthlyMap());
  this.categoryBudgets.set(emptyCategoryBudgetMap());
  this.rollovers.set(emptyMonthlyMap());
}
```

### 3.2 `exportData()` n'exporte pas les dépenses récurrentes

**Vérifié — `budget-store.service.ts` lignes 1473-1483.** Le payload exporté contient `expenses`, `incomes`, `provisions`, `savingsGoals`, `budgets`, `categoryBudgets`, `rollovers` — **`recurringExpenses` est absent**, et donc `importData()` ne les restaure pas non plus (jamais présentes dans le fichier).

**Scénario concret et réaliste** : tu exportes une sauvegarde, tu réinitialises (ou tu perds des données autrement), tu restaures — tes dépenses récurrentes ont disparu, alors que tu penses avoir une sauvegarde complète (le commentaire du code dit littéralement « Sauvegarde complète »). C'est un problème de confiance dans la fonctionnalité de sauvegarde elle-même. **Priorité haute** : une sauvegarde incomplète est presque pire qu'une absence de sauvegarde, parce qu'elle donne un faux sentiment de sécurité.

**Correctif** : ajouter `recurringExpenses: this.recurringExpenses()` dans `exportData()`, et le bloc d'import correspondant (à créer, sur le même modèle que celui des provisions) dans `importData()`.

### 3.3 Import et réinitialisation ne sont pas transactionnels

**Vérifié.** `importData()` (ligne 1323 et suivantes) appelle `resetEverything()` (suppression) puis enchaîne une dizaine d'`insert` séquentiels (provisions, ajustements, savings goals, contributions, expenses, incomes, budgets, rollovers, category budgets). **Aucun de ces appels n'est protégé par une transaction.**

Si l'insertion échoue à mi-parcours (coupure réseau, erreur de validation sur une ligne, quota Supabase atteint...), tu te retrouves avec une base **partiellement restaurée** — certaines tables remplies, d'autres vides — sans rollback automatique. Pareil pour `resetEverything()` lui-même : les 7 `delete` tournent en `Promise.all` (parallèle) ; si l'un échoue et pas les autres, tu obtiens un état de suppression partielle.

**Recommandation** (rejoint la V1 sur ce point, mais c'est plus urgent que ne le laissait penser la V1) : pour les opérations « tout ou rien » comme l'import complet et le reset, écrire une **fonction RPC PostgreSQL** (`create function reset_and_import(...)`) qui fait tout dans une seule transaction SQL (`BEGIN ... COMMIT`, avec `ROLLBACK` automatique en cas d'erreur), plutôt que d'orchestrer 10+ appels REST indépendants depuis Angular. C'est le seul moyen d'avoir une vraie garantie d'atomicité avec Supabase/Postgres.

### 3.4 Des opérations métier « normales » ne sont pas non plus atomiques

**Vérifié — `addExpense()`, lignes 729-740** :
```ts
async addExpense(expense: Omit<Expense, 'id'>): Promise<Expense> {
  const { data, error } = await this.supabase.client.from('expenses').insert(...).select().single();
  if (error) throw error;
  const newExpense = rowToExpense(data);
  this.expenses.update((list) => [...list, newExpense]);
  await this.syncProvisionsFromExpense(newExpense); // ← étape séparée, non protégée
  return newExpense;
}
```
Si `syncProvisionsFromExpense` échoue après l'insertion, l'utilisateur voit une erreur — **mais la dépense existe déjà en base.** S'il retente, il peut créer un doublon.

**Vérifié également — `splitVersementIntoProvisions()`, boucle ligne 1093-1103** : la répartition d'un versement fait un `addExpense` puis boucle sur `addProvisionAdjustment` un par un, en `await` séquentiel, sans transaction. Une allocation qui échoue au milieu de la boucle laisse une répartition partielle (certaines provisions créditées, d'autres non), sans rollback ni message clair à l'utilisateur sur ce qui a réellement été fait.

**Recommandation** : à terme, ces opérations multi-tables gagneraient aussi à passer par des fonctions RPC transactionnelles. À court terme (moins de travail, meilleur que rien) : au minimum, détecter l'échec partiel et **recharger l'état réel depuis la base** (`loadAll()`) plutôt que de laisser le state local et la base diverger silencieusement, et afficher à l'utilisateur précisément ce qui a été fait vs. pas fait.

### 3.5 `loadAll()` transforme une panne Supabase en « aucune donnée »

**Vérifié — lignes 92-137.** Les 10 requêtes tournent en `Promise.all`, et chaque résultat est consommé avec `?? []` (`(expensesRes.data ?? []).map(...)`) **sans jamais vérifier `expensesRes.error`.**

Si une requête échoue (panne Supabase, RLS mal configurée après une migration, quota dépassé...), l'app affiche silencieusement « aucune dépense » au lieu d'une erreur — ce qui, pour une app financière, peut faire croire à l'utilisateur qu'il n'a vraiment aucune dépense ce mois-ci.

**Correctif recommandé :**
```ts
const responses = { expensesRes, incomesRes, budgetsRes, categoryBudgetsRes, rolloversRes,
                     provisionsRes, adjustmentsRes, recurringExpensesRes, savingsGoalsRes, savingsContributionsRes };
const failed = Object.entries(responses).filter(([, r]) => r.error);
if (failed.length > 0) {
  this.loading.set(false);
  this.loadError.set(failed.map(([name]) => name).join(', '));
  return; // ne pas afficher un état "vide" trompeur
}
```
Et un écran d'erreur avec bouton « Réessayer » côté dashboard, plutôt qu'un état vide silencieux.

### 3.6 Aucune protection contre la concurrence (deux navigateurs, un seul compte)

**Vérifié — aucune colonne `updated_at` dans `schema.sql`.** Le modèle actuel (Moi + Madame connectés avec le même compte, potentiellement en même temps sur deux appareils) n'a **aucun mécanisme de concurrence** : pas de verrouillage optimiste, pas d'horodatage de dernière modification, pas de détection de conflit. En cas de modification simultanée de la même donnée (ex. le budget du mois), c'est un « dernier écrivain gagne » silencieux — l'un des deux modifications est perdue sans avertissement.

**Sévérité** : je rejoins la contre-expertise sur P1 plutôt que P2, spécifiquement *parce que* le modèle actuel encourage l'usage simultané à deux sur le même compte (c'est le cas d'usage principal de l'app). Ce n'est pas un cas limite exotique.

**Recommandation minimale (peu coûteuse)** : ajouter une colonne `updated_at` sur les tables les plus sujettes à conflit (`budgets`, `category_budgets`), et recharger l'état après chaque mutation plutôt que de se fier uniquement au state local optimiste. Une vraie stratégie de verrouillage optimiste (comparer `updated_at` avant d'écraser) est plus robuste mais plus de travail — à évaluer selon combien ce cas se produit réellement en pratique chez toi.

### 3.7 Le champ `owner` n'est pas une frontière de sécurité, et ce n'est pas anodin

**Vérifié — aucune occurrence de `auth.uid()` dans `schema.sql`, confirmé par `grep`.** La contrainte `check (owner in ('moi','madame'))` garantit seulement que la valeur est l'une de ces deux chaînes — **rien n'empêche un client authentifié d'envoyer `"owner": "madame"` sur une dépense qui devrait être « Moi »**, ni au niveau base de données ni au niveau app (c'est un simple champ de formulaire côté client).

Aujourd'hui ce n'est pas un problème de sécurité (tout le compte est partagé, donc « Moi » et « Madame » ont de toute façon les mêmes droits) — mais c'est un signal important pour la suite : **ne pas confondre `owner` (un attribut d'affichage/catégorisation métier) avec une frontière de sécurité réelle** (`user_id`/`household_id`). Si demain Moi et Madame ont chacun leur propre compte, il faudra bien séparer ces deux notions (voir 2.2).

### 3.8 Contraintes de validation en base toujours trop faibles (confirmé, V1 avait déjà ce point)

Je confirme le constat de la V1 (`amount numeric(12,2) not null` sans `check (amount > 0)`, pas de limite de longueur sur `category`/`name`/`note`). La contre-expertise ajoute des exemples utiles à couvrir explicitement : `allocation_percent between 0 and 100`, `every_n > 0`, `target_amount > 0`. Rien de neuf sur le fond, mais la liste de contraintes à ajouter est plus complète — je l'intègre au plan d'action.

### 3.9 `importData()` est encore plus permissif que ce que disait la V1

**Vérifié.** La validation se limite à `JSON.parse` (la syntaxe) et quelques `Array.isArray` pour l'affichage du récapitulatif. Un JSON syntaxiquement valide mais sémantiquement absurde (`"amount": "bonjour"`, `"owner": "n'importe quoi"`) passe la validation applicative et n'échoue qu'au moment de l'insertion en base (et encore, seulement si une contrainte existe — voir 3.8, où on vient de montrer qu'il en manque beaucoup).

**Recommandation** : ajouter une vraie validation de schéma avant l'import (types, bornes, valeurs autorisées) — que ce soit à la main ou avec une petite librairie de validation de schéma (zod, valibot...). Pipeline recommandé : `JSON → validation de schéma → normalisation → validation métier → transaction DB`.

### 3.10 La sauvegarde actuelle n'est pas une vraie sauvegarde fiable

**Confirmé, et je monte la sévérité par rapport à la V1** (qui la classait en P2/« recommandé », la contre-expertise en P1 — je suis d'accord avec P1). `exportData()` déclenche un téléchargement navigateur : ça dépend du navigateur qui ne bloque pas le téléchargement, de l'utilisateur qui ne ferme pas l'onglet avant, et surtout de la personne qui pense réellement à le faire *et* à conserver le fichier quelque part de fiable. Combiné aux points 3.1-3.3 (reset incomplet, export incomplet, pas de transaction), le risque réel de perte de données pour une app financière est plus élevé que ce que suggérait la V1.

**Recommandation** : en plus de corriger 3.1/3.2/3.3, envisager une sauvegarde automatique côté serveur (le plan payant Supabase inclut le *point-in-time recovery* ; sur le plan gratuit, un job planifié — GitHub Actions cron, par exemple — qui exporte périodiquement vers un stockage externe serait un bon compromis économique).

---

## 4. 🟠 P1 confirmé — Tests (renforcé par rapport à la V1)

La V1 notait déjà l'absence de tests. La contre-expertise a raison d'insister davantage : **la vraie complexité de l'app est dans `BudgetStore` et les utils** (calculs de provisions, récurrences, rollover, budget, épargne) — c'est précisément la logique la plus modifiée à chaque itération, et celle qui casse silencieusement le plus facilement sans tests.

**Ordre de priorité recommandé pour écrire les premiers tests** (avant de toucher à la sécurité, cf. section 6) :
1. **Utils purs** (`provision.utils.ts`, `date.utils.ts`, `savings.utils.ts`, `income.utils.ts`) — faciles à tester, zéro dépendance, haute valeur (c'est là que vit la logique financière).
2. **`BudgetStore`** — les computed critiques (`budgetSummary`, `yearlyView`, `monthComparison`, `provisionPot`, etc.), avec un mock du client Supabase.
3. **Composants critiques** (formulaires avec validation, ex. `provision-form`, `expense-form`).
4. **Intégration Supabase** (contre une base de test réelle ou un mock plus poussé).
5. **E2E** (Playwright, correctement intégré cette fois — voir 5.1).

---

## 5. 🟡 P2 — Points additionnels de la contre-expertise

### 5.1 Le test Playwright mentionné dans le README n'est pas reproductible

**Vérifié — `test-checkbox.cjs` ligne 1** :
```js
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
```
Ce chemin absolu pointe vers un environnement d'exécution qui n'existe que dans le sandbox où ce test a été écrit — **il ne peut fonctionner sur aucune autre machine**, y compris la tienne en local ou une CI. **Vérifié aussi : `playwright` n'apparaît nulle part dans `package.json`** (ni en dependency ni en devDependency).

Le README affirme pourtant (ligne 68) : *« Vérifié avec un test automatisé (Playwright) »*. C'est une affirmation qui ne peut pas être vérifiée par quelqu'un d'autre que la session qui l'a écrite — trompeur en l'état, même si le test a probablement été réellement exécuté une fois.

**Recommandation** : soit intégrer Playwright proprement (`npm install -D @playwright/test`, config committée, script `npm run test:e2e`), soit retirer cette affirmation du README et supprimer le fichier orphelin.

### 5.2 Reste de la V1 (auth self-service, dépendances, monitoring, CSP)

Ces points de la V1 restent valides tels quels — je ne les reproduis pas intégralement ici pour éviter la redondance, voir `AUDIT_PRODUCTION.md` sections 3.1, 3.3, 4.2, 3.4. Un seul ajustement : **CI de sécurité** — ajouter un job qui lance `npm audit`, `ng build` et les tests (une fois qu'ils existeront) sur chaque pull request, en plus du `Dependabot` déjà recommandé en V1.

---

## 6. 🟢 Qualité Angular / TypeScript (angle mort de la V1)

Point positif que la V1 ne développait pas assez — vérifié dans `tsconfig.json` :

```json
"strict": true,
"noImplicitOverride": true,
"noPropertyAccessFromIndexSignature": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true,
"strictInjectionParameters": true,
"strictInputAccessModifiers": true,
"strictTemplates": true
```

C'est une configuration TypeScript/Angular **rigoureuse**, bien au-delà du strict minimum. L'usage cohérent de `signal()`/`computed()` (API réactive moderne d'Angular) et le découpage `features/` / `core/` sont sains pour la taille actuelle du projet.

### 6.1 🟡 Mais `BudgetStore` devient un « God Service »

**Vérifié** : `budget-store.service.ts` fait **1494 lignes**. Il porte à lui seul : le CRUD de 8 entités différentes (dépenses, revenus, provisions, épargne, récurrences, budgets, catégories, rollovers), tous les calculs métier (budget, prévisions, comparaisons, vue annuelle), l'import/export, la réinitialisation, la synchronisation des provisions, la répartition des versements.

Pour une app personnelle à 2 utilisateurs, c'est tout à fait acceptable — la lisibilité reste correcte grâce aux commentaires et à la structure interne. **Pour un produit public amené à grandir, c'est un signal à surveiller** avant que le fichier ne devienne difficile à faire évoluer sans régression (et difficile à tester unitairement, ce qui rejoint le point 4).

**Recommandation, non urgente** : découper progressivement en facades dédiées par domaine (`ExpenseFacade`, `ProvisionFacade`, `SavingsFacade`, `BudgetFacade`, `DataManagementFacade`), chacune avec son repository Supabase derrière. Pas nécessaire immédiatement, mais à faire avant que l'app ne double encore de taille — et plus facile à faire une fois que les tests du point 4 existent (pour valider qu'aucun comportement n'a changé pendant le découpage).

---

## 7. Notes par domaine (V2, avec justification)

| Domaine | Note | Justification |
|---|---|---|
| Architecture Angular | 8/10 | `signal`/`computed` cohérents, structure `features/core` saine |
| Qualité TypeScript | 8/10 | `strict` + options renforcées activées et respectées |
| Organisation du projet | 8/10 | Migrations SQL versionnées, séparation claire des features |
| Sécurité — usage actuel (foyer unique, comptes créés à la main) | 6/10 | RLS trop permissive mais pas exploitée activement ; pas de XSS/injection trouvé |
| Sécurité — multi-utilisateurs public | 1/10 | Isolation des données absente (P0, section 2) |
| Intégrité des données | 4/10 | Reset/export incomplets, opérations non atomiques (section 3) — revu à la baisse vs. V1 |
| Résilience aux erreurs | 4/10 | `loadAll()` masque les pannes, pas de gestion d'échec partiel |
| Tests | 2/10 | Un seul fichier boilerplate ; logique métier critique non couverte |
| Préparation production (public) | 4/10 | Revu à la baisse vs. V1 (5/10) une fois l'intégrité des données prise en compte |

---

## 8. Plan d'action révisé — ordre recommandé

Contrairement à la V1 qui proposait d'attaquer directement le modèle RLS, **je recommande de commencer par verrouiller les calculs avec des tests avant de toucher au schéma de données** — un changement de modèle (`user_id`/`household_id` sur 10 tables) sans filet de sécurité est le genre de refactor qui introduit des régressions silencieuses sur une logique financière déjà complexe (provisions, rollover, comparaisons mensuelles...).

| Phase | Contenu | Pourquoi cet ordre |
|---|---|---|
| **1** | Tests sur les utils purs + `BudgetStore` (section 4, niveaux 1-2) | Filet de sécurité avant tout refactor de données |
| **2** | Corriger 3.1 (`resetEverything`), 3.2 (`exportData`), 3.5 (`loadAll` erreurs) | Bugs de fiabilité déjà actifs aujourd'hui, indépendants du sujet sécurité, rapides à corriger, gain immédiat |
| **3** | Modèle `households` / `household_members` + `user_id`/`household_id` sur toutes les tables **y compris les tables enfants** (2.1) | Le cœur du P0 |
| **4** | Réécriture des policies RLS + **tests actifs avec 2 comptes** (2.3) | Ne pas se fier au SQL relu, vérifier en conditions réelles |
| **5** | Contraintes de validation en base (3.8) | Peu coûteux, protège même sans passer par l'app |
| **6** | Import/export robuste : schéma complet (recurringExpenses), validation de schéma (3.9) | Complète la fiabilité des sauvegardes |
| **7** | Transactions PostgreSQL (RPC) pour import/reset/split de versement (3.3, 3.4) | Plus gros chantier technique, mais peut attendre que 1-6 soient faits |
| **8** | Concurrence : `updated_at` + rechargement post-mutation (3.6) | Important si usage simultané fréquent chez vous, sinon peut glisser après la phase 9 |
| **9** | Auth self-service (inscription, reset password, confirmation email) — seulement si tu veux vraiment de l'inscription libre | Section 3.1 de la V1 |
| **10** | CI sécurité (`npm audit`, Dependabot), Playwright réellement intégré ou retiré du README (5.1) | |
| **11** | Monitoring (Sentry), CSP/headers (nécessite de quitter GitHub Pages), conformité légale si public | Peut attendre un lancement à petite échelle contrôlée |

---

## 9. Verdict final V2

Le diagnostic de fond ne change pas : **l'app ne doit pas être ouverte à plusieurs foyers dans son état actuel**, et le problème RLS reste le bloquant absolu. Ce que cette V2 ajoute, c'est que **le chantier ne s'arrête pas à la sécurité multi-utilisateurs** — il y a des bugs de fiabilité des données qui te concernent dès aujourd'hui, à un seul foyer, en particulier sur les sauvegardes (export incomplet) et la réinitialisation (reset incomplet). Je les mettrais même *avant* le chantier RLS dans ton planning, parce qu'ils sont rapides à corriger et qu'ils réduisent un vrai risque de perte de données pendant que tu travailles sur le reste.

L'app reste une bonne base technique (Angular moderne, TypeScript strict, structure saine) — le travail qui reste est normal pour une app qui passe du statut « outil familial » à « produit destiné au public », pas un signe que la base est mauvaise.
