# Revue de code architecture (niveau senior) + plan de refactoring — Traqueur de Budget

**Date** : 15 août 2026
**Portée** : revue fonctionnalité par fonctionnalité de l'intégralité du code applicatif (hors `node_modules`), avec preuve (fichier + ligne) à chaque constat. Ce document complète `AUDIT_PRODUCTION.md` et `AUDIT_PRODUCTION_V2.md` (sécurité/fiabilité) avec un axe **qualité de code et architecture**, et se termine par un **plan de refactoring concret, ordonné en PRs**.

**Méthodologie** : chaque fichier de `src/app` a été ouvert et lu (pas d'extrapolation). Les constats ci-dessous sont classés par fonctionnalité, puis un chapitre transverse couvre l'architecture globale.

---

## 0. Constat transverse positif, à noter avant tout le reste

**Vérifié : aucun composant ne parle directement à Supabase.** Toute la logique d'accès aux données passe par `BudgetStore` (et `AuthService` pour l'authentification) — zéro `supabase.client` ou `from('...')` en dehors de `core/services/`. C'est une frontière propre : le problème du `BudgetStore` (chapitre 8) est un problème de **taille et de nombre de responsabilités**, pas de **fuite d'abstraction**. Concrètement, ça veut dire que le refactoring en facades (proposé au chapitre 10) est un chantier **à risque modéré, pas élevé** : il y a un seul endroit à découper, pas des dizaines d'appels dispersés à retrouver dans toute l'app.

---

## 1. Dashboard (`features/dashboard/`)

**Fichiers** : `dashboard.ts` (139 lignes), `dashboard.html`, `dashboard.scss`, `smart-alerts/` (12 lignes).

### Ce qui est bien
- Le composant reste un simple **orchestrateur de navigation** (mois, profil actif, déconnexion) — il ne réimplémente aucun calcul métier, tout passe par `store`.
- `closeMonth()` est bien commenté sur son comportement Global vs profil individuel.

### Constats

**1.1 — `confirm()` natif du navigateur pour une opération destructrice/importante (`dashboard.ts` lignes 116, 134).**
Utiliser `window.confirm()` pour clôturer un mois est fonctionnel mais : impossible à styliser (incohérent avec le reste de l'UI, qui a ses propres modales — voir `data-management`), bloque le thread JS, et rend les tests automatisés (E2E) plus difficiles à écrire (il faut mocker `window.confirm`). Même remarque pour `expense-list.ts` (`cancelSplit`, ligne 107) et `data-management.ts` (`onFileSelected`, ligne 85).
*Gravité : mineure (P3), cohérence UI/testabilité plutôt que bug.*

**1.2 — `closeMonth()` en mode Global fait deux écritures non transactionnelles (`dashboard.ts` lignes 118-121).**
```ts
await Promise.all([
  this.store.setRollover('moi', target, soldeMoi),
  this.store.setRollover('madame', target, soldeMadame),
]);
```
Si l'une des deux réussit et l'autre échoue, un seul des deux profils voit son solde reporté, sans rollback ni message clair sur lequel a échoué. Rejoint le constat général d'atomicité de `AUDIT_PRODUCTION_V2.md` §3.4.

---

## 2. Authentification (`features/auth/`, `core/services/auth.*`)

**Fichiers** : `login.ts`/`.html`, `auth.service.ts`, `auth.guard.ts`.

### Ce qui est bien
- `auth.guard.ts` attend proprement la résolution de la session avant de rediriger (bug de course déjà corrigé dans une itération précédente).
- Séparation claire session/guard/UI.

### Constats

**2.1 — Pas de gestion d'erreur réseau distincte d'une erreur d'identifiants (`login.ts` lignes 22-29).**
```ts
const err = await this.auth.signIn(this.email, this.password);
if (err) {
  this.error.set('Identifiants incorrects.');
  return;
}
```
Toute erreur (mauvais mot de passe, mais aussi panne réseau, Supabase indisponible, rate-limit) affiche le même message « Identifiants incorrects ». Trompeur en cas de panne — l'utilisateur va ressaisir son mot de passe en boucle alors que le service est down.
*Gravité : mineure (P3), mais facile à corriger (distinguer sur `err` selon le type retourné par Supabase).*

**2.2 — Pas de limite de tentatives côté app.**
Supabase Auth a un rate-limiting serveur par défaut, mais rien côté app (pas de compteur, pas de délai progressif). Pas urgent vu l'échelle actuelle, à revoir si ouverture publique (rejoint `AUDIT_PRODUCTION.md` §3.1).

---

## 3. Dépenses (`features/expenses/`)

**Fichiers** : `expense-form.ts` (47 lignes), `expense-list.ts` (159 lignes) + `.html`.

### Ce qui est bien
- `expense-form.ts` est court, lisible, validation simple et suffisante pour le formulaire.
- Le commentaire sur `startEdit()` explique bien pourquoi les lignes de provision ne sont pas éditables — bonne trace de décision de conception.

### Constats

**3.1 — `isSplitVersement()` recalculée à chaque cycle de détection de changement, dans une boucle de template (`expense-list.ts` lignes 99-103, appelée 4 fois par ligne dans `expense-list.html`, lignes 91/98/115/120).**
```ts
isSplitVersement(e: CountedExpense): boolean {
  return this.store.provisions().some((p) => p.adjustments.some((a) => a.versementExpenseId === e.id));
}
```
Pour chaque dépense affichée, Angular appelle cette méthode jusqu'à 4 fois, et chaque appel scanne **toutes les provisions et tous leurs ajustements**. Avec N dépenses, P provisions et A ajustements en moyenne, c'est grossièrement O(N × P × A) à chaque détection de changement — pas un problème avec les volumes actuels (dizaines de lignes), mais ça ne passera pas à l'échelle (des années d'historique, plusieurs centaines de dépenses) et c'est un anti-pattern Angular classique (logique de calcul dans une méthode de template au lieu d'un `computed()` mémorisé).
**Correctif recommandé** : précalculer un `Set<string>` des `versementExpenseId` liés dans un `computed()` du composant, et ne faire qu'un `.has(e.id)` dans le template.
*Gravité : P2 — pas urgent aujourd'hui, mais à corriger avant que le volume de données grandisse.*

**3.2 — `mergedList` et `provisionEntryCount` recalculent séparément `store.countedExpensesList().filter(e => e.provision)` (`expense-list.ts` lignes 33-39 et 71-73).**
Duplication mineure du même filtrage, deux fois. Facile à factoriser en un seul `computed()` intermédiaire.
*Gravité : cosmétique.*

---

## 4. Revenus (`features/incomes/`)

**Fichiers** : `income-form.ts` (65 lignes), `income-list.ts` (43 lignes), `income-bar.ts` (32 lignes).

### Ce qui est bien
- Séparation nette formulaire/liste/résumé, cohérente avec le reste de l'app.

### Constats

**4.1 — Effet de synchronisation du profil dupliqué à l'identique dans 3 fichiers.**
**Vérifié** — le même bloc (commentaire compris) apparaît dans `income-form.ts`, `expense-form.ts`, et `recurring-expenses-manage.ts` :
```ts
constructor(private store: BudgetStore) {
  effect(() => {
    const active = this.store.activeOwner();
    if (active === 'moi' || active === 'madame') this.owner = active;
  });
}
```
Trois copies identiques du même comportement. Si on veut un jour changer cette règle (par ex. ne plus resynchroniser si l'utilisateur a déjà touché le champ), il faut le faire à 3 endroits et espérer ne pas en oublier un.
**Correctif recommandé** : extraire une petite fonction utilitaire ou un composable, par exemple :
```ts
// core/utils/owner-sync.util.ts
export function syncOwnerWithActiveProfile(
  store: BudgetStore,
  setOwner: (o: Owner) => void,
): void {
  effect(() => {
    const active = store.activeOwner();
    if (active === 'moi' || active === 'madame') setOwner(active);
  });
}
```
*Gravité : P2 — dette technique claire, faible risque à corriger, bon candidat pour une PR isolée et rapide.*

---

## 5. Provisions (`features/provisions/`)

**Fichiers** : `provision-form.ts` (86 lignes), `provision-card.ts` (214 lignes), `provision-list.ts`, `upcoming-provisions.ts` (21 lignes), `versement-splitter.ts` (235 lignes).

### Ce qui est bien
- `versement-splitter.ts` : l'arrondi des répartitions gère correctement la dérive de centimes (`round2` + correction sur la dernière ligne) — c'est le genre de détail qu'on oublie souvent et qui cause des écarts d'un centime agaçants à déboguer. Bon travail ici.
- `provision-card.ts` centralise bien tous les états dérivés (`stats`) dans un seul `computed()`, plutôt que de les éparpiller en plusieurs `get`.

### Constats

**5.1 — `provision-card.ts` (214 lignes) porte à la fois affichage, édition d'ajustement, et logique de statut — un candidat à la décomposition.**
Pas un problème aujourd'hui, mais c'est le deuxième plus gros composant de l'app après `BudgetStore`. Si de nouvelles fonctionnalités s'ajoutent aux provisions, envisager de séparer l'historique des ajustements dans un sous-composant dédié (`provision-adjustment-history`).
*Gravité : P3 — observation, pas un problème actif.*

**5.2 — `versement-splitter.ts` orchestre une opération métier multi-tables sans transaction** — déjà couvert en détail dans `AUDIT_PRODUCTION_V2.md` §3.4, confirmé de nouveau ici en relisant le fichier (boucle `for (const a of allocations)` avec `await` séquentiel, ligne ~185 selon la version actuelle).

---

## 6. Épargne (`features/savings/`)

**Fichiers** : `savings-goal-form.ts`, `savings-goal-card.ts` (100 lignes), `savings-goal-list.ts`.

### Ce qui est bien
- Modèle volontairement plus simple que les provisions (pas d'échéance récurrente, pas de « payé ») — la V10 de la roadmap a été respectée à la lettre, sans sur-ingénierie. Bon exemple de scope discipliné.

### Constats
Rien de notable à signaler — c'est la fonctionnalité la plus récente et la plus propre du projet, probablement parce qu'elle a été conçue après plusieurs itérations de retours sur les autres modules.

---

## 7. Budget (`features/budget/` — 6 sous-modules)

**Fichiers** : `budget-progress.ts`, `category-budgets.ts` (97 lignes), `month-comparison.ts`, `month-forecast.ts`, `spending-chart.ts` (97 lignes), `yearly-view.ts`.

### Ce qui est bien
- Chaque sous-vue (comparaison, prévision, vue annuelle) est un composant séparé et petit, qui consomme un seul `computed()` du store — bon respect de la séparation présentation/calcul.
- Ajout cohérent du pattern « toggle ouvert/fermé + texte d'aide quand fermé » sur les 3 dernières fonctionnalités ajoutées (Comparaison, Vue annuelle, Budgets par catégorie, Épargne) — bonne cohérence UI obtenue progressivement.

### Constats

**7.1 — `category-budgets.ts` mélange logique d'édition inline et logique d'ajout, avec 6 signaux de contrôle d'UI distincts (`open`, `editingCategory`, `addOpen`, plus les champs de saisie).**
Fonctionnel, mais la frontière entre « état d'édition » et « état d'ajout » pourrait être un seul état union (`{ mode: 'idle' | 'editing', category?: string } | { mode: 'adding' }`) plutôt que plusieurs booléens/signaux indépendants qui pourraient théoriquement se contredire (ex. `editingCategory` non-null ET `addOpen` vrai en même temps, un état qui n'a pas de sens métier mais que le typage actuel n'empêche pas).
*Gravité : P3 — cosmétique/robustesse, pas un bug observé.*

---

## 8. Récurrences (`features/recurring-expenses/`)

**Fichiers** : `expected-this-month.ts`, `recurring-expenses-manage.ts` (76 lignes).

### Ce qui est bien
- Le choix documenté (« Option B de la roadmap : on suggère, l'utilisateur confirme ») évite un piège classique (génération automatique + doublons). Bonne décision produit, bien tracée dans le code.

### Constats
Rien de spécifique à ce module au-delà de la duplication de l'effet de synchronisation de profil (4.1, déjà couvert).

---

## 9. Import / Export / Réinitialisation (`features/data-management/`)

**Fichiers** : `data-management.ts` (180 lignes).

### Ce qui est bien
- `onOverlayClick()` a un commentaire qui explique une décision de conception non évidente (pourquoi une vraie méthode plutôt qu'une expression inline) — exactement le genre de commentaire utile, qui explique le *pourquoi* pas le *quoi*.
- Gestion d'erreur présente et user-friendly sur l'import (`onFileSelected`, avec try/catch + toast).

### Constats

**9.1 — Gestion d'erreur incohérente entre `onFileSelected()` (a un `catch`) et `confirmReset()` (n'en a pas).**
**Vérifié — lignes 160-179** :
```ts
async confirmReset(): Promise<void> {
  this.saving.set(true);
  try {
    this.store.exportData();
    if (this.rcFull()) {
      await this.store.resetEverything();
    } else { /* ... */ }
    this.open.set(false);
    this.toast.show('🗑 Données supprimées. Sauvegarde téléchargée.');
  } finally {
    this.saving.set(false);
  }
}
```
Aucun `catch` : si `resetEverything()` lève une exception, `saving` repasse à `false` (le bouton redevient cliquable) mais **aucun message d'erreur n'est montré à l'utilisateur**, et la modale reste ouverte sans explication. L'utilisateur ne sait pas si la suppression a eu lieu ou non. Comparer avec `onFileSelected()` juste au-dessus dans le même fichier, qui gère bien ce cas — incohérence à l'intérieur du même composant, symptomatique d'un oubli plutôt que d'un choix.
**Correctif** : ajouter un `catch` identique à celui de `onFileSelected()`.
*Gravité : P1 — pour une opération destructrice (suppression de données financières), un échec silencieux est le pire des scénarios. Facile à corriger (quelques lignes), à faire rapidement.*

**9.2 — Redondant avec `AUDIT_PRODUCTION_V2.md` §3.2/3.10** : `exportData()` incomplet (pas de `recurringExpenses`), backup navigateur non fiable comme filet de sécurité avant suppression. Pas répété en détail ici, juste signalé pour la vue d'ensemble par fonctionnalité.

---

## 10. Carte de crédit (`features/credit-card/`)

**Fichier** : `credit-card.ts` (67 lignes).

### Constats

**10.1 — Chaînes de caractères magiques `'Versement'` et `'Remboursement Carte Crédit'` dupliquées dans tout le code.**
**Vérifié par recherche exhaustive** :
- `'Versement'` : **13 occurrences dans 6 fichiers** (`provision-form.ts`, `category-budgets.ts`, `credit-card.ts`, `budget-store.service.ts`, `provision.utils.ts`, `categories.ts`).
- `'Remboursement Carte Crédit'` : **5 occurrences dans 3 fichiers** (`credit-card.ts`, `budget-store.service.ts`, `categories.ts`).

Ce sont des catégories qui ont un traitement spécial dans la logique métier (exclues des totaux, traitées comme des transferts internes, etc.) — les avoir en chaînes littérales dupliquées partout est fragile : une faute de frappe dans un seul endroit (ou un futur renommage de catégorie) casse silencieusement une partie de la logique, sans erreur de compilation puisque ce sont de simples `string`.

**Correctif recommandé** :
```ts
// core/utils/categories.ts
export const SPECIAL_CATEGORIES = {
  VERSEMENT: 'Versement',
  REMBOURSEMENT_CC: 'Remboursement Carte Crédit',
  REVENU: 'Revenu',
} as const;
```
Puis remplacer chaque littéral par `SPECIAL_CATEGORIES.VERSEMENT`, etc. Petit chantier, faible risque, gain de robustesse réel.
*Gravité : P2.*

---

## 11. Couche cœur (`core/services/`, `core/utils/`, `core/models/`)

### 11.1 — `BudgetStore` : 1 494 lignes, déjà couvert en détail dans `AUDIT_PRODUCTION_V2.md` §6.1. Pas répété ici.

### 11.2 — Le client Supabase n'est pas typé (`supabase.service.ts`)

**Vérifié** :
```ts
readonly client: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```
Pas de paramètre générique `createClient<Database>(...)`. Conséquence : **chaque `.from('table').select()` retourne des lignes typées `any`**, implicitement. Ça explique en partie pourquoi certains bugs de l'audit V2 (comme l'oubli de `recurring_expenses` dans `resetEverything`/`exportData`) sont passés inaperçus — TypeScript ne peut pas t'aider à vérifier que tu couvres bien toutes les tables si les types ne reflètent pas le schéma réel.

**Correctif recommandé** : générer les types depuis le schéma réel avec la CLI Supabase :
```bash
npx supabase gen types typescript --project-id <id> > src/app/core/database.types.ts
```
puis `createClient<Database>(...)`. Ça ne remplace pas les tests, mais ça ajoute une couche de vérification gratuite à la compilation.
*Gravité : P2 — investissement modéré, bénéfice durable (chaque nouvelle table/colonne devient auto-documentée et vérifiée par le compilateur).*

### 11.3 — `category: string` partout au lieu d'un type restreint

**Vérifié** — `budget.models.ts` : `Expense.category`, `Provision.category`, `RecurringExpense.category` sont tous typés `string`, alors que `categories.ts` définit une liste fixe `CATEGORIES`. Rien n'empêche, au niveau du compilateur, d'assigner une catégorie qui n'existe pas dans la liste.
**Correctif simple** :
```ts
export type Category = (typeof CATEGORIES)[number];
```
puis remplacer `string` par `Category` dans les interfaces concernées.
*Gravité : P3 — bon rapport effort/bénéfice, mais pas urgent.*

### 11.4 — Interface `BudgetState` morte et périmée

**Vérifié par recherche exhaustive** : `BudgetState` (`budget.models.ts` lignes 108-115) n'est référencée **nulle part ailleurs** dans le code. En plus d'être inutilisée, elle est **incomplète** par rapport à l'état réel du store (il manque `categoryBudgets` et `recurringExpenses`, qui existent bien dans `BudgetStore`). Une relecture future pourrait croire à tort que c'est la source de vérité du modèle de données.
**Correctif : supprimer l'interface.** Zéro risque (aucune référence), gain de clarté immédiat.
*Gravité : cosmétique, mais gratuit à corriger — bon candidat pour la toute première PR (voir plan).*

### 11.5 — Usage de `any` : 25 occurrences, concentrées dans 3 fichiers

`supabase-mappers.ts` (attendu et raisonnable tant que 11.2 n'est pas fait — les lignes brutes de Supabase sont non typées), `budget-store.service.ts` (`importData(data: any)`, cohérent avec le manque de validation de schéma déjà signalé dans `AUDIT_PRODUCTION_V2.md` §3.9), `data-management.ts` (`catch (err: any)`, pattern standard TypeScript pour capturer une exception, acceptable).
*Pas un problème en soi — noté pour contexte, se résorbera naturellement avec 11.2 et la validation de schéma déjà planifiée.*

---

## 12. Synthèse des constats par gravité (spécifiques à cette revue, ne recoupe pas V1/V2)

| # | Constat | Fichier(s) | Gravité |
|---|---|---|---|
| 9.1 | `confirmReset()` sans gestion d'erreur (échec silencieux sur suppression de données) | `data-management.ts` | 🔴 P1 |
| 3.1 | `isSplitVersement()` non mémorisée, appelée 4×/ligne dans le template | `expense-list.ts` | 🟡 P2 |
| 4.1 | Effet de sync du profil dupliqué 3× à l'identique | `income-form.ts`, `expense-form.ts`, `recurring-expenses-manage.ts` | 🟡 P2 |
| 10.1 | Chaînes magiques `'Versement'`/`'Remboursement Carte Crédit'` (13 + 5 occurrences) | 6 fichiers | 🟡 P2 |
| 11.2 | Client Supabase non typé (`any` implicite sur toutes les requêtes) | `supabase.service.ts` | 🟡 P2 |
| 1.2 | `closeMonth()` Global : 2 écritures non transactionnelles | `dashboard.ts` | 🟡 P2 (recoupe V2 §3.4) |
| 2.1 | Erreur réseau confondue avec erreur d'identifiants | `login.ts` | 🟢 P3 |
| 5.1 | `provision-card.ts` commence à grossir | `provision-card.ts` | 🟢 P3 |
| 7.1 | États d'édition/ajout en booléens indépendants plutôt qu'un état union | `category-budgets.ts` | 🟢 P3 |
| 11.3 | `category: string` au lieu d'un type restreint | `budget.models.ts` | 🟢 P3 |
| 11.4 | Interface `BudgetState` morte et incomplète | `budget.models.ts` | 🟢 P3 (gratuit) |
| 1.1 | `confirm()` natif pour actions importantes | 3 fichiers | 🟢 P3 |
| 3.2 | Petite duplication de filtrage dans `expense-list.ts` | `expense-list.ts` | 🟢 Cosmétique |

**Comparaison avec `AUDIT_PRODUCTION_V2.md`** : cette revue ne trouve **aucun nouveau problème de sécurité ou d'intégrité de données majeur** — ce qui est plutôt une bonne nouvelle, ça confirme que les deux audits précédents avaient déjà couvert l'essentiel du risque. Ce que cette revue ajoute, c'est une couche **qualité de code / maintenabilité** : rien qui menace tes données aujourd'hui, mais des frictions qui vont coûter cher en temps de développement si l'app continue à grossir sans y toucher.

---

## 13. Plan de refactoring — PRs ordonnées

Principe d'ordonnancement : **du risque le plus faible / gain le plus rapide, vers le plus structurant**, en respectant les dépendances (ex. impossible de découper `BudgetStore` en facades avant d'avoir des tests dessus). Ce plan **intègre et réordonne** les actions déjà identifiées dans `AUDIT_PRODUCTION_V2.md` §8 — il ne les répète pas différemment, il les place dans la séquence de PRs concrète.

### Groupe A — Nettoyage sans risque (peut se faire en une seule PR groupée, ou 2-3 petites)

| PR | Titre | Fichiers touchés | Risque | Dépend de |
|---|---|---|---|---|
| **A1** | Supprimer `BudgetState` (mort) ; typer `Category` ; extraire `SPECIAL_CATEGORIES` et remplacer les littéraux | `budget.models.ts`, `categories.ts`, + les 6 fichiers utilisant `'Versement'`/`'Remboursement Carte Crédit'` | Très faible | — |
| **A2** | Extraire l'effet de sync de profil en fonction partagée | `core/utils/owner-sync.util.ts` (nouveau), `income-form.ts`, `expense-form.ts`, `recurring-expenses-manage.ts` | Très faible | — |
| **A3** | Mémoriser `isSplitVersement` en `computed()` ; factoriser le double-filtrage dans `expense-list.ts` | `expense-list.ts` | Faible | — |
| **A4** | Ajouter le `catch` manquant dans `confirmReset()` | `data-management.ts` | Très faible | — |

*Ces 4 PRs peuvent partir en parallèle, aucune dépendance entre elles ni avec le reste du plan. Bon premier lot pour reprendre la main sur le code sans aucun risque de régression fonctionnelle.*

### Groupe B — Fiabilité des données (reprend `AUDIT_PRODUCTION_V2.md` §8, phase 2)

| PR | Titre | Fichiers touchés | Risque | Dépend de |
|---|---|---|---|---|
| **B1** | Corriger `resetEverything()` (ajouter `recurring_expenses`) | `budget-store.service.ts` | Faible | — |
| **B2** | Corriger `exportData()`/`importData()` (ajouter `recurringExpenses`) | `budget-store.service.ts` | Faible | — |
| **B3** | `loadAll()` : détecter et surfacer les erreurs par requête au lieu de `?? []` silencieux | `budget-store.service.ts`, `dashboard.html` (écran d'erreur) | Moyen (touche le chargement initial, à bien tester manuellement) | — |

### Groupe C — Tests (prérequis avant de toucher au schéma/à `BudgetStore`)

| PR | Titre | Fichiers touchés | Risque | Dépend de |
|---|---|---|---|---|
| **C1** | Installer Vitest correctement en CI, config de base | `package.json`, config vitest | Faible | — |
| **C2** | Tests unitaires des utils purs (`provision.utils.ts`, `date.utils.ts`, `savings.utils.ts`, `income.utils.ts`) | nouveaux fichiers `*.spec.ts` | Faible | C1 |
| **C3** | Tests des computed critiques de `BudgetStore` (`budgetSummary`, `yearlyView`, `monthComparison`, `provisionPot`) avec mock Supabase | nouveau `budget-store.service.spec.ts` | Moyen (premier test avec mock, à bien cadrer) | C1, C2 |
| **C4** | Retirer ou intégrer proprement `test-checkbox.cjs` (Playwright) ; corriger l'affirmation trompeuse dans le README | `test-checkbox.cjs`, `README.md`, éventuellement `package.json` + config Playwright | Faible | — |

### Groupe D — Typage renforcé (prépare le terrain pour D suivant et pour la migration RLS)

| PR | Titre | Fichiers touchés | Risque | Dépend de |
|---|---|---|---|---|
| **D1** | Générer les types Supabase (`supabase gen types typescript`), câbler `createClient<Database>` | `supabase.service.ts`, nouveau `database.types.ts`, ajustements dans `supabase-mappers.ts` | Moyen (peut révéler des erreurs de type latentes partout où les mappers sont utilisés) | C3 (avoir des tests avant de toucher aux mappers) |

### Groupe E — Sécurité multi-tenant (reprend `AUDIT_PRODUCTION_V2.md` §8, phases 3-4 — le cœur du P0)

| PR | Titre | Fichiers touchés | Risque | Dépend de |
|---|---|---|---|---|
| **E1** | Migration SQL : tables `households`/`household_members`, colonnes `household_id` sur les 10 tables de données **y compris les tables enfants** (`provision_adjustments`, `savings_goal_contributions`) | nouvelle migration SQL, `schema.sql` | Élevé | C2, C3, D1 |
| **E2** | Migration des données existantes (remplir `household_id` sur les lignes actuelles) | script SQL one-shot | Élevé (irréversible sans backup) | E1 + **backup manuel avant exécution** |
| **E3** | Nouvelles policies RLS scoped par `household_id` | migration SQL | Élevé | E1, E2 |
| **E4** | Tests RLS actifs avec 2 comptes réels (A ne voit pas B, sur toutes les tables y compris enfants) | procédure de test manuelle + éventuellement un script de vérification | Élevé (c'est le test qui valide tout le reste) | E3 |
| **E5** | Adapter `budget-store.service.ts` si nécessaire (rien ne devrait changer côté requêtes si RLS filtre déjà côté serveur, mais à vérifier) | `budget-store.service.ts` | Moyen | E4 |

### Groupe F — Atomicité (reprend V2 §3.3/3.4)

| PR | Titre | Fichiers touchés | Risque | Dépend de |
|---|---|---|---|---|
| **F1** | Fonction RPC PostgreSQL transactionnelle pour import/reset complet | migration SQL (nouvelle fonction), `budget-store.service.ts` (appel RPC au lieu des inserts séquentiels) | Élevé | E3 (les policies RLS doivent exister avant d'écrire la fonction RPC, pour que la fonction respecte les mêmes règles) |
| **F2** | Fonction RPC pour la répartition de versement (`splitVersementIntoProvisions`) | migration SQL, `budget-store.service.ts`, `versement-splitter.ts` (inchangé côté UI si l'appel reste `async`) | Moyen | F1 |
| **F3** | Contraintes `check` en base (montants positifs, longueurs, bornes) | migration SQL | Faible | Peut se faire n'importe quand, indépendant — mais placé ici pour grouper les migrations SQL |

### Groupe G — Auth publique, CI, monitoring (P2/P3, peut suivre au rythme voulu)

| PR | Titre | Fichiers touchés | Risque | Dépend de |
|---|---|---|---|---|
| **G1** | Flux inscription + reset password + confirmation email | nouveaux composants `features/auth/signup`, `features/auth/forgot-password` | Moyen | E4 (inutile d'ouvrir l'inscription avant que l'isolation soit prouvée) |
| **G2** | CI : job `npm audit` + `ng build` + tests sur chaque PR, Dependabot | `.github/workflows/` | Faible | C1 |
| **G3** | Monitoring d'erreurs (Sentry ou équivalent) | `app.config.ts`, nouveau service | Faible | — |

### Groupe H — Architecture (peut s'étaler dans le temps, après tout le reste)

| PR | Titre | Fichiers touchés | Risque | Dépend de |
|---|---|---|---|---|
| **H1** | Extraire `ExpenseFacade` (CRUD dépenses uniquement) hors de `BudgetStore` | `budget-store.service.ts`, nouveau `expense.facade.ts`, composants consommateurs (`expense-form`, `expense-list`) | Moyen | C3 (tests en place pour valider le comportement identique) |
| **H2** | Extraire `ProvisionFacade`, `SavingsFacade` sur le même modèle | idem | Moyen | H1 (valider le pattern une fois avant de le répéter) |
| **H3** | Extraire `BudgetFacade` (calculs budget/comparaison/vue annuelle) | idem | Moyen | H1, H2 |
| **H4** | Extraire `DataManagementFacade` (import/export/reset) | idem | Faible (déjà isolé fonctionnellement) | F1 (une fois les RPC en place, cette facade est plus simple à écrire) |

---

## 14. Ordre global recommandé (vue simplifiée)

```
A (nettoyage)  ──┐
                 ├──> C (tests) ──> D (typage) ──> E (RLS/multi-tenant) ──> F (atomicité) ──> H (facades)
B (fiabilité)  ──┘                                        │
                                                            └──> G (auth publique, CI, monitoring)
```

Les groupes **A et B peuvent démarrer immédiatement, en parallèle, sans rien attendre** — c'est là que je recommande de commencer concrètement dès maintenant si tu veux avancer par petits incréments visibles. **C (tests) est le prérequis critique avant tout ce qui touche au schéma de données (D, E, F, H)** — ne pas sauter cette étape, c'est le point sur lequel la contre-expertise de la V2 avait raison d'insister.

---

## 15. Ce que je ne changerais pas

Pour équilibrer : la structure `features/` / `core/` actuelle n'a pas besoin d'être repensée, le choix `signal()`/`computed()` est le bon pour la taille de l'app, et la centralisation des accès Supabase dans un seul service (même trop gros) est **plus facile à corriger** qu'une architecture où l'accès aux données serait dispersé dans 40 composants — ne sous-estime pas cet avantage de départ en abordant le groupe H.
