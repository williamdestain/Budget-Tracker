# MODELE.md — Modèle financier canonique de FINA

## 0. Portée et méthode de ce document

Ce document a deux couches, clairement séparées :

- **Sections 3 et 4** : l'état réel du code métier historique, avec la
  compatibilité `Owner` conservée pendant la transition.
- **Sections 5, 6 et 7** : le modèle cible et l'état de sa mise en œuvre.
  La migration Owner → Member et le support TypeScript transitoire sont
  maintenant écrits; la migration SQL n'est pas encore exécutée sur
  Supabase.

Toute divergence future entre ce document et le code doit être traitée
comme un bug de l'un des deux — jamais un flou qu'on tolère.

---

## 1. Conventions globales

| Convention | Règle actuelle | Source |
|---|---|---|
| Devise | CAD uniquement, implicite (aucun champ devise nulle part, juste des `number`) | tout le modèle |
| Arrondi | `Math.round((n + Number.EPSILON) * 100) / 100` — au centième, partout | `provision.utils.ts`, `round2()` |
| Date | `"YYYY-MM-DD"`, jour civil sans heure | `date.utils.ts` |
| Mois | `"YYYY-MM"` | `date.utils.ts` |
| Fuseau horaire | Aucun explicite — heure locale de l'appareil (`new Date()`) | `date.utils.ts` |

Ces deux derniers points sont des hypothèses documentées, pas des
limitations techniques profondes : elles tiennent tant que le foyer utilise
des appareils dans le même fuseau horaire, ce qui est le cas aujourd'hui.

---

## 2. Vue d'ensemble des entités

```
Existant (code réel)          Nouveau (conçu dans ce document)
──────────────────────        ──────────────────────────────────
Member (= Owner figé)    →    Member généralisé, Role, Invitation
Category                      Account
Expense                       AccountBalanceSnapshot
Income                        InvestmentAllocation
RecurringExpense
RecurringIncome
Provision / ProvisionAdjustment
CreditCardPayment
SavingsGoal / SavingsContribution
Clôture de mois (MonthClosure)
```

---

## 3. Entités existantes aujourd'hui dans le code

### 3.1 Member (transition depuis `Owner`)

```ts
type Owner = string; // alias de compatibilité
type OwnerOrGlobal = Owner | 'global';

interface Member {
  id: string;
  householdId: string;
  displayName: string;
  color: string;
  role: 'owner' | 'member';
  active: boolean;
}
```

`memberId` est le champ cible des entités métier. L'ancien champ `owner`
reste présent dans les interfaces et les mappings pour les exports et pour
fonctionner avant l'exécution de la migration 024. `'global'` n'est pas un
profil : c'est une vue agrégée calculée sur tous les membres actifs.

### 3.2 Category

| Champ | Type | Règle |
|---|---|---|
| id | string | |
| name | string | |
| color | string | **Figée à la création, jamais recalculée** — archiver une catégorie ne doit jamais changer la couleur des autres (déjà utilisées dans des graphiques/badges ailleurs) |
| archived | boolean | Une catégorie archivée reste sur l'historique, disparaît des listes de saisie |
| sortOrder | number | |

Deux catégories spéciales existent en dehors de la table `categories`,
utilisées comme valeurs de `Expense.category` :
- `"Versement"` — voir la mécanique de versement en section 4.
- `"Remboursement Carte Crédit"` — catégorie historique de l'ancien système
  de suivi de carte, avant `CreditCardPayment` (3.8). Exclue partout du
  calcul des dépenses comptées, pour ne pas compter deux fois un montant
  déjà compté au moment de l'achat.

### 3.3 Expense

| Champ | Type | Règle |
|---|---|---|
| id | string | |
| amount | number | Toujours positif |
| category | string | Nom d'une `Category` active, ou une des deux catégories spéciales ci-dessus |
| date | "YYYY-MM-DD" | |
| owner | Owner | |
| cc | boolean | Vrai si chargée à la carte de crédit |
| recurringSourceId | string \| null | Renseigné si générée depuis un `RecurringExpense` confirmé |

### 3.4 Income

| Champ | Type | Règle |
|---|---|---|
| id | string | |
| amount | number | |
| type | string | Libellé libre (ex. "Salaire") |
| date | "YYYY-MM-DD" | |
| owner | Owner | |
| note | string | |
| recurring, recurringInterval, recurringStartMonth | — | **Conservés pour l'affichage uniquement** (badge de fréquence) ; le calcul ne s'appuie plus dessus depuis l'introduction de `RecurringIncome` |
| recurringSourceId | string \| null | Renseigné si générée depuis un `RecurringIncome` confirmé |

### 3.5 RecurringExpense (gabarit)

| Champ | Type | Règle |
|---|---|---|
| id, name, amount, category, owner | — | |
| interval | `'monthly' \| 'weekly' \| 'biweekly' \| 'semimonthly'` | |
| dayOfMonth | number (1-31) | Utilisé si `monthly`/`semimonthly` |
| secondDayOfMonth | number \| null | Utilisé seulement si `semimonthly` |
| startDate | string \| null | Ancrage, utilisé si `weekly`/`biweekly` |
| cc, active | boolean | |

**Règle de confirmation** (`expectedThisMonth`, `budget-store.service.ts`) :
un gabarit mensuel produit une occurrence par mois ; un gabarit
hebdo/aux-2-semaines/2x-mois peut en produire plusieurs. La correspondance
entre occurrences « attendues » et dépenses déjà confirmées se fait **par
compte** (si K occurrences sont attendues et C dépenses de ce mois y sont
déjà liées via `recurringSourceId`, on masque les C premières suggestions)
— jamais par correspondance de date exacte, pour rester correct même si
l'utilisateur change la date avant de confirmer.

### 3.6 RecurringIncome (gabarit)

M�mes champs que `RecurringExpense` (sans `cc`), plus `startDate` toujours
requis (sert aussi de borne de départ pour tous les intervalles, pas
seulement `weekly`/`biweekly`).

**Génération** (`syncRecurringIncomes()`) : chaque paie est une vraie ligne
`Income` datée, générée automatiquement et liée par `recurringSourceId` —
pas une moyenne mensuelle. Conséquence voulue : l'historique d'un mois ne
change plus jamais après coup, et supprimer le gabarit n'efface pas les
paies déjà générées (seules les prochaines s'arrêtent).

### 3.7 Provision (enveloppe) + ProvisionAdjustment

| Champ (Provision) | Type | Règle |
|---|---|---|
| id, name, category, owner | — | |
| amount | number | Montant cible pour un cycle complet |
| everyN | number | Nombre de mois ou de jours entre deux échéances |
| intervalUnit | `'months' \| 'days'` | |
| startYM / startDate | — | Selon `intervalUnit` |
| autoRecalibrate | boolean | |
| allocationPercent | number | Part (%) préremplie dans l'outil « Répartir un versement » ; 0 = pas de préremplissage |
| rollingCount | number | Si ≥ 1, la cible devient la moyenne mobile des N dernières factures réelles plutôt que `amount` fixe |
| monthlyReminder | number \| null | Pense-bête d'auto-contribution mensuelle — **rien n'est jamais ajouté automatiquement**, l'utilisateur confirme lui-même |
| adjustments | ProvisionAdjustment[] | |

`ProvisionAdjustment` : id, amount, date, note, `versementExpenseId?`
(renseigné quand l'ajout vient d'un versement réparti, pour pouvoir
annuler toute la répartition en un clic).

**Les deux règles les plus importantes du modèle entier :**

1. **Cagnotte** = somme des ajustements manuels − paiements réels depuis le
   début du cycle en cours. Jamais de prélèvement automatique sur le
   budget ; peut être négative (facture payée avant d'avoir assez
   économisé).
2. **Dépense comptée pour le budget** (`countedExpenses()`,
   `provision.utils.ts`) : pour une catégorie provisionnée, une facture
   réelle ne compte **que pour la part non couverte** par la cagnotte
   disponible ce jour-là (calcul chronologique, une cagnotte qui s'épuise
   ne peut pas couvrir deux fois le même dollar). **C'est la mise de côté
   elle-même (l'ajustement manuel) qui compte comme « dépense » du mois où
   elle est faite** — pas la facture, quand elle est couverte.

### 3.8 CreditCardPayment

| Champ | Type |
|---|---|
| id, owner, amount, date, note | — |

**Solde dû** (`creditCardBalance()`) = (dépenses réelles marquées `cc`,
hors `Versement` et `Remboursement Carte Crédit`) − (paiements
enregistrés). Se reporte tant qu'il n'est pas payé, jamais borné à un
mois. Modèle **totalement indépendant** de `Provision`/`ProvisionAdjustment`.

### 3.9 SavingsGoal + SavingsContribution

| Champ (SavingsGoal) | Type |
|---|---|
| id, name, targetAmount, owner | — |
| targetDate | string \| null — indicative, jamais contraignante |
| contributions | SavingsContribution[] (id, amount, date, note) |

**Cagnotte** = somme de toutes les contributions. Contrairement à une
`Provision`, aucune notion de « dépensé » : un objectif ne finance pas une
facture précise, il accumule vers une cible.

### 3.10 Clôture de mois

Pas une entité au sens strict — un ensemble de mois clôturés
(`closed_months`, une ligne par `(household_id, ym)`).

**Ce qui est verrouillé** dans un mois clôturé : dépenses, revenus
ponctuels, ajustements de provisions, contributions d'épargne, budgets par
catégorie, report (`rollover`) — tout ce qui est **daté dans ce mois**.

**Ce qui n'est jamais verrouillé**, même dans un mois clôturé : les
entités structurelles qui existent indépendamment d'un mois précis —
`Provision`, `RecurringExpense`/`RecurringIncome` (les gabarits),
`SavingsGoal` elle-même. Clôturer juillet ne doit pas empêcher de renommer
une provision qui existe encore en août.

---

## 4. Calculs canoniques (une seule définition par métrique)

| Métrique | Définition | Source |
|---|---|---|
| Versement reçu | Somme des dépenses de catégorie `Versement` de **l'autre profil**, pour le mois donné | `versementsRecus()` — voir section 6 pour la généralisation à N membres |
| Revenus de base | Revenus du mois (règles de récurrence incluses) + versements reçus (0 en vue Globale : un versement s'annule au niveau du foyer) | `revenueBase()` |
| Budget du mois | Revenus de base + report du mois clôturé précédent | `budgetSummary()` |
| Solde net | Budget − dépenses comptées | `budgetSummary()` |
| Prévision de fin de mois | Sépare la part « provisions » (comptée en entier, jamais extrapolée) de la part « variable » (extrapolée au prorata du jour du mois écoulé) ; uniquement calculée pour le mois réel en cours | `monthForecast()` |
| Budget réellement restant | Budget − dépensé − récurrents attendus non confirmés − manquant des provisions dues ce mois-ci | `remainingBudget()` |
| Alerte : solde négatif | `soldeNet < 0` → critique | `smartAlerts()` |
| Alerte : budget global | Dépassé (montant réel, pas % arrondi) → critique ; ≥ 80 % → avertissement | `smartAlerts()` |
| Alerte : catégorie | Les 2 pires catégories ≥ 80 % de leur budget ; dépassement réel → avertissement, sinon info | `smartAlerts()` |
| Alerte : carte de crédit | Chargé ce mois-ci ≥ 50 % du budget → info | `smartAlerts()` |
| Alertes affichées | Maximum 5, triées critique > avertissement > info | `smartAlerts()` |

---

## 5. Nouvelles entités — Comptes & Investissements

Aucune de ces entités n'existe dans le code aujourd'hui. Conçues pour
rester cohérentes avec les principes déjà en place (pas de double source
de vérité, pas de calcul automatique caché) et avec la décision déjà prise
de rester en saisie manuelle tant qu'il n'y a pas de synchronisation
bancaire (voir `FINA-feuille-de-route-produit.md`, section 5).

### 5.1 Account (Compte)

| Champ | Type | Règle |
|---|---|---|
| id | string | |
| memberId | string \| null | `null` = compte conjoint/partagé, visible de tous les membres |
| name | string | ex. « Compte chèque » |
| institution | string \| null | ex. « Desjardins » |
| type | `'bank' \| 'credit' \| 'investment' \| 'other'` | |
| archived | boolean | Comme `Category` — retirer un compte fermé sans perdre son historique |

**Décision de conception clé — pas de nouvelle vérité sur les montants :**

- **`type: 'credit'`** : le solde reste calculé exactement comme
  aujourd'hui (`creditCardBalance()`, section 3.8) — un `Account` de ce
  type est une simple façade d'affichage sur ce qui existe déjà, aucun
  changement de calcul.
- **`type: 'bank' | 'investment' | 'other'`** : contrairement aux
  dépenses/revenus, **rien ne lie aujourd'hui une transaction à un compte
  bancaire précis** (`Expense`/`Income` n'ont pas de champ compte, juste le
  booléen `cc`). Retrofitter cette relation sur tout l'historique existant
  serait un chantier séparé et plus risqué. Le solde de ces comptes est
  donc un **instantané saisi manuellement** (voir 5.2) — un choix
  délibéré : deux modèles mentaux distincts coexistent (le suivi de budget
  par catégorie d'un côté, la valeur nette par compte de l'autre), plutôt
  que de forcer une correspondance qui n'existe pas dans les données
  actuelles.

### 5.2 AccountBalanceSnapshot

| Champ | Type |
|---|---|
| id | string |
| accountId | string |
| date | "YYYY-MM-DD" |
| balance | number |
| note | string \| null |

Le solde affiché d'un compte `bank`/`investment`/`other` = le
`AccountBalanceSnapshot` le plus récent à la date d'aujourd'hui ou avant.
Un historique de snapshots (pas juste un seul champ `balance` sur
`Account`) permet en plus une mini-tendance dans la page Comptes, et sert
de base au calcul de performance des investissements (5.4).

### 5.3 InvestmentAllocation

| Champ | Type |
|---|---|
| id | string |
| accountId | string (doit être de type `'investment'`) |
| assetClass | string — libre, comme une catégorie (ex. « Actions », « Obligations / FNB », « Crypto », « Liquidités ») |
| percent | number (0-100) |
| date | "YYYY-MM-DD" |

Règle de validation : pour une même `accountId` et une même `date`, la
somme des `percent` doit faire 100. Comme pour les snapshots de solde, on
garde un historique plutôt qu'un seul instantané, pour permettre de voir
l'allocation évoluer dans le temps.

### 5.4 Valeur nette du foyer (nouveau calcul canonique)

```
Valeur nette = Σ soldes des comptes bank + Σ soldes des comptes investment
             − Σ soldes des comptes credit (déjà négatifs par convention)
```

Seuls les comptes non archivés comptent. C'est la définition unique à
utiliser partout (tableau de bord, page Comptes) — jamais recalculée
différemment à deux endroits.

### 5.5 Performance de portefeuille — calcul et limite connue

Plutôt qu'un champ « performance » saisi séparément (qui pourrait diverger
du solde réel), la performance affichée est **dérivée** des
`AccountBalanceSnapshot` :

```
Performance(compte, période) = (solde actuel − solde il y a N mois) / solde il y a N mois
```

**Limite connue, à afficher clairement dans l'interface plutôt qu'à
cacher :** ce calcul ne distingue pas un vrai gain d'un dépôt. Verser
1000 $ dans un compte de courtage ferait apparaître une « performance »
positive qui n'en est pas une. Une vraie mesure de rendement (pondérée par
les dépôts/retraits dans le temps, comme le fait `SavingsGoal` avec ses
contributions) est possible plus tard si la précision devient importante,
mais n'est pas nécessaire pour un premier jet en saisie manuelle — à
condition que l'écran le dise honnêtement (ex. « Variation du solde »
plutôt que « Rendement »).

---

## 6. Généralisation : membres configurables (remplace Owner)

### 6.1 Schéma cible

```ts
interface Member {
  id: string;
  householdId: string;
  displayName: string;   // remplace "moi" / "madame"
  color: string;          // hex, remplace les variables CSS fixes --moi/--madame
  role: 'owner' | 'member';
  active: boolean;        // jamais de suppression dure d'un membre qui a des données liées
}

interface Invitation {
  id: string;
  householdId: string;
  email: string;
  proposedRole: 'owner' | 'member';
  status: 'pending' | 'accepted' | 'revoked';
  createdAt: string;
}
```

`role` ne change rien au comportement observable tant que le foyer n'a que
des membres de confiance totale (le cas aujourd'hui) — il évite juste une
migration de données pénible le jour où un accès plus restreint (lecture
seule pour un comptable, par exemple) devient utile.

### 6.2 Ce qui doit changer dans le code existant

Généraliser à des membres configurables **n'est pas l'ajout d'une table**
— voici, précisément, ce que ça touche :

| Aujourd'hui | Doit devenir |
|---|---|
| `Owner = 'moi' \| 'madame'` (type figé) | `memberId: string` (dynamique) |
| `versementsRecus()` suppose implicitement « l'autre » profil | `Expense` gagne `versementToMemberId: string \| null` ; `versementsRecus(memberId, ym)` = somme des dépenses `Versement` où `versementToMemberId === memberId`, peu importe l'émetteur — n'importe quel membre peut verser à n'importe quel autre |
| `rolloverFor('global', ym)` = `rolloverFor('moi') + rolloverFor('madame')` (addition à 2 termes codée en dur) | Somme sur tous les membres actifs du foyer (boucle) |
| `creditCardBalance('global')` = même pattern à 2 termes codé en dur | Idem, boucle sur tous les membres actifs |
| `MonthlyAmountMap` / `CategoryBudgetMap` = `Record<Owner, ...>` (2 clés fixes) | `Record<string, ...>` par `memberId`, en pratique une vraie colonne `member_id` en base plutôt qu'un objet à 2 clés |
| `createHousehold(ownerLabel: Owner, ...)` / `joinHousehold(code, ownerLabel: Owner)` — on choisit entre 2 labels fixes en rejoignant | On saisit son nom affiché ; le rôle est déterminé par créateur (`owner`) vs invité (`member`) |

### 6.3 Migration des données existantes

Une migration en une seule transaction Supabase (jamais en plusieurs
étapes, pour éviter un état intermédiaire incohérent) :

1. Créer deux lignes dans la nouvelle table `members` pour chaque foyer
   existant, reprenant les noms affichés actuels (« Moi » / le nom de
   Madame) et les couleurs déjà utilisées dans l'interface.
2. Dans chaque table qui référence aujourd'hui `Owner`
   (`expenses.owner`, `incomes.owner`, `provisions.owner`,
   `recurring_expenses.owner`, `recurring_incomes.owner`,
   `savings_goals.owner`, `credit_card_payments.owner`, les clés de
   `budgets`/`category_budgets`/`rollovers`) : remplacer la valeur
   `'moi'`/`'madame'` par l'`id` du membre correspondant.
3. Pour les versements déjà existants (`category = 'Versement'`) :
   renseigner `versementToMemberId` à partir de la règle actuelle
   (l'émetteur était « moi » → destinataire = membre « madame », et
   inversement), pour que l'historique reste lisible avec la nouvelle
   règle générale.

Aucune perte de données à aucune étape — uniquement un renommage de
valeurs et l'ajout d'un champ sur les versements historiques.

### 6.4 État au 13 septembre 2026

**Exécutée et validée sur le projet Supabase réel le 13 septembre 2026.**
Historique complet des étapes 6.4.1 à 6.4.3 ci-dessous.

#### 6.4.1 Écriture et test local (12 septembre 2026)

Le script (`supabase/migration-024-owner-to-member.sql`) a été écrit et
**testé sur une base Postgres locale** (schéma complet + jeu de données
factice) avant toute exécution sur le projet réel.

Le code TypeScript a été adapté en mode transitoire : `Member` et
`memberId` sont disponibles, le store charge les membres dynamiques et
agrège la vue globale sur N membres, tandis que les mappings et écritures
gardent un repli `owner` selon que `useMemberSchema()` détecte ou non le
nouveau schéma. Cette compatibilité doit être retirée après une courte
période de rodage en production (voir section 9).

Décision d'implémentation, à noter ici pour la suite : le script crée une
**table `members` séparée** (plutôt que de généraliser `household_members`
en place). `household_members` garde son rôle actuel — relier un compte
connecté (`user_id`) à un foyer — et gagne une colonne `member_id` vers
cette nouvelle table. `members` porte `display_name`/`color`/`role`/
`active`, exactement le schéma de 6.1. Une table `invitations` (6.1) est
également créée, structurellement prête, mais sans RPC pour l'utiliser
pour l'instant (aucune fonctionnalité d'invitation n'existe encore côté
appli).

Cas particulier géré par le script : pour un foyer où un seul compte
s'est déjà inscrit (`household_members` n'a qu'une ligne), la migration
crée quand même les deux membres historiques « Moi » et « Madame », le
second restant non relié à un compte (« fantôme ») jusqu'à ce que la
deuxième personne rejoigne réellement — `join_household()` (voir 6.2) a
été réécrite pour reconnaître ce cas et relier le compte au membre
existant plutôt que d'en créer un second.

Testé concrètement en local (pas seulement relu) : création de foyer,
jonction d'un foyer (y compris le cas du membre fantôme ci-dessus),
répartition de versement, import de sauvegarde, et l'arrivée d'un vrai 3ᵉ
membre dans un foyer qui en avait déjà deux — les 6 scénarios passent.

#### 6.4.2 Exécution en production (13 septembre 2026)

Après exécution de `migration-023-accounts.sql` puis
`migration-024-owner-to-member.sql` sur le projet Supabase réel, l'API
(PostgREST) a continué à renvoyer des 404 sur `accounts`,
`account_balance_snapshots` et `members` malgré des tables bien créées
(confirmé directement via `information_schema.tables` et
`pg_constraint`, indépendamment du cache) : cache de schéma PostgREST pas
rafraîchi automatiquement après la migration. Réglé par
`notify pgrst, 'reload schema';` — **à faire systématiquement après toute
migration qui crée ou renomme une table**, ce n'est pas automatique côté
Supabase.

Effet de bord sans rapport avec la migration elle-même : deux foyers
existaient dans la base (un vrai avec les données, un second vide, issu
des tests manuels de `create_household()` faits pendant la validation
locale). Nettoyé manuellement après coup — la migration n'a strictement
rien créé en double, `on conflict (household_id, display_name) do
nothing` a fonctionné comme prévu dans chacun des deux foyers.

#### 6.4.3 Validation post-exécution (13 septembre 2026)

Vérifié directement en production, pas seulement en local :

- `members` contient exactement les 2 membres historiques (« Moi »,
  « Madame ») avec les bonnes couleurs, pour le vrai foyer.
- Zéro ligne orpheline (`member_id is null`) sur les 10 tables migrées.
- Le compte connecté est bien rattaché au foyer qui a les données (pas au
  foyer de test).
- Tableau de bord identique à avant la migration (mêmes soldes, mêmes
  totaux) — le repli `owner`/nouveau schéma n'a rien changé côté affichage.
- Ajout d'une dépense réelle : enregistrée et affichée avec le bon nom et
  la bonne couleur de membre.
- **Répartition de versement testée de bout en bout** (le chemin de code
  le plus délicat de toute la migration, celui qui contourne la limite à
  2 membres de la RPC `split_versement_into_provisions` en créant la
  dépense côté client avant d'appeler la RPC — voir 6.2) : versement
  créé, réparti sur une provision existante, montant de la provision
  augmenté correctement, flèche « de → vers » correcte dans la liste des
  dépenses.

Aucune régression trouvée. La migration est considérée complète et
validée, pas seulement exécutée.

---

## 7. Nouvelle alerte : rappel de mois non clôturé

Décision prise : pas de verrouillage automatique, pas de confirmation à
chaque modification — un **rappel actif**, séparé des `smartAlerts`
existantes (qui sont plafonnées à 5 et scopées au mois affiché, donc pas
un bon endroit pour un rappel qui doit rester visible peu importe le mois
consulté).

**Règle proposée** (à valider — c'est un choix, pas un fait) :

- Pour chaque mois strictement antérieur au mois civil réel actuel : s'il
  existe au moins une dépense ou un revenu daté dans ce mois **et** que ce
  mois n'est pas dans `closedMonths`, c'est un candidat au rappel.
- Fenêtre glissante de **3 mois civils** : au-delà, on considère que ce
  n'est plus un oubli actif mais un choix délibéré de ne pas clôturer — pas
  la peine d'alerter indéfiniment sur un historique ancien.
- Sévérité `info`, affichée dans un emplacement dédié du tableau de bord
  (pas mélangée aux `smartAlerts`, pour ne pas prendre une des 5 places
  au détriment d'une alerte plus urgente).
- Message avec action directe : « Juillet 2026 n'est pas encore clôturé »
  + un bouton qui clôture immédiatement depuis l'alerte.

La fenêtre de 3 mois est une proposition raisonnable, pas une règle
gravée — à ajuster une fois en usage réel si elle sonne trop ou pas assez
souvent.

---

## 8. Récapitulatif : vérifié dans le code vs conçu ici

| Entité / règle | Statut |
|---|---|
| Expense, Income, RecurringExpense, RecurringIncome, Category | ✅ Existe, vérifié dans le code |
| Provision, ProvisionAdjustment, CreditCardPayment | ✅ Existe, vérifié dans le code |
| SavingsGoal, SavingsContribution, Clôture de mois | ✅ Existe, vérifié dans le code |
| Tous les calculs de la section 4 | ✅ Existe, vérifié dans le code |
| Account, AccountBalanceSnapshot, InvestmentAllocation | ✅ Schéma Supabase construit (`migration-023-accounts.sql`) ; ⬜ écran `/comptes` à l'état de brouillon non commité, en pause (voir `plan-industrialisation.md`, vague B) |
| Valeur nette, Performance de portefeuille | 🆕 Conçu ici, rien construit |
| Member généralisé, Role, Invitation | ✅ Schéma Supabase construit, **exécuté et validé en production** (`migration-024-owner-to-member.sql`, section 6.4) ; ✅ support TypeScript |
| Migration Owner → Member (section 6.2/6.3) | ✅ Écrite, testée localement, **exécutée et validée en production le 13 septembre 2026** (section 6.4) ; ⬜ retrait du repli legacy `owner`/`useMemberSchema()` après une courte période de rodage |
| Rappel de mois non clôturé | 🆕 Conçu ici, rien construit |

---

## 9. Prochaines étapes

1. ✅ Relire ce document en entier avant d'écrire la moindre migration
   Supabase.
2. ✅ Écrire et tester la migration Owner → Member (section 6) — prérequis
   pour Comptes (5.1, `memberId`), à faire dans cet ordre, pas en
   parallèle. **Fait le 12 septembre 2026** (section 6.4.1).
3. ✅ Préparer la bascule TypeScript Owner → Member avec une compatibilité
   transitoire avant la migration distante : modèles, mappings, store,
   setup-household, sélecteur et formulaires sont adaptés; les tests et le
   build passent.
4. ✅ Exécuter `migration-024-owner-to-member.sql` sur le projet Supabase
   réel et valider en production. **Fait le 13 septembre 2026**
   (section 6.4.2/6.4.3) — schéma, données, écritures et répartition de
   versement tous vérifiés en conditions réelles, aucune régression.
5. **Prochaine étape réelle** — dans cet ordre :
   1. Courte période de rodage en usage normal avant de retirer la
      compatibilité transitoire (pas de délai fixé — le temps de voir
      l'appli utilisée normalement quelques jours).
   2. Retirer le repli `owner`/`useMemberSchema()` dans
      `budget-store.service.ts`/`supabase-mappers.ts`/`budget.models.ts`
      une fois ce rodage jugé suffisant.
   3. Ajouter les tests qui manquent sur le nouveau schéma (le chemin
      `useMemberSchema() === true` n'a aucune couverture automatisée
      actuellement — tout ce qui a été vérifié l'a été manuellement en
      production, voir 6.4.3).
   4. Écrire les RPC manquantes pour un futur écran Paramètres (renommer
      un membre, changer sa couleur, le désactiver, gérer une invitation)
      — `members`/`invitations` existent mais rien ne les modifie encore.
   5. Reprendre pour de vrai le brouillon `/comptes` (mis en pause, voir
      `plan-industrialisation.md`) une fois les points ci-dessus faits.
6. Une fois tout ce qui précède fait, ce document devient la référence
   unique que `plan-industrialisation.md` (vague B) doit suivre pour le
   schéma Supabase et les nouveaux écrans.
