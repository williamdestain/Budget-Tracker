# Traqueur de Budget — Positionnement produit & Roadmap technique

*Document de synthèse — compile l'analyse concurrentielle, les échanges de contre-expertise, les décisions verrouillées, et l'état d'implémentation.*

---

## 1. Contexte

L'application est un gestionnaire de finances personnelles en Angular, avec Supabase comme backend, actuellement construite autour de : revenus, dépenses, budget, provisions (sinking funds), épargne, dépenses récurrentes, carte de crédit, et un dashboard central.

La question de départ : *le marché des apps de budgétisation personnelle est déjà très concurrentiel (YNAB, Monarch Money, Neontra, Wealthica, Lunch Money, etc.) — qu'est-ce qui justifierait qu'un utilisateur choisisse cette app plutôt qu'une autre ?*

---

## 2. Analyse concurrentielle

### 2.1 Premier tour (théorique, sans vérification)

Une première analyse a positionné l'app face à YNAB, Monarch Money et Neontra (le concurrent canadien le plus proche fonctionnellement), en listant leurs fonctionnalités respectives à partir de connaissances générales, sans recherche vérifiée. Conclusion initiale : la "simplicité" et le marché canadien ne sont pas des différenciateurs suffisants à eux seuls, puisque plusieurs concurrents les couvrent déjà.

### 2.2 Vérification par recherche web (faits à jour, 2026)

Une recherche a ensuite corrigé et complété cette première matrice :

| Fonctionnalité | Notre app | Monarch | YNAB | Neontra |
|---|---|---|---|---|
| Synchronisation bancaire | ❌ | ✅ solide | ✅ (Plaid, faible au Canada) | ⚠️ existe mais peu fiable (déconnexions fréquentes) |
| Valeur nette | ❌ | ✅ complet | ⚠️ basique, mise à jour manuelle | ✅ |
| Investissements | ❌ | ✅ (Morningstar en plan Plus) | ⚠️ solde de compte seulement | ⚠️ existe, UI critiquée |
| Prévisions | ✅ (`monthForecast`) | ✅ (avancé en plan Plus) | ❌ quasi absent | ✅ |
| Assistant IA / conversationnel | ❌ | ✅ argument fort en 2026 | ⚠️ auto-remplissage seulement | ✅ "insights" IA |
| Provisions (sinking funds nommés, avec cycle et recalibrage) | ✅ mécanique dédiée poussée | ❌ | ⚠️ approximé via catégories/targets | ❌ |
| Prix / an | — | 99,99 – 199 $ US | 109 $ US | ~108 $ CAD |
| Fiabilité Canada | — | couverture bancaire inégale | couverture bancaire inégale | conçue pour, mais bugs de sync |

**Conclusion de cette étape** : en 2026, les trois concurrents ont tous investi dans l'IA conversationnelle et l'agrégation bancaire — c'est devenu un standard attendu, pas un différenciateur. **Aucun des trois n'a de mécanique équivalente aux "provisions" de notre app** (montant cible, cycle en jours/mois, recalibrage automatique, répartition d'un versement). C'est un vide concurrentiel réel, vérifié, pas une supposition.

---

## 3. Repositionnement produit

### 3.1 Constat clé

En explorant le code réel de l'application (`budget-store.service.ts`), il est apparu que l'app avait **déjà commencé**, sans que ce soit formulé explicitly, à construire ce qu'on appelle un *"finance decision assistant"* :

| Brique | État |
|---|---|
| Comprendre la situation (revenus/dépenses/budget) | ✅ |
| Provisions / sinking funds | ✅ très poussée |
| Alertes contextuelles (`smartAlerts()`) | ✅ |
| Prévision mensuelle (`monthForecast()`) | ✅ |
| Décisions financières ("puis-je me permettre ça ?") | 🟡 logique présente, UX pas encore assemblée |
| Synchronisation bancaire | ❌ (assumé — 100 % saisie manuelle) |
| Assistant conversationnel | ❌ |

### 3.2 Positionnement retenu

> L'application ne cherche pas à être le meilleur gestionnaire de transactions. Elle calcule la réalité financière de l'utilisateur : ce qui est déjà engagé, ce qui doit arriver, ce qui doit être réservé, et ce qui est réellement disponible.

La question directrice choisie pour guider le design et la roadmap :

> **"Combien puis-je réellement dépenser ?"** — pas seulement "combien ai-je sur mon compte ?"

La synchronisation bancaire est reclassée : **attendue par le marché, mais pas un avantage concurrentiel.** Le vrai avantage potentiel est la chaîne complète : *transactions fiables → provisions → prévisions → budget → montant réellement disponible*, une fois cette chaîne bâtie sur un moteur fiable.

Le contrôle manuel des données (pas de synchronisation bancaire) est retenu comme un **choix de philosophie produit possible** ("mode contrôle" vs "mode automatique"), pas comme une lacune à corriger en priorité — en prenant soin de ne pas le présenter comme "100 % local", puisque les données transitent bien par Supabase.

---

## 4. Le débat technique : `remainingPerDay` → `remainingBudget`

### 4.1 Le problème identifié

Une première itération avait ajouté un signal `remainingPerDay = (budget - spentSoFar) / joursRestants` au store, pour préparer un composant de synthèse ("Money Pulse") en haut du dashboard.

Une contre-expertise a démontré que cette formule est **trompeuse** : elle ignore les dépenses futures déjà engagées (loyer, assurance à venir) et les provisions bientôt dues. Un "100 $/jour disponible" peut être faux si 1 700 $ d'obligations tombent dans les jours suivants.

### 4.2 Vérification en profondeur (dans le code réel)

Avant de coder quoi que ce soit, deux points ont été vérifiés directement dans `budget-store.service.ts` et `provision.utils.ts` :

1. **`budget` ne contient déjà aucune déduction implicite** — c'est purement `revenus du mois + report`. Pas de risque de double-comptage de ce côté.
2. **`spentSoFar` et `missing` (provisions) sont complémentaires, jamais redondants** — `missing = target - pot`, où `pot` inclut déjà les contributions manuelles faites ce mois-ci (comptées dans `spentSoFar`). Soustraire les deux ne compte jamais la même contribution deux fois.
3. **Un vrai risque de double comptage a été découvert en cours d'analyse** : une dépense récurrente et une provision peuvent partager la même catégorie (ex. "Assurance") sans représenter la même obligation, ou au contraire représenter la même obligation comptée deux fois. **Aucune relation explicite `Provision ↔ RecurringExpense` n'existe dans le modèle de données** — donc toute déduction automatique basée sur la catégorie serait une hypothèse dangereuse (ex. "leasing auto" en récurrent + "entretien auto" en provision : même catégorie, deux obligations réellement distinctes).

### 4.3 Décision retenue

**Principe adopté** : *"false negative explicite > false positive silencieux"* — mieux vaut afficher une incohérence potentielle à l'utilisateur que de déduire silencieusement un montant qui pourrait être faux.

- Pas d'exclusion automatique par catégorie.
- À la place : une alerte **`info`** (jamais `warning`/`error`) quand une catégorie est couverte à la fois par une provision active et une dépense récurrente active, invitant l'utilisateur à vérifier lui-même s'il ne s'agit pas de la même obligation.

**Nommage** : `remainingBudget`, pas `safeToSpend`. Le calcul répond à *"combien reste-t-il dans mon budget ?"*, pas à *"combien puis-je dépenser sans compromettre mes finances ?"* (qui demanderait en plus épargne, marge de sécurité, dettes, etc. — hors scope).

**Architecture** : pas de couche `FinancialPosition` / modèle de domaine séparé. `remainingBudget` est un `computed()` de plus dans `BudgetStore`, au même niveau que `monthForecast`, `smartAlerts`, `upcomingProvisions` — cohérent avec le style existant. Une abstraction plus lourde ne se justifiera que si le store devient réellement trop large (pas le cas aujourd'hui).

**Formule V1 verrouillée** :

```
remainingBudget =
    budget
  - spentSoFar
  - recurringRemaining   (récurrents actifs non confirmés, mois affiché)
  - provisionsRemaining  (missing des provisions dues ce mois, dueThisMonth)
```

**Explicitement exclu de la V1** : épargne planifiée, marge de sécurité, investissements, patrimoine, solde bancaire, IA — chacun nécessite une vraie décision produit non tranchée (ex. comment dériver une contribution mensuelle d'épargne à partir d'un `targetAmount`/`targetDate` : linéaire ? priorité personnalisée ? plusieurs politiques possibles, aucune choisie).

---

## 5. Ce qui a été implémenté

### 5.1 `core/services/budget-store.service.ts`

- **`interface RemainingBudget`** — `{ amount, budget, spent, recurringRemaining, provisionsRemaining }` (objet, pas un simple nombre, pour que l'UI puisse expliquer le montant sans recalculer la logique métier).
- **`remainingBudget` (computed)** — implémente la formule V1 ci-dessus, en réutilisant `budgetSummary()`, `expectedThisMonth()` et `upcomingProvisions()` déjà existants (aucune nouvelle donnée nécessaire).
- **`remainingPerDay` (computed)** — signal antérieur, encore présent, basé sur la formule naïve `(budget - spentSoFar) / joursRestants`. **À reconsidérer** une fois `MoneyPulse` redessiné (voir checklist).
- **`smartAlerts()`** — nouvelle alerte `info` de chevauchement catégorie provision/récurrent, ajoutée en fin de liste (respecte le plafond existant de 5 alertes, triées par gravité).

### 5.2 `features/dashboard/money-pulse/` (créé, pas encore branché sur `remainingBudget`)

- `money-pulse.ts` / `.html` / `.scss` — composant de synthèse en haut du dashboard, actuellement basé sur `monthForecast()` + `remainingPerDay()` (la version naïve). **Doit être reconçu pour utiliser `remainingBudget()`** (prochaine étape, volontairement pas encore faite — voir décision §4.3 de ne pas enchaîner directement).
- Câblé dans `dashboard.html`, tout en haut, au-dessus du reste du tableau de bord.

### 5.3 Tests

- `core/services/budget-store.service.spec.ts` — **13 tests** ajoutés pour `remainingBudget` et l'alerte de collision, couvrant : absence de récurrent/provision, récurrent confirmé vs non confirmé, provision partiellement/entièrement financée, non-double-comptage d'une contribution du mois en cours, rollover inclus, montant négatif non clampé, provision due vs non due, transition d'un mois à l'autre, et les 3 cas de l'alerte de collision (même catégorie actif / catégories différentes / récurrent inactif).
- `features/dashboard/money-pulse/money-pulse.spec.ts` — **8 tests**, composant testé en isolation avec un faux `BudgetStore` (pour éviter toute dépendance à la date réelle du jour).
- **126 tests passent** au total, build propre.

---

## 6. Checklist — prochaines étapes

### Court terme (suite immédiate, déjà décidée)

- [ ] Examiner les résultats réels de `remainingBudget()` sur des données concrètes (pas seulement les tests) avant de reconcevoir l'UI, comme convenu.
- [ ] Reconcevoir `MoneyPulse` pour utiliser `remainingBudget()` au lieu de `remainingPerDay()` (formule naïve actuelle).
- [ ] Décider si `remainingPerDay()` doit être supprimé, ou recalculé comme `remainingBudget.amount / joursRestants` (`safeToSpendPerDay` dans le vocabulaire de la contre-expertise).
- [ ] Mettre à jour `MoneyPulse` pour afficher le détail (`budget`, `spent`, `recurringRemaining`, `provisionsRemaining`) sans recalcul côté composant — l'objet est déjà structuré pour ça.
- [ ] Écrire les tests du composant `MoneyPulse` mis à jour (même pattern d'isolation que les 8 tests existants).

### Décisions produit à trancher explicitement (volontairement reportées)

- [ ] **Épargne dans le calcul de disponible** : choisir une politique de contribution mensuelle (linéaire depuis `targetDate` ? montant fixe défini par l'utilisateur ? flexible sans obligation ?) avant d'envisager de l'inclure dans une version future de `remainingBudget`/`safeToSpend`.
- [ ] **Marge de sécurité** : décider si elle doit exister, et si oui, la rendre configurable par l'utilisateur plutôt qu'une constante cachée dans une formule.
- [ ] **Relation `Provision ↔ RecurringExpense`** : évaluer si une relation explicite (ex. `linkedRecurringExpenseId` sur `Provision`) vaut la peine d'être ajoutée au modèle, pour remplacer l'alerte informative actuelle par une vraie détection fiable plutôt qu'une simple coïncidence de catégorie.

### Moyen terme (roadmap produit, pas encore engagée)

- [ ] Étude concurrentielle approfondie sur ~30 critères (UX, prix, confidentialité, personnalisation, Canada/Québec, etc.) pour affiner le positionnement au-delà de la matrice de fonctionnalités actuelle.
- [ ] Décider d'une politique claire de communication sur le stockage des données (Supabase, pas "100 % local") si le positionnement "contrôle" devient un axe marketing.
- [ ] Explorer si la mécanique de provisions peut être exposée comme argument central du produit (ex. page dédiée "pourquoi les provisions" dans l'onboarding), puisque c'est le différenciateur le plus solidement vérifié à ce jour.

### Plus tard (explicitement hors scope actuel)

- [ ] Synchronisation bancaire — repositionnée comme fonctionnalité attendue, pas comme différenciateur ; à envisager une fois le moteur financier manuel jugé fiable et complet.
- [ ] Assistant conversationnel / IA — à construire **au-dessus** d'un moteur financier fiable et déterministe, jamais en remplacement. Prématuré tant que `remainingBudget`/provisions/prévisions ne sont pas éprouvés en usage réel.
- [ ] Valeur nette / investissements / patrimoine — non couverts aujourd'hui, pas de décision prise sur leur pertinence pour le positionnement retenu.

---

## 7. Principes retenus pour la suite (à ne pas perdre de vue)

1. **Ne jamais faire une déduction financière automatique sur une hypothèse non vérifiée dans les données** (ex. collision de catégorie) — préférer une alerte visible à une correction silencieuse potentiellement fausse.
2. **Ne pas nommer une métrique au-delà de ce qu'elle garantit réellement** (`remainingBudget`, pas `safeToSpend`, tant que la V1 ne couvre que le budget et pas la santé financière globale).
3. **Ajouter l'abstraction quand un besoin métier concret l'exige, pas par anticipation** — le store reste une collection de `computed()` cohérents tant qu'il n'est pas devenu réellement trop large.
4. **Vérifier dans le code réel avant de trancher un débat de conception** — plusieurs points de cette discussion (sémantique de `budget`, risque de double comptage, absence de relation provision/récurrent) n'ont été résolus qu'en lisant le code source, pas en raisonnant dans l'abstrait.
