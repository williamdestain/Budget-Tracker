# Plan de refonte UI/UX — Traqueur de Budget

## 1. Objectif

Faire évoluer **Traqueur de Budget** vers une application de gestion financière personnelle complète, moderne et agréable à utiliser :

- sur PC ;
- sur tablette ;
- sur téléphone ;
- sans supprimer aucune fonctionnalité existante ;
- sans réécrire inutilement la logique métier Supabase ;
- avec une navigation claire entre les différentes fonctions.

La règle principale du projet sera :

> **On réorganise l'expérience utilisateur avant de réorganiser la logique métier.**

L'objectif n'est pas de mettre toutes les fonctions sur une seule grande page. On conserve une SPA Angular, mais on crée plusieurs **vues métier** accessibles depuis une navigation commune.

---

## 2. Architecture UX globale proposée

### Desktop

```text
┌───────────────────┬────────────────────────────────────────────────────┐
│ 💰 Traqueur       │  Header                                             │
│    de Budget      │  Mois ← Août 2026 →     Moi | Madame | Global      │
│                   ├────────────────────────────────────────────────────┤
│ 🏠 Vue d'ensemble │                                                    │
│ 💰 Revenus        │                     CONTENU DE LA VUE               │
│ 💸 Dépenses       │                                                    │
│ 🏦 Provisions     │                                                    │
│ 🎯 Budgets        │                                                    │
│ 💳 Carte crédit   │                                                    │
│ 🔄 Récurrentes    │                                                    │
│ 🐷 Épargne        │                                                    │
│ 📊 Analyses       │                                                    │
│ 📈 Comparaisons   │                                                    │
│ 📅 Vue annuelle   │                                                    │
│                   │                                                    │
│ ───────────────── │                                                    │
│ 💾 Sauvegarder    │                                                    │
│ ↩ Restaurer       │                                                    │
│ ⚙ Données        │                                                    │
└───────────────────┴────────────────────────────────────────────────────┘
```

### Mobile

```text
┌─────────────────────────────┐
│ ☰   Traqueur   🔔   👤      │
├─────────────────────────────┤
│                             │
│       CONTENU DE LA VUE     │
│                             │
├─────────────────────────────┤
│ 🏠      💰      📊      ☰  │
│ Accueil Budget Analyse Plus │
└─────────────────────────────┘
```

La navigation mobile ne doit pas être une simple sidebar compressée. Les écrans sont pensés pour le tactile et pour une lecture verticale.

---

# 3. Aperçu visuel de chaque page

## 3.1 — 🏠 Vue d'ensemble

### Rôle

Le cockpit quotidien. En 5 à 10 secondes, l'utilisateur doit comprendre :

- combien il a de budget ;
- combien il a dépensé ;
- son solde ;
- le taux d'utilisation ;
- ce qui risque d'arriver ;
- ce qu'il doit surveiller.

### Aperçu desktop

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Août 2026              Moi | Madame | Global                         │
├───────────┬───────────┬───────────┬───────────┬──────────────────────┤
│ Budget    │ Dépensé   │ Solde net │ Utilisation                        │
│ 5 656 $   │ 5 399 $   │ +256 $     │ 95 %                              │
├───────────────────────────────────────────────────────────────────────┤
│ 📈 Prévision / alertes                                                │
├──────────────────────────────────┬────────────────────────────────────┤
│ 📊 Répartition des dépenses     │ 💸 Dépenses récentes               │
│                                  │                                    │
│          ◯                       │ Loyer             1 000 $         │
│                                  │ Courses             337 $         │
│                                  │ Garderie            301 $         │
├──────────────────────────────────┴────────────────────────────────────┤
│ 📅 À payer bientôt                 │ 💰 Entrées du mois               │
├───────────────────────────────────┴────────────────────────────────────┤
│ ⚡ Actions rapides                                                   │
│ Provisions | Budgets | Carte crédit | Récurrentes | Épargne | Analyse │
└───────────────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- sélection Moi / Madame / Global ;
- navigation mensuelle ;
- budget ;
- ajustement ;
- clôture du mois ;
- solde net ;
- taux d'utilisation ;
- prévision de fin de mois ;
- alertes intelligentes ;
- répartition par catégorie ;
- dépenses récentes ;
- dépenses attendues ;
- revenus du mois ;
- accès rapide aux autres fonctions.

### Décision UX

La page ne doit **pas** contenir toutes les listes détaillées. Elle montre les synthèses et renvoie vers les pages spécialisées.

---

# 4. 💰 Page Revenus

## Rôle

Gérer tous les revenus et versements.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Revenus — Août 2026                         [+ Ajouter]       │
├──────────────────────────────────────────────────────────────┤
│ Total du mois                              5 250,61 $         │
├──────────────────────────────────────────────────────────────┤
│ Recherche...   Type ▼   Profil ▼   Date ▼                    │
├──────────────────────────────────────────────────────────────┤
│ 💼 Salaire                         5 000,00 $     14 Août      │
│    Moi · salaire récurrent                           [⋯]     │
├──────────────────────────────────────────────────────────────┤
│ 👨‍👩‍👧 Allocation                       250,61 $      14 Août   │
│    Global                                                  [⋯]│
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- créer un revenu ;
- modifier ;
- supprimer ;
- type de revenu ;
- date ;
- note ;
- profil ;
- revenu récurrent ;
- liste mensuelle ;
- total ;
- filtres.

### Mobile

Le formulaire devient un écran/modal plein écran au lieu d'être toujours affiché sous la liste.

---

# 5. 💸 Page Dépenses

## Rôle

Vue complète de toutes les dépenses.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Dépenses — Août 2026                       [+ Ajouter]       │
├──────────────────────────────────────────────────────────────┤
│ 5 399,77 $ dépensés                         25 dépenses      │
├──────────────────────────────────────────────────────────────┤
│ 🔎 Rechercher    Catégorie ▼   Profil ▼   Date ▼             │
├──────────────────────────────────────────────────────────────┤
│ 🔴 Loyer                         1 000,00 $     23 Août        │
│ 🟡 Courses                         337,08 $     28 Août        │
│ 🟢 Garderie                        301,00 $     23 Août        │
│ 🟣 Assurance Prêt                   22,00 $     23 Août        │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- création ;
- modification ;
- suppression ;
- catégorie ;
- montant ;
- date ;
- profil ;
- note ;
- mode de paiement ;
- dépense récurrente ;
- recherche ;
- filtres ;
- total mensuel.

---

# 6. 🏦 Page Provisions

## Rôle

Gérer les dépenses irrégulières et leurs cagnottes.

### Aperçu desktop

```text
┌──────────────────────────────────────────────────────────────┐
│ Provisions                                  [+ Nouvelle]      │
├──────────────────────────────────────────────────────────────┤
│ À payer bientôt                                               │
├──────────────────────────────────────────────────────────────┤
│ 🟣 Électricité                                                │
│ 100 $ / 250 $                                                 │
│ ███████████░░░░░                                             │
│ Prochaine échéance : 11 sept.     Manque : 150 $             │
│ [💳] [+$] [Historique] [Modifier]                            │
├──────────────────────────────────────────────────────────────┤
│ 🟢 Taxe scolaire                                             │
│ 0 $ / 175,26 $                                               │
│ ██░░░░░░░░░░░                                                 │
│ Échéance : 06 nov.              Reste : 175,26 $              │
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- créer une provision ;
- aucune alimentation automatique à la création ;
- cagnotte ;
- ajout manuel au fonds ;
- versements liés ;
- historique des versements ;
- échéance ;
- fréquence ;
- catégorie ;
- prélèvement ;
- suivi de déficit ;
- répartition d'un versement ;
- suppression.

### Décision UX

Le détail de l'historique sera replié sur mobile pour éviter des cartes gigantesques.

---

# 7. 🎯 Page Budgets

## Rôle

Gérer les budgets par catégorie.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Budgets — Août 2026                         [+ Ajouter]       │
├──────────────────────────────────────────────────────────────┤
│ Budget global                                5 656,44 $       │
│ Utilisé                                       95 %             │
├──────────────────────────────────────────────────────────────┤
│ Loyer               2 000 / 2 000 $         ██████████ 100% │
│ Garderie              602 / 700 $           █████████░ 86%  │
│ Courses               337 / 500 $           ██████░░░░ 67%  │
│ Transport             146 / 400 $           ████░░░░░░ 37%  │
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- budget global ;
- budgets par catégorie ;
- modification ;
- limites ;
- progression ;
- dépassements ;
- période ;
- comparaison budget/réel.

---

# 8. 💳 Page Carte de crédit

## Rôle

Centraliser l'état de la carte et les remboursements.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Carte de crédit                              [+ Transaction] │
├──────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┐                                  │
│ │ VISA Desjardins         │                                  │
│ │ Solde : 1 234,56 $      │                                  │
│ │ Paiement min. : 50 $    │                                  │
│ └─────────────────────────┘                                  │
├──────────────────────────────────────────────────────────────┤
│ Dépenses carte                                                │
│ Courses                     337,08 $                          │
│ Essence                       82,00 $                          │
│ ...                                                          │
├──────────────────────────────────────────────────────────────┤
│ Remboursements                                                │
│ 402,97 $                                                       │
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- dépenses carte ;
- remboursement ;
- solde ;
- historique ;
- suivi du paiement.

---

# 9. 🔄 Page Dépenses récurrentes

## Rôle

Administrer les dépenses automatiques et leurs prochaines occurrences.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Dépenses récurrentes                       [+ Nouvelle]       │
├──────────────────────────────────────────────────────────────┤
│ Netflix                     22 $      Tous les mois           │
│ Internet                    85 $      Tous les mois           │
│ Assurance                  112 $      Tous les mois           │
│ Loyer                    1 000 $      Tous les mois           │
├──────────────────────────────────────────────────────────────┤
│ Prochaines dépenses                                            │
│ 23 Août · Garderie · 301 $                                    │
│ 28 Août · Courses · 337 $                                     │
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- création ;
- modification ;
- suppression ;
- fréquence ;
- intervalle ;
- date suivante ;
- génération attendue ;
- suivi des occurrences.

---

# 10. 🐷 Page Épargne

## Rôle

Gérer les objectifs d'épargne.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Épargne                                      [+ Objectif]     │
├──────────────────────────────────────────────────────────────┤
│ 🎯 Voyage                                                      │
│ 2 400 $ / 5 000 $                                           │
│ ████████████░░░░░░       48 %                               │
│ Objectif : Décembre 2026                                    │
├──────────────────────────────────────────────────────────────┤
│ 🏠 Fonds maison                                              │
│ 8 000 $ / 20 000 $                                          │
│ ███████░░░░░░░░░          40 %                               │
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- création d'objectif ;
- montant cible ;
- date cible ;
- progression ;
- ajout ;
- historique ;
- statut de l'objectif.

---

# 11. 📊 Page Analyses

## Rôle

Comprendre les tendances.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Analyses                              Août 2026 ▼             │
├──────────────────────────────────────────────────────────────┤
│ [Dépenses] [Revenus] [Solde] [Catégories]                   │
├──────────────────────────────────────────────────────────────┤
│ Évolution des dépenses                                      │
│                  ╭─╮                                        │
│             ╭────╯ ╰──╮                                     │
│        ╭────╯          ╰──                                   │
│     ───┴──────────────────────                               │
├──────────────────────────────┬───────────────────────────────┤
│ Répartition                  │ Évolution mensuelle            │
│              ◯              │       📈                       │
└──────────────────────────────┴───────────────────────────────┘
```

### Fonctionnalités

- dépenses ;
- revenus ;
- solde ;
- répartition ;
- tendances ;
- graphiques ;
- filtres par période.

---

# 12. 📈 Page Comparaisons

## Rôle

Comparer deux périodes.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Comparaison                                                   │
│ [Août 2026 ▼]  VS  [Juillet 2026 ▼]                         │
├──────────────────────────────────────────────────────────────┤
│ Dépenses             5 399 $  →  4 850 $     +11,3 %         │
│ Revenus              5 656 $  →  5 800 $      -2,5 %         │
│ Solde                  256 $  →    950 $     -73,0 %         │
├──────────────────────────────────────────────────────────────┤
│ Catégories ayant le plus changé                              │
│ Loyer                    +200 $                              │
│ Courses                   +82 $                              │
│ Garderie                 -40 $                               │
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- comparaison de mois ;
- variation absolue ;
- variation en % ;
- comparaison des catégories ;
- comparaison des revenus ;
- comparaison du solde.

---

# 13. 📅 Page Vue annuelle

## Rôle

Vue macro sur l'année.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Vue annuelle — 2026                      [2025] [2026] [2027]│
├──────────────────────────────────────────────────────────────┤
│         Jan   Fév   Mar   Avr   Mai   Juin   Juil   Août     │
│ Budget   ███   ███   ███   ███   ███   ███    ███    ███      │
│ Dépenses ███   ███   ███   ███   ███   ███    ███    ███      │
│ Solde    ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓   ▓▓▓    ▓▓▓    ▓▓▓      │
├──────────────────────────────────────────────────────────────┤
│ Total annuel                                                   │
│ Revenus      65 000 $                                         │
│ Dépenses     58 000 $                                         │
│ Solde         7 000 $                                         │
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- 12 mois ;
- budget ;
- dépenses ;
- revenus ;
- solde ;
- accès rapide à un mois ;
- synthèse annuelle.

---

# 14. ⚙️ Page Gestion des données

## Rôle

Tout ce qui concerne la conservation et la récupération des données.

### Aperçu

```text
┌──────────────────────────────────────────────────────────────┐
│ Gestion des données                                          │
├──────────────────────────────────────────────────────────────┤
│ 💾 Sauvegarde                                                │
│ Sauvegarder maintenant                                      │
│                                                              │
│ ↩ Restauration                                               │
│ Restaurer une sauvegarde                                    │
│                                                              │
│ 📤 Export                                                    │
│ Exporter mes données                                        │
│                                                              │
│ 🗑 Gestion                                                   │
│ Nettoyage / gestion des données                             │
└──────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

Conserver l'ensemble des fonctions actuelles de sauvegarde, restauration, import/export et gestion.

---

# 15. 🔐 Page Login

La page login reste volontairement simple.

```text
┌──────────────────────────────────┐
│       💰 Traqueur de Budget      │
│                                  │
│ Email                            │
│ [________________________]       │
│                                  │
│ Mot de passe                     │
│ [________________________]       │
│                                  │
│ [ Se connecter ]                 │
└──────────────────────────────────┘
```

---

# 16. Navigation mobile

La navigation basse donne accès aux fonctions les plus importantes.

```text
┌────────────────────────────────────────┐
│                                        │
│              contenu                   │
│                                        │
├────────────────────────────────────────┤
│  🏠       💰       💸       📊      ☰ │
│ Accueil  Budget  Dépenses  Analyse Plus│
└────────────────────────────────────────┘
```

`Plus` ouvre :

```text
Revenus
Provisions
Budgets
Carte de crédit
Dépenses récurrentes
Épargne
Comparaisons
Vue annuelle
Gestion des données
```

Aucune fonctionnalité n'est supprimée.

---

# 17. Inventaire des fonctionnalités à préserver

Le projet actuel contient notamment :

- authentification Supabase ;
- profils Moi / Madame / Global ;
- navigation mensuelle ;
- clôture de mois ;
- budget ;
- ajustement ;
- revenus ;
- revenus récurrents ;
- dépenses ;
- dépenses récurrentes ;
- catégories ;
- budgets par catégorie ;
- provisions ;
- cagnotte de provision ;
- ajout manuel au fonds ;
- versements liés aux provisions ;
- répartition de versements ;
- prévision mensuelle ;
- alertes intelligentes ;
- carte de crédit ;
- remboursements ;
- objectifs d'épargne ;
- comparaison mensuelle ;
- vue annuelle ;
- graphique de dépenses ;
- sauvegarde ;
- restauration ;
- gestion des données ;
- toast/feedback utilisateur ;
- persistance Supabase ;
- RLS Supabase.

**Aucune de ces fonctions ne doit disparaître pendant la refonte.**

---

# 18. Architecture Angular cible

Le projet actuel est une Angular 21 standalone app. Je conserverais cette base.

Structure cible :

```text
src/app/
├── core/
│   ├── models/
│   ├── services/
│   ├── utils/
│   └── ...
│
├── layout/
│   ├── app-shell/
│   ├── sidebar/
│   ├── mobile-nav/
│   └── header/
│
├── shared/
│   ├── ui/
│   │   ├── card/
│   │   ├── button/
│   │   ├── badge/
│   │   ├── progress/
│   │   ├── modal/
│   │   └── ...
│   └── ...
│
└── features/
    ├── dashboard/
    ├── incomes/
    ├── expenses/
    ├── provisions/
    ├── budgets/
    ├── credit-card/
    ├── recurring-expenses/
    ├── savings/
    ├── analytics/
    ├── comparisons/
    ├── yearly-view/
    ├── data-management/
    └── auth/
```

Le `BudgetStore` reste la source de vérité métier dans un premier temps.

---

# 19. Routes Angular cibles

Actuellement, l'application possède surtout `/login` et `/`.

Je recommande de passer à :

```text
/login
/app
/app/revenus
/app/depenses
/app/provisions
/app/budgets
/app/carte-credit
/app/depenses-recurrentes
/app/epargne
/app/analyses
/app/comparaisons
/app/vue-annuelle
/app/donnees
```

Toutes les routes métier doivent rester protégées par le garde d'authentification.

---

# 20. Plan concret de réalisation

## Phase 0 — Audit et sécurisation de la base

Objectif : ne rien casser.

### Actions

- créer une branche Git dédiée ;
- archiver le ZIP actuel comme baseline ;
- documenter les fonctionnalités existantes ;
- vérifier les routes ;
- vérifier les composants existants ;
- identifier les dépendances entre composants ;
- identifier les points où `BudgetStore` est utilisé ;
- ajouter ou renforcer les tests critiques.

### Livrable

Une baseline fonctionnelle avant refonte.

---

## Phase 1 — Design system

Créer les fondations visuelles :

```text
app-shell
ui-card
ui-button
ui-input
ui-select
ui-badge
ui-progress
ui-empty-state
ui-modal
ui-toolbar
ui-data-row
ui-stat-card
```

Définir :

- couleurs ;
- espacements ;
- typographie ;
- radius ;
- ombres ;
- états hover/focus/disabled ;
- responsive breakpoints.

### Livrable

Tous les écrans peuvent utiliser les mêmes briques UI.

---

## Phase 2 — Shell et navigation

Créer :

- `AppShell` ;
- sidebar desktop ;
- header ;
- navigation mobile ;
- sélecteur de profil ;
- sélecteur de mois ;
- zone principale ;
- `router-outlet`.

### Critère de validation

Naviguer entre toutes les pages sans perte de contexte :

- profil actif ;
- mois actif.

---

## Phase 3 — Dashboard

Transformer le dashboard actuel en cockpit :

1. KPI ;
2. budget ;
3. prévision ;
4. alertes ;
5. dépenses ;
6. répartition ;
7. provisions urgentes ;
8. revenus ;
9. actions rapides.

### Critère de validation

Le dashboard ne doit plus être une longue liste de tous les formulaires.

---

## Phase 4 — Transactions

Créer les deux vues :

- Revenus ;
- Dépenses.

Pour chaque vue :

```text
Liste
   +
filtres
   +
recherche
   +
formulaire
   +
édition
   +
suppression
```

Sur mobile : formulaire dans un modal/panneau plein écran.

---

## Phase 5 — Provisions

Conserver la logique métier actuelle.

Améliorer :

- carte ;
- progression ;
- échéance ;
- statut ;
- historique ;
- ajout manuel ;
- répartition de versement.

Mobile = détail repliable.

---

## Phase 6 — Budget

Construire :

- budget global ;
- budgets par catégorie ;
- progression ;
- dépassement ;
- ajustement ;
- synthèse.

---

## Phase 7 — Fonctions avancées

Migrer :

- carte de crédit ;
- dépenses récurrentes ;
- épargne.

---

## Phase 8 — Analytics

Migrer :

- graphiques ;
- comparaison mensuelle ;
- vue annuelle ;
- tendances.

---

## Phase 9 — Données

Refondre visuellement :

- sauvegarde ;
- restauration ;
- export ;
- gestion des données.

La logique de stockage reste inchangée sauf nécessité.

---

# 21. Responsive strategy

## Desktop

Largeur cible : environ 1280–1600 px.

- sidebar fixe ;
- contenu centré ;
- grilles 2 à 4 colonnes ;
- tableaux/listes riches.

## Tablet

- sidebar compacte ou collapsible ;
- grilles réduites ;
- cartes en 2 colonnes.

## Mobile

- bottom navigation ;
- une colonne ;
- formulaires en modal/panneau ;
- cartes compactes ;
- informations secondaires repliables ;
- zones tactiles confortables ;
- aucun composant horizontalement illisible.

---

# 22. Tests et validation

Avant chaque livraison :

```text
npm run build
npm test
```

Puis tests manuels :

- login ;
- changement Moi/Madame/Global ;
- changement de mois ;
- ajout revenu ;
- ajout dépense ;
- création provision ;
- ajout manuel au fonds ;
- versement ;
- budget ;
- carte crédit ;
- récurrent ;
- épargne ;
- comparaison ;
- vue annuelle ;
- sauvegarde/restauration.

### Responsive

Tester au minimum :

- desktop large ;
- tablette ;
- mobile portrait ;
- mobile paysage.

---

# 23. Ordre recommandé de développement

```text
1. Baseline + tests
        ↓
2. Design system
        ↓
3. App Shell / Navigation
        ↓
4. Dashboard
        ↓
5. Revenus
        ↓
6. Dépenses
        ↓
7. Provisions
        ↓
8. Budgets
        ↓
9. Carte de crédit
        ↓
10. Récurrentes
        ↓
11. Épargne
        ↓
12. Analyses
        ↓
13. Comparaisons
        ↓
14. Vue annuelle
        ↓
15. Données
        ↓
16. Responsive final
        ↓
17. Tests / build / nettoyage
```

---

# 24. Règle de qualité du projet

Chaque nouvelle page doit respecter :

- même design system ;
- même comportement responsive ;
- même navigation ;
- même gestion des erreurs ;
- même feedback utilisateur ;
- même gestion du profil ;
- même contexte mensuel ;
- aucune duplication inutile de logique métier.

Et surtout :

> **Avant de modifier le code, on valide le design de la page.**

Cela permettra d'éviter le cycle « modification → ZIP → test → retour arrière ».

---

# 25. Objectif final

L'application finale doit donner l'impression d'être un produit unique et cohérent, et non une collection de composants ajoutés progressivement.

```text
                TRAQUEUR DE BUDGET

        ┌─────────────────────────────┐
        │ Vue d'ensemble              │
        │                             │
        │ "Où en suis-je ?"           │
        └──────────────┬──────────────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
     Gestion        Prévision        Analyse
       │               │                │
  revenus          provisions       tendances
  dépenses         budget           comparaison
  carte            alertes           annuel
  épargne
```

Le résultat recherché est une application qui reste **complète**, mais dont la complexité est cachée derrière une navigation claire et une hiérarchie d'information maîtrisée.
