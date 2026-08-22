# Contre-audit production — Budget Tracker Angular

**Date :** 15 août 2026  
**Périmètre :** application Angular + Supabase/PostgreSQL + CI/CD + tests + `AUDIT_PRODUCTION.md`

## 1. Résumé exécutif

L'application constitue une bonne base Angular/TypeScript, mais elle n'est pas prête pour une ouverture multi-utilisateurs publique dans son état actuel.

Le risque principal est l'isolation des données côté Supabase/RLS : les politiques actuelles reposent essentiellement sur l'authentification et ne rattachent pas suffisamment les lignes à un utilisateur ou à un foyer.

Le contre-audit identifie aussi des risques importants autour de l'intégrité des données, l'import/export, les opérations non transactionnelles, le reset incomplet, la gestion des erreurs Supabase, les tests et la concentration de responsabilités dans `BudgetStore`.

> **Verdict : la base frontend est saine, mais la sécurité backend et la fiabilité des données doivent être renforcées avant toute ouverture multi-foyers.**

## 2. Synthèse des risques

| Domaine | Sévérité | Verdict |
|---|---|---|
| Isolation des données | 🔴 P0 | Critique |
| RLS / sécurité Supabase | 🔴 P0 | Critique |
| Import / export | 🔴 P1 | Risque d'incohérence/perte |
| Atomicité des opérations | 🔴 P1 | À corriger |
| Reset complet | 🔴 P1 | Incomplet |
| Intégrité DB | 🟠 P1 | Contraintes insuffisantes |
| Gestion des erreurs | 🟠 P1 | Risque d'états trompeurs |
| Tests métier | 🟠 P1 | Très insuffisants |
| Sauvegarde | 🟠 P1 | Pas une vraie sauvegarde serveur |
| Authentification publique | 🟠 P2 | À compléter |
| CI/CD | 🟡 P2 | À renforcer |
| Monitoring | 🟡 P2 | À ajouter |
| CSP / headers | 🟡 P2 | À renforcer |
| Architecture Angular | 🟢/🟡 | Bonne base |
| TypeScript | 🟢 | Bonne base |

## 3. P0 — Isolation des données et RLS

Le modèle actuel utilise des politiques de type :

```sql
create policy "authenticated_all_expenses" on expenses
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
```

Cela signifie essentiellement que toute personne authentifiée peut accéder aux lignes de la table.

Cela n'exprime pas :

> L'utilisateur peut uniquement accéder aux données de son foyer.

### Recommandation

Introduire un modèle :

```text
households
    |
    +-- household_members
    |       |
    |       +-- auth.users
    |
    +-- expenses
    +-- incomes
    +-- provisions
    +-- provision_adjustments
    +-- savings_goals
    +-- savings_goal_contributions
    +-- recurring_expenses
    +-- budgets
    +-- category_budgets
    +-- rollovers
```

Même avec `1 utilisateur = 1 foyer` en V1, `household_id` prépare correctement l'évolution vers les comptes partagés.

Les tables enfants `provision_adjustments` et `savings_goal_contributions` doivent également être protégées.

## 4. P1 — Reset incomplet

`resetEverything()` ne couvre pas correctement `recurring_expenses`.

Un utilisateur peut donc demander la suppression complète et conserver des dépenses récurrentes.

Le reset doit couvrir 100 % des données du foyer et être transactionnel.

## 5. P1 — Export incomplet

`exportData()` n'inclut pas `recurringExpenses`.

État actuel :

```text
expenses              ✅
incomes               ✅
provisions            ✅
savingsGoals          ✅
budgets               ✅
categoryBudgets       ✅
rollovers             ✅
recurringExpenses     ❌
```

Une sauvegarde annoncée comme complète ne l'est donc pas.

L'import doit également restaurer les dépenses récurrentes.

## 6. P1 — Import non transactionnel

Le workflow de restauration effectue un reset puis plusieurs insertions successives.

En cas d'échec au milieu, la base peut rester partiellement restaurée.

Architecture recommandée :

```text
BEGIN
    validate import
    delete current household data
    insert new data
    validate integrity
COMMIT
```

et `ROLLBACK` en cas d'erreur.

Une RPC PostgreSQL transactionnelle est préférable à une orchestration de nombreuses écritures depuis Angular.

## 7. P1 — Atomicité des opérations métier

Certaines opérations réalisent plusieurs mutations successives.

Exemple :

```text
create expense
       |
       +--> synchronize provision
```

Si la première réussit et la seconde échoue, la base devient incohérente.

Même risque pour la répartition de versements :

```text
versement
   |
   +-- allocation 1 ✅
   +-- allocation 2 ❌
   +-- allocation 3 non exécutée
```

Les opérations métier multi-tables importantes doivent être transactionnelles côté PostgreSQL.

## 8. P1 — Gestion des erreurs Supabase

Une erreur de requête peut être transformée implicitement en tableau vide.

Cela crée une confusion dangereuse :

```text
Erreur Supabase
       |
       v
data = null
       |
       v
[]
       |
       v
UI : aucune donnée
```

Il faut distinguer :

```text
Loading
   |
   +-- Success --> Data
   |
   +-- Error ----> Error state + Retry
```

Une panne ne doit jamais être présentée comme une absence de données.

## 9. P1 — Concurrence

Deux navigateurs peuvent modifier simultanément les mêmes données.

Prévoir progressivement :

- `updated_at` ;
- versioning ;
- stratégie de concurrence ;
- rechargement après mutation ;
- éventuellement optimistic concurrency control.

## 10. P1 — Intégrité des données

Les contraintes PostgreSQL sont encore trop permissives.

Exemple :

```sql
amount numeric(12,2) not null
```

n'empêche pas nécessairement une valeur incohérente comme `-500`.

Ajouter selon le domaine :

```sql
check (amount > 0)
check (target_amount > 0)
check (allocation_percent >= 0 and allocation_percent <= 100)
check (every_n > 0)
```

Compléter avec les contraintes d'unicité, foreign keys, longueurs maximales, dates cohérentes et invariants métier.

## 11. P1 — Validation de l'import

`JSON.parse()` valide uniquement la syntaxe JSON.

Pipeline recommandé :

```text
JSON
  ↓
Schema validation
  ↓
Normalization
  ↓
Domain validation
  ↓
PostgreSQL transaction
```

Le format devrait être versionné :

```json
{
  "version": 1,
  "exportedAt": "...",
  "data": {
    "expenses": [],
    "incomes": [],
    "provisions": [],
    "recurringExpenses": [],
    "savingsGoals": [],
    "budgets": [],
    "categoryBudgets": [],
    "rollovers": []
  }
}
```

## 12. P1 — Sauvegarde

L'export JSON navigateur est utile mais n'est pas une sauvegarde serveur fiable.

À moyen terme :

```text
Supabase PostgreSQL
       |
       +--> backups automatiques
       |
       +--> export utilisateur
```

L'export utilisateur doit être un mécanisme complémentaire.

## 13. P2 — Authentification

Pour une ouverture publique :

- inscription ;
- connexion ;
- logout ;
- vérification email ;
- récupération de mot de passe ;
- gestion des sessions ;
- éventuellement MFA.

L'authentification ne doit toutefois pas être considérée comme suffisante sans RLS correcte.

## 14. P2 — Tests Playwright

Le test Playwright existant dépend d'un environnement global et n'est pas suffisamment reproductible.

Playwright doit être une dépendance du projet et être exécuté dans la CI.

## 15. P1 — Tests métier

Les tests actuels couvrent peu la logique métier.

Priorités :

```text
BudgetStore
Utils
Expenses
Income
Provisions
Savings
Recurring expenses
Budget calculations
Rollovers
Import/export
```

Stratégie :

```text
1. Tests unitaires fonctions pures
2. Tests BudgetStore
3. Tests composants critiques
4. Tests Supabase/RLS
5. Tests E2E Playwright
```

## 16. Architecture Angular

### Points positifs

- TypeScript strict ;
- strict templates ;
- Signals ;
- `computed()` ;
- organisation `core/shared/features` ;
- bonne base de séparation fonctionnelle.

### Point de vigilance : BudgetStore

Le `BudgetStore` concentre progressivement :

```text
CRUD expenses
CRUD incomes
CRUD provisions
CRUD savings
recurring expenses
budgets
rollovers
import
export
reset
business rules
synchronization
state management
```

Il tend vers un God Service.

Architecture cible progressive :

```text
BudgetStore
   |
   +-- ExpenseFacade
   +-- IncomeFacade
   +-- ProvisionFacade
   +-- SavingsFacade
   +-- BudgetFacade
   +-- DataManagementFacade
```

Le refactoring doit être progressif.

## 17. Architecture cible globale

```text
                         Angular SPA
                              |
                    +---------+---------+
                    |                   |
               Auth Facade        Feature Facades
                                      |
             +------------------------+----------------------+
             |                        |                      |
         Expenses                 Budgets               Provisions
             |                        |                      |
             +------------------------+----------------------+
                                      |
                            Supabase repositories
                                      |
                              Supabase Auth/API
                                      |
                              PostgreSQL + RLS
                                      |
                          +-----------+-----------+
                          |                       |
                      households            household_members
                          |
            +-------------+--------------+
            |             |              |
        expenses       incomes      provisions
                                         |
                                  adjustments
```

Opérations critiques :

```text
Angular
   ↓
Facade
   ↓
Supabase RPC
   ↓
PostgreSQL transaction
```

## 18. Plan de correction priorisé

### Phase 1 — Tests de référence

- [ ] Tester les calculs.
- [ ] Tester dépenses.
- [ ] Tester revenus.
- [ ] Tester provisions.
- [ ] Tester épargne.
- [ ] Tester budgets.
- [ ] Tester récurrences.
- [ ] Tester import/export.

### Phase 2 — Household

- [ ] Créer `households`.
- [ ] Créer `household_members`.
- [ ] Introduire `household_id`.
- [ ] Définir les rôles.
- [ ] Migrer les données.

### Phase 3 — RLS

- [ ] RLS sur chaque table.
- [ ] RLS sur les tables enfants.
- [ ] Tests User A / User B.
- [ ] Tests SELECT.
- [ ] Tests INSERT.
- [ ] Tests UPDATE.
- [ ] Tests DELETE.
- [ ] Tests d'accès indirect.

### Phase 4 — Transactions

Créer des RPC pour :

- [ ] reset complet ;
- [ ] import complet ;
- [ ] versement + allocations ;
- [ ] opérations multi-tables ;
- [ ] synchronisations multi-écritures.

### Phase 5 — Import / Export

- [ ] Ajouter `recurringExpenses`.
- [ ] Validation schema.
- [ ] Version du format.
- [ ] Transaction.
- [ ] Gestion des erreurs.

### Phase 6 — Error handling

```text
Repository error
       ↓
Application error
       ↓
UI error state
       +--> Retry
       +--> Message utilisateur
       +--> Logging
```

### Phase 7 — Auth publique

- [ ] Sign up.
- [ ] Login.
- [ ] Logout.
- [ ] Email verification.
- [ ] Password reset.
- [ ] Session handling.
- [ ] MFA éventuellement.

### Phase 8 — CI/CD

```text
Pull Request
    |
    +--> npm ci
    +--> lint
    +--> unit tests
    +--> build
    +--> security checks
    +--> E2E
    |
    v
Merge
    |
    v
Production deployment
```

### Phase 9 — Observabilité

- [ ] Error tracking.
- [ ] Logs structurés.
- [ ] Monitoring frontend.
- [ ] Monitoring Supabase.
- [ ] Alertes.
- [ ] Métriques d'erreurs.

### Phase 10 — Hardening

- [ ] CSP.
- [ ] Security headers.
- [ ] Dependabot/Renovate.
- [ ] `npm audit`.
- [ ] Revue des dépendances.
- [ ] Politique de confidentialité.
- [ ] Documentation sécurité.

## 19. Audit architecture + code review senior recommandé

Le prochain niveau d'analyse doit être réalisé **fonctionnalité par fonctionnalité** :

```text
Dashboard
Dépenses
Revenus
Provisions
Budget
Épargne
Dépenses récurrentes
Carte de crédit
Rollovers
Import
Export
Authentification
Paramètres
```

Pour chaque fonctionnalité :

### UX

- parcours ;
- loading ;
- empty state ;
- error state ;
- confirmations ;
- feedback ;
- mobile.

### Frontend

- composants ;
- Signals ;
- RxJS ;
- facades ;
- state management ;
- duplication ;
- accessibilité ;
- performances.

### Domaine

- règles métier ;
- invariants ;
- calculs ;
- cas limites ;
- montants ;
- dates ;
- arrondis.

### Backend

- requêtes ;
- mutations ;
- RLS ;
- contraintes ;
- indexes ;
- foreign keys ;
- transactions ;
- RPC.

### Sécurité

- autorisation ;
- authentification ;
- exposition des données ;
- validation ;
- XSS ;
- stockage local ;
- secrets.

### Tests

- unitaires ;
- intégration ;
- RLS ;
- E2E ;
- cas nominaux ;
- cas limites ;
- régression.

### Architecture

- couplage ;
- cohésion ;
- responsabilités ;
- duplication ;
- dette technique ;
- évolutivité.

## 20. Livrable attendu du prochain audit senior

| Fonctionnalité | Problème | Gravité | Fichier | Solution | Effort | PR |
|---|---|---:|---|---|---:|---|
| Dashboard | ... | P1 | ... | ... | M | PR-01 |
| Dépenses | ... | P1 | ... | ... | M | PR-02 |
| Revenus | ... | P2 | ... | ... | S | PR-03 |
| Provisions | ... | P1 | ... | ... | L | PR-04 |
| Budget | ... | P1 | ... | ... | M | PR-05 |
| Épargne | ... | P2 | ... | ... | M | PR-06 |
| Import | ... | P1 | ... | ... | L | PR-07 |
| Export | ... | P1 | ... | ... | M | PR-08 |

Chaque problème doit être relié à :

```text
fichier
   ↓
fonction
   ↓
problème
   ↓
risque
   ↓
solution
   ↓
test
   ↓
PR
```

## 21. Plan de refactoring par PR

### PR-01 — Tests de caractérisation
Figer le comportement actuel.

### PR-02 — Household model
Préparer le modèle multi-utilisateur.

### PR-03 — RLS expenses/incomes
Sécuriser les premières tables.

### PR-04 — RLS provisions/savings
Sécuriser les tables complexes.

### PR-05 — RLS tables enfants
Sécuriser `adjustments` et `contributions`.

### PR-06 — Tests RLS
Tester User A / User B.

### PR-07 — Transactions métier
Introduire les RPC PostgreSQL.

### PR-08 — Import/export v2
Sauvegarde complète et validée.

### PR-09 — Error handling
Distinguer `empty` de `error`.

### PR-10 — BudgetStore decomposition
Réduire le God Service.

### PR-11 — Auth complète
Self-service.

### PR-12 — Playwright + CI
Pipeline reproductible.

### PR-13 — Observabilité
Monitoring.

### PR-14 — Security hardening
CSP, headers et dépendances.

## 22. Critères de Production Ready

### Sécurité

- [ ] Chaque donnée est rattachée à un foyer.
- [ ] RLS partout.
- [ ] User A ne peut jamais lire les données de B.
- [ ] User A ne peut jamais modifier les données de B.
- [ ] User A ne peut jamais supprimer les données de B.
- [ ] Tables enfants sécurisées.
- [ ] Aucun secret backend dans le frontend.

### Données

- [ ] Import transactionnel.
- [ ] Export complet.
- [ ] Reset complet.
- [ ] Contraintes DB robustes.
- [ ] Backups serveur.
- [ ] Migrations testées.

### Métier

- [ ] Calculs couverts par tests.
- [ ] Opérations multi-tables atomiques.
- [ ] Gestion de la concurrence définie.
- [ ] Montants validés.
- [ ] Dates validées.

### Frontend

- [ ] Loading states.
- [ ] Empty states.
- [ ] Error states.
- [ ] Retry.
- [ ] Accessibilité.
- [ ] Responsive.

### Qualité

- [ ] Tests unitaires.
- [ ] Tests intégration.
- [ ] Tests RLS.
- [ ] E2E.
- [ ] CI reproductible.

### Exploitation

- [ ] Monitoring.
- [ ] Error tracking.
- [ ] Logs.
- [ ] Alertes.
- [ ] Backups.
- [ ] Procédure de restauration.

## 23. Conclusion

L'application est plus avancée que ne le laisse penser son niveau de tests, et la base Angular est plutôt solide.

Le problème principal n'est donc pas de refaire l'application. Il faut la faire passer d'un outil familial fonctionnel à une architecture SaaS réellement isolée, transactionnelle, testée et exploitable.

Priorités :

```text
1. Tests
2. Household model
3. RLS
4. Transactions
5. Import/export
6. Intégrité DB
7. Error handling
8. Auth
9. CI/E2E
10. Observabilité
```

## 24. Prochaine étape recommandée

Le meilleur prochain travail est un **audit architecture + code review senior complet de toute l'application**, fonctionnalité par fonctionnalité (`Dashboard`, dépenses, revenus, provisions, budget, épargne, dépenses récurrentes, carte de crédit, rollovers, import/export, authentification, paramètres).

Pour chaque fonctionnalité, il faudra identifier précisément :

1. les fichiers concernés ;
2. les composants concernés ;
3. les services concernés ;
4. les problèmes d'architecture ;
5. les bugs potentiels ;
6. les problèmes de sécurité ;
7. les problèmes de performance ;
8. les problèmes de qualité de code ;
9. les problèmes UX ;
10. les tests manquants ;
11. la solution recommandée ;
12. l'effort estimé ;
13. la priorité ;
14. la PR dans laquelle effectuer le changement.

Le résultat final devra devenir une **roadmap de refactoring concrète**, avec un ordre exact de PR permettant de faire évoluer progressivement l'application vers une version réellement production-ready, sans big-bang refactor.

## Annexe — limites

Ce contre-audit constitue une revue technique du dépôt et de son architecture visible. Il ne remplace pas un pentest externe, un audit de sécurité formel ou un audit d'infrastructure Supabase en production.
