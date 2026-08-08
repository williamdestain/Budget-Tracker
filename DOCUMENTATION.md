# 📒 Traqueur de Budget — Documentation

Documentation technique et fonctionnelle du traqueur de budget personnel.
Ce fichier est la **référence** pour comprendre l'application et poursuivre l'ajout de fonctionnalités.

- **Fichier unique** : `budget-tracker.html` (HTML + CSS + JS pur, aucune dépendance externe)
- **Stockage** : `localStorage` (persistance durable sur le disque, survit aux fermetures/redémarrages) + **sauvegarde/restauration par fichier `.json`**
- **Langue** : Français (Canada), montants en CAD
- **Roadmap** : voir `ROADMAP_AMELIORATIONS.md` pour les idées d'évolution priorisées

---

## 📋 Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Fonctionnalités actuelles](#2-fonctionnalités-actuelles)
3. [Architecture du fichier](#3-architecture-du-fichier)
4. [Modèle de données (state)](#4-modèle-de-données-state)
5. [Concepts clés & logique métier](#5-concepts-clés--logique-métier)
6. [Référence des fonctions](#6-référence-des-fonctions)
7. [Structure CSS](#7-structure-css)
8. [Guide d'extension (comment ajouter X)](#8-guide-dextension-comment-ajouter-x)
9. [Idées de fonctionnalités futures](#9-idées-de-fonctionnalités-futures)
10. [Pièges & conventions](#10-pièges--conventions)

---

## 1. Vue d'ensemble

Traqueur de budget familial permettant de suivre les dépenses de **deux profils** (Moi / Madame) avec une vue **Global** agrégée. Conçu pour la réalité d'un budget Québec/Canada : taxes municipales trimestrielles, assurances annuelles, REER/REEE/CELI, etc.

**Objectifs principaux :**
- Suivre les dépenses par catégorie et par mois
- Visualiser la répartition (camembert) et la progression vs budget
- Gérer les **dépenses irrégulières** (provisions / fonds de réserve)
- Suivre ce qui transite par la **carte de crédit**
- Gérer les **transferts internes** (versements entre profils)

---

## 2. Fonctionnalités actuelles

### ✅ Core
- Ajout de dépense : montant, catégorie, date, **payé par** (Moi/Madame), **carte de crédit** (coche)
- **31 catégories** prédéfinies (voir liste complète en §4)
- Liste des dépenses triée par date, suppression individuelle
- **Total dépensé** + nombre de dépenses
- **Graphique en camembert** (donut SVG interactif, sans librairie) avec légende
- **Budget mensuel par profil et par mois** + barre de progression (🟢 < 80% / 🟠 80-100% / 🔴 > 100%). Chaque mois a son propre budget ; un mois non défini **hérite** du mois précédent (voir §5.7)

### ✅ Multi-profils
- Onglets **Moi / Madame / Global** (bleu / rose / vert)
- Chaque dépense a un `owner` ; Global = somme des deux
- Budget défini par profil **et par mois** ; Global = somme automatique (lecture seule)

### ✅ Navigation temporelle
- Navigation par mois (‹ ›) — gère les dépenses irrégulières au bon mois
- Vue **« Ce mois »** / **« Tout »** (cumul) / **« Aujourd'hui »** (retour au mois courant)

### ✅ Versements (transferts internes)
- Catégorie **« Versement »** : l'argent passe d'un profil à l'autre
- Chez l'**expéditeur** : compte comme une dépense
- Chez le **destinataire** : augmente son budget (mois concerné uniquement)
- En **Global** : **s'annule** (transfert interne, pas d'argent créé/détruit)
- Affichage dédié : badge direction `Mme → Moi`, notation `−X / +X`

### ✅ Carte de crédit
- Coche **« 💳 Carte de crédit »** sur chaque dépense
- La dépense reste dans sa vraie catégorie (pas de double comptage)
- Encart dédié : **total chargé** + **répartition par catégorie** pour la période
- Badge 💳 sur les lignes concernées
- *Note : la catégorie « Remboursement Carte Crédit » est exclue de l'encart*

### ✅ Provisions (fonds de réserve)
- Pour lisser les dépenses irrégulières (taxes trimestrielles, assurance annuelle…)
- Définition : nom, catégorie liée, montant échéance, fréquence (N mois), début, propriétaire
- **Réserve mensuelle** = montant ÷ N, comptée chaque mois comme dépense
- **Ajout manuel au fonds** : montant ponctuel daté, historisé, compté comme réserve supplémentaire du mois
- **Paiement réel absorbé** par la cagnotte (pas de double comptage)
- Panneau : cagnotte, objectif, statut (Prêt / En accumulation / Déficit), prochaine échéance

### ✅ Sauvegarde & restauration (persistance durable)
- **Persistance locale** : les données survivent à la fermeture de l'onglet/navigateur (migration de `sessionStorage` → `localStorage`, même clé `budget_tracker_v2`)
- **💾 Sauvegarder** : télécharge un fichier `.json` (nommé `budget-AAAA-MM-JJ.json`) contenant `expenses`, `provisions`, `budgets` + un horodatage
- **📂 Restaurer** : ouvre un sélecteur de fichier, valide le format, **demande confirmation** puis remplace l'état courant (mêmes règles de migration que `load()`)
- Les champs `view` (mois/cumul) et `current` (mois consulté) ne sont **ni exportés ni restaurés** → l'app revient toujours au mois courant après restauration

---

## 3. Architecture du fichier

```
budget-tracker.html
├── <style>                  ← Tout le CSS (variables CSS + responsive)
├── <body>
│   ├── header               ← Titre + sous-titre
│   ├── .tabs                ← Onglets profil (Moi/Madame/Global)
│   ├── .card.topbar         ← Période (nav mois) + Budget (input + progress)
│   ├── .card (formulaire)   ← Ajout dépense (montant/cat/date/owner/cc)
│   ├── .card.cc-card        ← Encart carte de crédit
│   ├── .card.prov-card      ← Encart provisions (+ formulaire CRUD inline)
│   └── .main-grid
│       ├── .card (chart)    ← Donut SVG + légende
│       └── .card (list)     ← Liste des dépenses
├── .toast                   ← Notifications (fixe en bas)
└── <script>                 ← Toute la logique JS
    ├── Constantes (CATEGORIES, COLORS, OWNERS)
    ├── State + load/save
    ├── Helpers (dates, format, calculs provisions)
    ├── Filtrage (visibleExpenses, countedExpenses, profileBudget)
    ├── Rendu (renderTabs, renderBudget, renderChart, renderCreditCard, renderProvisions, renderList)
    ├── Actions (addExpense, removeExpense, setBudget, addProvision, removeProvision)
    └── init()               ← Bindings événements + seed
```

---

## 4. Modèle de données (state)

Objet global `state`, persisté via `localStorage` (clé `budget_tracker_v2`). Les champs `view` et `current` sont volontairement non persistés (retour au mois courant au démarrage). Un **fichier `.json`** peut aussi être exporté/importé pour sauvegarde externe :

```js
state = {
  expenses: [        // Dépenses réelles
    {
      id: "string",        // identifiant unique
      amount: 85.00,       // montant en CAD
      category: "Téléphone", // une des CATEGORIES
      date: "2026-06-15",  // YYYY-MM-DD
      owner: "moi",        // "moi" | "madame"
      cc: true             // passé par carte de crédit ?
    }
  ],
  provisions: [      // Provisions / fonds de réserve
    {
      id: "string",
      name: "Taxe foncière",
      category: "Taxe fonciere/municipale", // catégorie couverte
      amount: 1500,        // montant à chaque échéance
      everyN: 3,           // fréquence en mois
      startYM: "2026-03",  // début du cycle (YYYY-MM)
      adjustments: [       // ajouts manuels au fonds
        {
          id: "string",
          amount: 100,
          date: "2026-07-18",
          note: "Extra ce mois-ci"
        }
      ],
      owner: "moi"         // "moi" | "madame"
    }
  ],
  budgets: {         // budget mensuel, par profil ET par mois
    moi: { "2026-06": 1800, "2026-07": 1900 },  // { "YYYY-MM": montant }
    madame: { "2026-06": 1200 }                  // mois manquant → hérite du précédent
  },
  view: "month",     // "month" (mois consulté) | "all" (tout)
  activeOwner: "moi",// "moi" | "madame" | "global"
  current: "2026-06" // mois consulté (YYYY-MM)
}
```

### Liste des 31 catégories
```
Loyer, Garderie, REEE, Assurance Auto, Assurance Maison, Assurance Pret,
Assurance Invalidité, Assurance Maladie, Assurance Maladie enfants, Internet,
Téléphone, Pret voiture, REER W, Epargne W, Celi W, Electricité, Courses,
Sport, Essence, Santé/médecine, Autre Dépense, Taxe fonciere/municipale,
Taxe scolaire, Transport, Nespresso, REER E, Epargne E, Epg QC--Bonifié,
Exceptionnel, Remboursement Carte Crédit, Versement
```

> ⚠️ **Versement** et **Remboursement Carte Crédit** ont un traitement spécial (voir §5).

### Migration
La fonction `load()` délègue à `applyData(data)` qui gère la migration depuis les anciennes versions (logique partagée avec `importData()`) :
- v1 → v2 : ajout de `owner` (défaut "moi") et transformation du `budget` unique en `budgets.moi`
- ajout récent : `cc` (défaut `false`)
- **Budget par mois** : l'ancien format `{ moi: 1800, madame: 1200 }` (nombre unique partagé) est migré en plaçant la valeur dans le mois courant (`state.current`) comme point de départ ; l'héritage (`budgetFor`) la propage vers les mois suivants. Le nouveau format `{ moi: { "YYYY-MM": n } }` est recopié tel quel.

---

## 5. Concepts clés & logique métier

### 5.1 Trois sources de données dans les rendus

| Fonction | Rôle | Utilisée par |
|----------|------|--------------|
| `visibleExpenses()` | Dépenses réelles filtrées par **profil + période** | Liste, carte de crédit |
| `countedExpenses()` | Dépenses **comptabilisées** dans le total (avec provisions synthétiques, sans doubles) | Budget, graphique, liste |
| `profileBudget()` | Budget effectif du profil actif pour la période (mois consulté, ou cumul Tout) | Barre de progression |

### 5.2 Le triple filtrage ( profil × période × type )

```
visibleExpenses()
  ├─ filtre owner : global = tout, sinon = owner du profil
  └─ filtre période : "all" = tout, sinon = state.current (YYYY-MM)

countedExpenses() = visibleExpenses()
  ├─ EXCLUT versements en vue global (transferts internes)
  ├─ EXCLUT paiements réels d'une catégorie provisionnée (absorbés)
  └─ AJOUTE réserves synthétiques des provisions (1 par mois/provision)
```

### 5.3 Versements — logique d'annulation

```
Madame envoie 500$ à Moi (Versement, owner=madame) :
  ├─ Vue Moi    : budget += 500 (versementsRecus), pas de dépense
  ├─ Vue Madame : dépense +500 (comptée), budget inchangé
  └─ Vue Global : EXCLU du total (s'annule entre profils)
```
`versementsRecus(owner, ym)` calcule les versements reçus (envoyés par l'autre profil).

### 5.4 Carte de crédit — pas de double comptage

```
Dépense Téléphone 85$, cc=true :
  ├─ Comptée DANS sa catégorie (Téléphone) — une seule fois
  ├─ Marquée 💳 dans la liste
  └─ Apparaît dans l'encart carte (total + répartition par catégorie)

Ne JAMAIS saisir aussi dans "Remboursement Carte Crédit" → double comptage.
```

### 5.5 Provisions — le lissage

```
Provision : 1500$ tous les 3 mois, début 2026-03
  ├─ Mois 1 (mars)  : réserve +500  → cagnotte 500
  ├─ Mois 2 (avril) : réserve +500  → cagnotte 1000
  ├─ Mois 3 (mai)   : réserve +500  → cagnotte 1500 = échéance ✓
  ├─  Mois 4...     : nouveau cycle
  ├─ Ajout manuel de 100$ en avril : cagnotte +100 et réserve supplémentaire en avril
  └─ Paiement réel de 1500$ en mai : ABSORBÉ (catégorie couverte)

→ Le budget mensuel reflète le VRAI coût lissé (500/mois), pas de pic à 1500.
```

**Helpers de calcul provisions :**
- `provisionMonthly(p)` → `p.amount / p.everyN`
- `provisionPot(p, currentYM)` → réserves cumulées + ajouts manuels − paiements réels (peut être négatif)
- `provisionAdjustmentsForMonth(p, ym)` / `provisionAdjustmentTotal(p, ym)` → ajouts au fonds
- `isHitMonth(p, currentYM)` → vrai si mois d'échéance
- `provisionNextHit(p, currentYM)` → prochain mois d'échéance
- `provisionSpent(p, currentYM)` → somme des paiements réels de la catégorie

### 5.6 Le cycle de rendu

Toute modification appelle `renderAll()` qui actualise **tout** :
```js
renderAll() → renderTabs, updateTitles, renderPeriod, renderBudget,
              renderChart, renderCreditCard, renderProvisions, renderList
```
Après chaque action (ajout/suppression/changement d'onglet), `save()` puis `renderAll()`.

### 5.7 Budget par mois & héritage

Chaque mois a son **propre budget** (par profil). Un mois sans budget explicite **hérite** de la dernière valeur définie avant lui.

```
budgets.moi = { "2026-06": 1800, "2026-07": 1900 }
  ├─ juin  (2026-06) : 1800  (défini)
  ├─ juillet (2026-07) : 1900  (défini)
  ├─ août   (2026-08) : 1900  (hérité de juillet)
  └─ mai    (2026-05) : 0     (rien avant juin → 0)
```

- `budgetFor(owner, ym)` remonte les mois précédents jusqu'à trouver une valeur (borne 600 mois ≈ 50 ans), sinon 0.
- `setBudget(val)` n'écrit que dans `state.budgets[owner][state.current]` → modifier juillet **n'affecte pas** juin ni août.
- Vue **Tout** : `profileBudget()` somme `baseProfileBudget(owner, m)` sur chaque mois d'activité (`activeMonths()`), donc un budget variable d'un mois à l'autre est correctement cumulé.
- Vue **Global** : somme des budgets des deux profils, mois par mois (lecture seule).

---

## 6. Référence des fonctions

### Constantes
- `CATEGORIES` — tableau des 31 catégories
- `COLORS` / `COLOR_MAP` — palette HSL générée (angle d'or pour 31 teintes)
- `OWNERS` / `OWNERS_SHORT` — libellés des profils

### State
- `save()` / `load()` — persistance localStorage + migration
- `applyData(data)` — applique un objet brut à `state` (migration rétro-compatible v1→v2) ; utilisé par `load()` et `importData()`
- `ymOf(date)` → `"YYYY-MM"` ; `uid()` → id unique

### Sauvegarde / restauration
- `exportData()` — télécharge un fichier `.json` (Blob + `createObjectURL`)
- `importData(file)` — lit un fichier `.json` (FileReader), valide, confirme, puis applique

### Dates
- `monthsBetween(startYM, endYM)` — nb de mois (inclusif)
- `addMonths(ym, n)` — décale un YYYY-MM
- `monthLabel(ym)` / `fmtDate(iso)` / `fmt(n)` — formatage fr-CA

### Filtrage
- `visibleExpenses()` — dépenses réelles filtrées (profil + période)
- `countedExpenses()` — dépenses comptabilisées (avec provisions synthétiques)
- `provisionedCategories()` — Set des catégories couvertes par une provision
- `profileBudget()` — budget effectif (mois consulté ou cumul Tout)
- `budgetFor(owner, ym)` — budget d'un profil pour un mois (avec héritage du mois précédent)
- `baseProfileBudget(owner, ym)` — budget de base d'un mois (sans versements) ; global = somme des deux profils
- `activeMonths()` — liste triée des mois d'activité (pour la vue Tout)
- `versementsRecus(owner, ym)` / `versementsRecusView()`

### Provisions
- `provisionsForOwner(owner)` — provisions du profil (global = toutes)
- `provisionMonthly(p)` / `provisionPot(p, ym)` / `provisionSpent(p, ym)`
- `provisionAdjustmentsForMonth(p, ym)` / `provisionAdjustmentTotal(p, ym)` — ajouts manuels au fonds
- `isHitMonth(p, ym)` / `provisionNextHit(p, ym)` / `provisionExpectedHits(p, ym)`

### Rendu
- `renderAll()` — point d'entrée principal
- `renderTabs()` / `updateTitles()` / `renderPeriod()`
- `renderBudget()` — input + barre de progression + statut
- `renderChart()` — donut SVG + légende interactive
- `renderCreditCard()` — encart carte (total + répartition)
- `renderProvisions()` — encart provisions (cagnotte, statut, prochaine échéance)
- `renderList()` — liste dépenses (réelles + réserves synthétiques)

### Actions
- `addExpense(amount, category, date, owner, cc)`
- `removeExpense(id)`
- `setBudget(val)` — ajuste le budget du profil actif
- `addProvision(name, category, amount, everyN, startYM, owner)`
- `addProvisionAdjustment(provisionId, amount, date, note)` — ajoute un montant ponctuel au fonds
- `removeProvisionAdjustment(provisionId, adjustmentId)` — supprime un ajout manuel
- `removeProvision(id)`
- `shiftMonth(delta)` — navigation ‹ ›
- `toast(msg)` — notification temporaire

---

## 7. Structure CSS

### Variables (`:root`)
Palette centralisée : `--bg`, `--card`, `--ink`, `--ink-soft`, `--line`, `--accent`, `--green`, `--red`, `--amber`, `--pink` (Madame), `--teal` (Global), radius, shadows.

### Convention de couleurs par profil
- **Moi** : `--accent` (bleu `#4f7cff`)
- **Madame** : `--pink` (`#d6457d`)
- **Global** : `--teal` (`#0f9d8f`)

### Composants
- `.card` — conteneur blanc arrondi
- `.tab` / `.seg` / `.icon-btn` — contrôles
- `.progress-fill` + classes `.warn` / `.over` — barre de progression
- `.expense` + `.versement-row` / `.prov-reserve` — lignes de liste spécialisées
- `.donut-wrap circle.seg` — segments du camembert
- `.legend-item` — légende
- `.cc-*` / `.prov-*` — encarts carte et provisions

### Responsive
Breakpoints `860px` (tablette, grille → 2 col) et `480px` (mobile, 1 col).

---

## 8. Guide d'extension (comment ajouter X)

### ➕ Ajouter une catégorie
1. Ajouter le nom dans le tableau `CATEGORIES`
2. La couleur est générée automatiquement (pas d'action supplémentaire)
3. Si elle doit avoir un traitement spécial → prévoir la logique (voir Versement)

### ➕ Ajouter un champ à une dépense
1. Ajouter le champ dans le HTML du formulaire (`#expenseForm`)
2. Étendre l'objet dans `addExpense()` + la migration dans `load()`
3. Gérer l'affichage dans `renderList()`
4. Si ça impacte le total → adapter `countedExpenses()`

### ➕ Ajouter une action de rendu
1. Créer la fonction `renderXxx()`
2. L'ajouter dans `renderAll()`

### ➕ Ajouter un nouvel encart
1. HTML : `<div class="card" id="xxxCard">...</div>`
2. CSS : styles associés
3. JS : fonction `renderXxx()` + ajout dans `renderAll()`

### ➕ Changer la logique de filtrage
- Visible mais non compté → modifier `countedExpenses()`
- Budget → modifier `profileBudget()`

### ➕ Export / import de données
**Déjà implémenté** (voir §2 « Sauvegarde & restauration »).
- `exportData()` sérialise `{ expenses, provisions, budgets }` (+ horodatage) vers un `.json` via `Blob` + `createObjectURL`.
- `importData(file)` lit le fichier (`FileReader`), valide (`expenses` tableau + `budgets` objet), confirme, puis appelle `applyData()` (même migration que `load()`).
- Pour étendre le format d'export : modifier le `payload` dans `exportData()` et garder `applyData()` rétro-compatible.

---

## 9. Idées de fonctionnalités futures

- [ ] **Bouton « Marquer comme payé »** dans le panneau provisions (saisit auto le paiement à la bonne date)
- [x] ~~**Ajout manuel au fonds de réserve**~~ ✅ Fait
- [x] ~~**Export CSV / JSON** des dépenses pour archivage~~ ✅ Fait (export `.json`)
- [x] ~~**Persistence longue durée** (localStorage au lieu de sessionStorage)~~ ✅ Fait
- [ ] **Budget par catégorie** (sous-budgets : 300$ courses, 150$ essence…)
- [x] ~~**Budget par mois** (chaque mois a son propre budget, avec héritage)~~ ✅ Fait
- [ ] **Comparaison mois vs mois précédent** (évolution)
- [ ] **Solde de carte de crédit** qui évolue (charges − remboursements) pour rapprochement relevé
- [ ] **Vue annuelle** (12 mois en barres) par catégorie
- [ ] **Recherche / filtre** dans la liste des dépenses
- [ ] **Édition d'une dépense** existante (pas seulement suppression)
- [ ] **Catégories personnalisables** (ajout/suppression par l'utilisateur)
- [ ] **Mode sombre** (les variables CSS le facilitent)
- [ ] **PWA** (installation, offline)

---

## 10. Pièges & conventions

### ⚠️ À retenir
- **Toujours** appeler `save()` puis `renderAll()` après une modification d'état.
- **Ne jamais** compter deux fois la même dépense : les provisions absorbent les paiements réels, la carte ne duplique pas.
- Les **ajouts manuels de provision** vivent dans `provision.adjustments` : ils augmentent la cagnotte et sont comptés comme réserves supplémentaires, pas comme paiements réels.
- Le **mode Global** annule les versements (transferts internes) — ne pas les compter dans le total global.
- Les **réserves synthétiques** ont `provision: true` et un `id` préfixé `prov-` : les distinguer des dépenses réelles dans `renderList`.
- La migration dans `load()` doit rester **rétro-compatible** (anciens champs → nouveaux avec défauts).

### 🎨 Conventions de code
- Noms de fonctions : `renderXxx`, `addXxx`, `removeXxx`, `xxxForOwner`
- Dates internes : toujours `YYYY-MM-DD` ou `YYYY-MM`
- Montants : `fmt(n)` pour l'affichage (Intl CAD fr-CA)
- Couleurs : via `COLOR_MAP[catégorie]`, jamais en dur

### 🐛 Debug rapide
- `console.log(state)` — voir l'état complet
- Les toasts confirment chaque action
- Le seed d'exemple (`seedExample()`) ne se déclenche qu'au tout premier lancement

---

*Document mis à jour le 2026-06-29 (persistance localStorage + sauvegarde/restauration JSON), 2026-06-30 (budget par mois avec héritage). Pour toute nouvelle fonctionnalité, ajouter une entrée en §2 (fonctionnalités), §5 (logique) si pertinent, et cocher dans §9 (idées).*
