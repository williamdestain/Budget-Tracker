# Roadmap complète — Application de gestion financière

> **Version : 1.0 — Août 2026**
>
> Objectif : construire d'abord une application financière exceptionnelle pour un usage personnel, puis disposer d'une trajectoire claire pour la transformer, si la demande est confirmée, en produit utilisable par le grand public.

---

## 1. Vision du projet

L'objectif n'est pas de créer immédiatement « un autre YNAB/Monarch ».

Le positionnement potentiel est plutôt :

> **Une application qui explique clairement où l'utilisateur en est financièrement, ce qu'il lui reste réellement et ce qu'il peut raisonnablement faire ensuite.**

La progression produit recherchée :

```text
DONNÉES
   ↓
COMPRÉHENSION
   ↓
PRÉVISION
   ↓
DÉCISION
   ↓
ACTION
```

Le concept de **provisions** est un élément particulièrement important : il permet de réserver progressivement de l'argent pour des dépenses futures irrégulières ou annuelles.

---

# 2. Principe directeur

Le projet doit être développé en deux temps.

### Phase A — Produit personnel

Le produit doit devenir suffisamment bon pour que son propre créateur préfère l'utiliser à une feuille Excel, aux calculs manuels ou à plusieurs applications.

### Phase B — Produit commercial

Uniquement lorsque l'usage personnel et les retours externes montrent qu'il existe un problème suffisamment important pour d'autres utilisateurs.

> **Ne pas construire une startup avant d'avoir construit un excellent produit.**

---

# 3. Roadmap globale

```text
PHASE 0  — Vision & stratégie produit
PHASE 1  — Audit & fiabilisation
PHASE 2  — Moteur financier
PHASE 3  — UX & Dashboard
PHASE 4  — Usage personnel intensif
PHASE 5  — Étude concurrentielle & validation marché
PHASE 6  — Productisation multi-utilisateurs
PHASE 7  — Sécurité, confidentialité & conformité
PHASE 8  — Synchronisation bancaire
PHASE 9  — Beta privée / publique
PHASE 10 — Acquisition & commercialisation
PHASE 11 — Intelligence financière / IA
```

---

# 4. PHASE 0 — Vision et stratégie produit

## Objectif

Définir précisément le problème que l'application résout.

### Problème principal

Le solde bancaire ne représente pas nécessairement l'argent réellement disponible.

Une partie de l'argent peut déjà être destinée à :

- des dépenses récurrentes ;
- des taxes ;
- des assurances ;
- de l'entretien ;
- des vacances ;
- des dépenses annuelles ;
- des obligations futures.

### Questions auxquelles le produit doit répondre

#### Niveau 1 — Situation actuelle

> Combien ai-je ?

#### Niveau 2 — Mois actuel

> Combien ai-je déjà dépensé ?

#### Niveau 3 — Obligations

> Qu'est-ce qui doit encore être payé ?

#### Niveau 4 — Décision

> Combien puis-je réellement dépenser ?

#### Niveau 5 — Prévision

> Comment vais-je terminer le mois ?

#### Niveau 6 — Planification

> Est-ce que je peux atteindre mes objectifs ?

---

# 5. PHASE 1 — Audit complet de l'application

L'application existante doit être auditée fonctionnalité par fonctionnalité.

## Fonctionnalités à auditer

- [ ] Dashboard
- [ ] Budget
- [ ] Revenus
- [ ] Dépenses
- [ ] Provisions
- [ ] Dépenses récurrentes
- [ ] Épargne
- [ ] Forecast
- [ ] Smart Alerts
- [ ] Carte de crédit
- [ ] Import / export
- [ ] Comparaisons
- [ ] Graphiques
- [ ] Navigation
- [ ] Responsive
- [ ] Accessibilité

## Pour chaque fonctionnalité

Évaluer :

| Critère | Question |
|---|---|
| Fonctionnel | Est-ce que le comportement est correct ? |
| Métier | Les calculs sont-ils exacts ? |
| UX | L'utilisateur comprend-il immédiatement ? |
| UI | L'information est-elle correctement hiérarchisée ? |
| Tests | Les règles importantes sont-elles testées ? |
| Performance | Y a-t-il des recalculs inutiles ? |
| Maintenabilité | Le code est-il compréhensible ? |
| Sécurité | Y a-t-il des données ou permissions mal protégées ? |

---

# 6. PHASE 2 — Moteur financier

## Objectif

Faire du moteur financier la source de vérité de l'application.

> Une application financière doit privilégier la fiabilité des calculs avant les fonctionnalités avancées.

---

## 6.1 `remainingBudget`

Première brique à finaliser.

Formule V1 :

```text
remainingBudget =
    budget
  - spentSoFar
  - recurringRemaining
  - provisionsRemaining
```

Le résultat doit retourner un objet plutôt qu'un simple nombre :

```text
{
    amount,
    budget,
    spent,
    recurringRemaining,
    provisionsRemaining
}
```

Cela permet au Dashboard d'expliquer le chiffre au lieu de simplement l'afficher.

---

## 6.2 Décisions V1

Ne pas inclure automatiquement :

- [ ] épargne planifiée ;
- [ ] marge de sécurité ;
- [ ] investissements ;
- [ ] patrimoine ;
- [ ] solde bancaire ;
- [ ] IA.

Ces éléments nécessitent des décisions produit explicites.

---

## 6.3 Collision provision / récurrent

Il existe un cas potentiel où une catégorie est utilisée simultanément par :

- une provision ;
- une dépense récurrente.

Il ne faut **pas** supposer automatiquement qu'elles représentent la même obligation.

Une catégorie commune ne constitue pas une relation métier.

### Décision V1

Les deux obligations sont comptées.

Une éventuelle alerte informative pourra signaler :

> « Cette catégorie est couverte par une provision et une dépense récurrente. Vérifiez qu'il ne s'agit pas de la même obligation. »

Cette alerte ne modifie pas le calcul.

---

# 7. Tests métier `remainingBudget`

Tests minimums :

1. Aucun récurrent / provision → `budget - spent`.
2. Récurrent actif non confirmé → déduit.
3. Récurrent confirmé → déjà inclus dans `spent`.
4. Provision partiellement financée → seul le `missing` est déduit.
5. Provision entièrement financée → 0 déduit.
6. Contribution à une provision → aucune double déduction.
7. Rollover → inclus dans le budget.
8. Résultat négatif → valeur négative conservée.
9. Récurrent prévu après la fin du mois → non déduit.
10. Provision + récurrent sur même catégorie → les deux comptés.

---

# 8. Stratégie de tests générale

Chaque bug important doit suivre :

```text
BUG
 ↓
Test reproduisant le bug
 ↓
Correction
 ↓
Test permanent
```

Catégories de tests :

- [ ] Unit tests
- [ ] Tests des computed signals
- [ ] Tests de règles métier
- [ ] Tests de dates
- [ ] Tests de changement de mois
- [ ] Tests de non-régression
- [ ] Tests des cas limites
- [ ] Tests d'intégration lorsque nécessaire
- [ ] Tests E2E des parcours critiques

---

# 9. PHASE 3 — Refonte UX / Dashboard

## Objectif

Répondre à :

> **« Que dois-je savoir maintenant ? »**

et non afficher simplement toutes les fonctionnalités.

---

# 10. MoneyPulse

Ajouter un composant de synthèse en haut du Dashboard.

Exemple :

```text
┌──────────────────────────────────────────────┐
│ 💰 Disponible ce mois-ci                    │
│                                              │
│                 1 150 $                     │
│                                              │
│ Budget              4 000 $                  │
│ Déjà dépensé        2 100 $                  │
│ Dépenses à venir      450 $                  │
│ Provisions            300 $                  │
│                                              │
│ Prévision fin mois : +450 $                  │
└──────────────────────────────────────────────┘
```

Le chiffre doit être explicable.

---

# 11. Architecture UX du Dashboard

Ordre recommandé :

```text
MoneyPulse
    ↓
Budget
    ↓
Alertes importantes
    ↓
Prévision du mois
    ↓
Revenus / dépenses
    ↓
Provisions
    ↓
Épargne
    ↓
Analyses
    ↓
Fonctionnalités secondaires
```

Les détails peuvent rester disponibles sans polluer la première lecture.

---

# 12. PHASE 4 — Utilisation personnelle intensive

Cette phase est essentielle.

Utiliser l'application quotidiennement pendant plusieurs semaines / mois.

Créer un **Product Pain Log**.

Format recommandé :

```text
Date
Problème
Contexte
Fréquence
Impact
Solution envisagée
```

Exemple :

```text
Problème :
Je ne sais pas combien je peux dépenser avant mon prochain salaire.

Fréquence :
Tous les mois.

Impact :
Élevé.

Solution :
Améliorer le cash-flow / MoneyPulse.
```

---

# 13. Règle de décision pour les nouvelles fonctionnalités

Ne pas ajouter automatiquement une fonctionnalité parce qu'elle semble intéressante.

Passer par :

```text
Problème réel ?
    ↓
Fréquent ?
    ↓
Impact important ?
    ↓
Solution existante ?
    ↓
Notre solution peut-elle être meilleure ?
    ↓
Implémentation
```

---

# 14. PHASE 5 — Étude concurrentielle

Comparer l'application à plusieurs catégories.

## Concurrents directs

- YNAB
- Monarch
- Neontra
- autres applications de budgeting

## Concurrents indirects

- applications bancaires ;
- feuilles Excel / Google Sheets ;
- applications de suivi de patrimoine ;
- applications de planification financière.

---

# 15. Matrice concurrentielle

Construire et maintenir une matrice :

| Fonctionnalité | Notre app | YNAB | Monarch | Neontra |
|---|---:|---:|---:|---:|
| Budget | | | | |
| Synchronisation bancaire | | | | |
| Provisions | | | | |
| Forecast | | | | |
| Épargne | | | | |
| Investissements | | | | |
| IA | | | | |
| UX | | | | |
| Canada | | | | |
| Prix | | | | |
| Mobile | | | | |
| Confidentialité | | | | |

Mais ne pas se limiter aux fonctionnalités.

La question principale est :

> **Quel problème chaque produit résout-il et pour quel utilisateur ?**

---

# 16. Positionnement potentiel

Le produit ne devrait pas essayer de battre les concurrents sur :

> « Nous avons plus de fonctionnalités. »

Positionnement plus intéressant :

> **Nous expliquons mieux l'argent réellement disponible après les dépenses et obligations futures.**

Le concept de provision est une piste de différenciation importante.

---

# 17. PHASE 5B — Validation utilisateur

Avant une commercialisation massive :

## Étape 1 — 5 utilisateurs

Objectif :

> vérifier que le problème existe.

## Étape 2 — 10 utilisateurs

Objectif :

> vérifier que l'application est compréhensible.

## Étape 3 — 25 utilisateurs

Objectif :

> vérifier l'utilisation répétée.

## Étape 4 — 50 utilisateurs

Objectif :

> commencer à mesurer la rétention.

---

# 18. Interviews utilisateurs

Ne pas demander :

> « Est-ce que tu aimerais une application comme ça ? »

Demander :

- Comment gères-tu actuellement ton budget ?
- Comment prépares-tu tes dépenses annuelles ?
- Comment sais-tu combien tu peux dépenser ?
- Quel problème as-tu rencontré récemment ?
- Qu'est-ce qui t'énerve dans ton outil actuel ?
- Qu'est-ce que tu fais manuellement ?
- Qu'est-ce qui te fait perdre du temps ?

Le comportement passé est plus fiable que les intentions déclarées.

---

# 19. PHASE 6 — Productisation

Uniquement lorsque la validation montre une demande.

## Authentification

Ajouter :

```text
User
 ↓
Authentication
 ↓
User-specific data
```

## Multi-utilisateur

Les données doivent être isolées :

```text
User
 ├── budgets
 ├── expenses
 ├── incomes
 ├── provisions
 ├── recurring expenses
 ├── savings goals
 └── preferences
```

Avec Supabase :

- [ ] Row Level Security
- [ ] policies
- [ ] vérification systématique de l'utilisateur
- [ ] tests d'isolation des données

---

# 20. Environnements

Passer à :

```text
Development
      ↓
Staging
      ↓
Production
```

Ne plus utiliser les données personnelles de production pour développer.

Prévoir :

- [ ] migrations ;
- [ ] rollback ;
- [ ] backups ;
- [ ] restauration ;
- [ ] seed de données de test.

---

# 21. Observabilité

Ajouter progressivement :

- [ ] logs structurés ;
- [ ] monitoring ;
- [ ] error tracking ;
- [ ] métriques ;
- [ ] alertes ;
- [ ] health checks ;
- [ ] suivi des erreurs frontend ;
- [ ] suivi des erreurs backend si applicable.

---

# 22. PHASE 7 — Sécurité / confidentialité / conformité

Cette phase devient obligatoire dès qu'il y a des utilisateurs externes.

## Données

Documenter :

- quelles données sont stockées ;
- pourquoi elles sont nécessaires ;
- combien de temps elles sont conservées ;
- où elles sont stockées ;
- qui peut y accéder.

## Fonctionnalités utilisateur

Prévoir :

- [ ] consulter ses données ;
- [ ] modifier ses données ;
- [ ] exporter ses données ;
- [ ] supprimer son compte ;
- [ ] supprimer ses données.

## Sécurité

- [ ] HTTPS
- [ ] secrets management
- [ ] RLS
- [ ] protection XSS
- [ ] protection CSRF selon architecture
- [ ] rate limiting
- [ ] gestion sécurisée des sessions
- [ ] MFA éventuellement
- [ ] audits de permissions
- [ ] threat modeling
- [ ] dépendances à jour

---

# 23. Québec / Canada

Avant commercialisation, faire valider les obligations applicables avec un professionnel compétent.

À examiner notamment :

- protection des renseignements personnels ;
- politique de confidentialité ;
- consentement ;
- conservation des données ;
- suppression ;
- incidents de confidentialité ;
- hébergement et transferts de données ;
- conditions d'utilisation.

Ne pas considérer cette section comme un avis juridique.

---

# 24. PHASE 8 — Synchronisation bancaire

La synchronisation bancaire est importante pour un produit grand public, mais elle n'est pas nécessaire pour rendre l'application personnelle excellente.

## Avant l'intégration bancaire

Préparer une abstraction :

```text
TransactionSource
       ↓
NormalizedTransaction
       ↓
Financial Engine
```

Les transactions peuvent venir de :

```text
Saisie manuelle
CSV
Import
Banque
```

Le moteur financier ne doit pas dépendre directement du fournisseur bancaire.

---

# 25. Pipeline bancaire cible

```text
Institution financière
        ↓
Provider / API bancaire
        ↓
Import
        ↓
Normalisation
        ↓
Déduplication
        ↓
Catégorisation
        ↓
Rapprochement
        ↓
Transaction interne
        ↓
Financial Engine
```

Prévoir :

- [ ] reconnexion ;
- [ ] token expiré ;
- [ ] compte supprimé ;
- [ ] banque indisponible ;
- [ ] transaction dupliquée ;
- [ ] transaction modifiée ;
- [ ] transaction en attente ;
- [ ] catégorisation ;
- [ ] rapprochement manuel.

Ne jamais demander directement les identifiants bancaires d'un utilisateur pour faire du screen scraping.

---

# 26. PHASE 9 — Beta

## Beta privée

Commencer avec :

```text
5 → 10 → 25 → 50 utilisateurs
```

Pour chaque groupe :

- [ ] onboarding ;
- [ ] observation ;
- [ ] feedback ;
- [ ] corrections ;
- [ ] mesure de rétention.

---

# 27. Parcours utilisateur critique

Mesurer :

```text
Inscription
   ↓
Onboarding
   ↓
Premier budget
   ↓
Premier revenu
   ↓
Première dépense
   ↓
Première provision
   ↓
Première consultation du Dashboard
   ↓
Premier mois complet
   ↓
Retour le mois suivant
```

Le produit doit rendre ce parcours extrêmement simple.

---

# 28. PHASE 10 — Acquisition

Ne pas commencer directement par la publicité payante.

Tester :

- [ ] bouche-à-oreille ;
- [ ] communautés ;
- [ ] Reddit ;
- [ ] groupes pertinents ;
- [ ] LinkedIn ;
- [ ] contenu ;
- [ ] SEO ;
- [ ] Product Hunt ;
- [ ] programme de referral.

Toujours privilégier la participation utile plutôt que le spam.

---

# 29. Contenu marketing potentiel

Le problème financier se prête bien à des sujets pédagogiques :

- Pourquoi votre solde bancaire ne représente pas votre argent réellement disponible.
- Comment préparer les dépenses annuelles.
- Pourquoi mensualiser les dépenses irrégulières.
- Comment préparer les taxes municipales.
- Budget mensuel vs cash-flow.
- Comment savoir combien dépenser avant le prochain salaire.
- Comment éviter les mauvaises surprises financières.

Le contenu doit d'abord résoudre un problème, puis présenter l'application comme solution.

---

# 30. Landing page

Elle doit répondre rapidement à quatre questions.

## 1. Quel problème ?

> « Je gagne correctement ma vie, mais je ne sais jamais combien je peux réellement dépenser. »

## 2. Quelle solution ?

> « Voyez immédiatement ce qu'il vous reste après vos dépenses et obligations futures. »

## 3. Pourquoi cette application ?

Mettre en avant :

- provisions ;
- prévisions ;
- clarté ;
- décision ;
- simplicité.

## 4. Quelle action ?

> Essayer gratuitement.

---

# 31. Modèle économique

Ne pas décider trop tôt.

Tester plusieurs modèles :

## Freemium

```text
Gratuit
- budget
- dépenses
- provisions

Premium
- forecast avancé
- bank sync
- analytics avancées
- fonctionnalités avancées
```

## Abonnement

Prix à déterminer par validation du marché.

## Lifetime

Potentiellement intéressant pour une première communauté, mais attention aux coûts récurrents des services externes.

---

# 32. Métriques produit

Ne pas se limiter au nombre d'inscrits.

## Activation

Pourcentage d'utilisateurs qui configurent réellement leur budget.

## Engagement

Fréquence d'utilisation.

## Retention

Utilisateurs encore actifs après :

- 7 jours ;
- 30 jours ;
- 90 jours.

## Conversion

Pourcentage passant au payant.

## Churn

Utilisateurs qui arrêtent.

## Referral

Utilisateurs acquis par recommandation.

---

# 33. PHASE 11 — IA

L'IA doit venir **après** le moteur financier.

Architecture cible :

```text
            Financial Engine
                  │
          ┌───────┴───────┐
          │               │
      Dashboard          API
          │               │
          └───────┬───────┘
                  │
            AI Assistant
```

L'IA ne doit pas être la source de vérité financière.

Le moteur calcule.

L'IA explique.

---

# 34. Exemple d'IA future

Utilisateur :

> « Est-ce que je peux acheter cette TV à 900 $ ? »

Le moteur calcule :

```text
remainingBudget
+
future obligations
+
cash flow
+
savings commitments
```

L'IA peut ensuite produire une explication :

> « Oui, mais cette dépense réduirait ta marge de fin de mois d'environ 900 $. Tu conserverais environ 250 $ de marge. »

L'IA devient alors une interface décisionnelle.

---

# 35. Architecture produit cible

À terme :

```text
                 ┌──────────────────────┐
                 │       Angular        │
                 │       Frontend       │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │      Application     │
                 │       Services       │
                 └──────────┬───────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
       ┌─────────────────┐    ┌─────────────────┐
       │ Financial       │    │ User /          │
       │ Engine          │    │ Preferences     │
       └────────┬────────┘    └─────────────────┘
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
   Expenses  Provisions Forecast
        │       │        │
        └───────┼────────┘
                ▼
          MoneyPulse
                │
                ▼
          AI Assistant
```

L'architecture réelle doit rester proportionnée au produit. Ne pas créer prématurément une architecture microservices si un monolithe modulaire suffit.

---

# 36. Ce qu'il ne faut PAS faire maintenant

Éviter de partir immédiatement sur :

```text
Auth
+
Stripe
+
Bank Sync
+
IA
+
Mobile
+
Landing Page
+
Marketing
+
Abonnement
```

avant d'avoir validé le produit.

Le risque est de passer plusieurs mois à construire une startup sans savoir si le problème est suffisamment important pour les utilisateurs.

---

# 37. Roadmap opérationnelle priorisée

| # | Étape | Priorité |
|---:|---|:---:|
| 1 | Audit complet du code | 🔴 |
| 2 | Fiabiliser les règles métier | 🔴 |
| 3 | `remainingBudget` | 🔴 |
| 4 | Tests `remainingBudget` | 🔴 |
| 5 | MoneyPulse | 🔴 |
| 6 | Refonte Dashboard | 🔴 |
| 7 | Audit UX global | 🔴 |
| 8 | Forecast / cash-flow | 🔴 |
| 9 | Utilisation personnelle intensive | 🔴 |
| 10 | Étude concurrentielle approfondie | 🟠 |
| 11 | Interviews utilisateurs | 🟠 |
| 12 | Prototype beta | 🟠 |
| 13 | Auth / multi-user | 🟡 |
| 14 | RLS / sécurité | 🟡 |
| 15 | Backup / monitoring | 🟡 |
| 16 | Privacy / conformité | 🟡 |
| 17 | Analytics produit | 🟡 |
| 18 | Architecture bancaire | 🟡 |
| 19 | Synchronisation bancaire | 🟠 |
| 20 | Beta privée | 🟠 |
| 21 | Pricing | 🟠 |
| 22 | Landing page | 🟠 |
| 23 | Acquisition | 🟠 |
| 24 | Beta publique | 🔴 |
| 25 | Commercialisation | 🔴 |
| 26 | IA financière | 🟢 |

---

# 38. Critères de passage entre les phases

## Produit personnel → validation marché

Passer à la validation lorsque :

- [ ] les calculs critiques sont testés ;
- [ ] le Dashboard est clair ;
- [ ] l'application est utilisée régulièrement ;
- [ ] les principales frustrations personnelles ont été traitées ;
- [ ] la valeur des provisions est claire ;
- [ ] l'utilisateur peut comprendre sa situation financière rapidement.

## Validation → produit commercial

Passer à la productisation lorsque :

- [ ] plusieurs personnes expriment le même problème ;
- [ ] les utilisateurs comprennent le produit sans accompagnement permanent ;
- [ ] certains reviennent spontanément ;
- [ ] le produit résout réellement un problème ;
- [ ] les retours sont suffisamment positifs ;
- [ ] une volonté de payer commence à apparaître.

---

# 39. Vision finale

Le produit peut progressivement évoluer :

```text
              DONNÉES
                 ↓
        ┌─────────────────┐
        │ Situation       │
        │ actuelle        │
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │ Obligations     │
        │ futures         │
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │ Prévision       │
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │ Argent          │
        │ disponible      │
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │ Décision        │
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │ Action          │
        └─────────────────┘
```

L'ambition n'est donc pas uniquement de suivre les dépenses.

L'ambition est de transformer des données financières en **compréhension puis en décisions**.

---

# 40. Prochaine étape recommandée

Le travail immédiat doit rester très concret :

1. Finaliser `remainingBudget`.
2. Ajouter les tests métier.
3. Ajouter le garde-fou / l'alerte informative provision-récurrent si retenu.
4. Construire `MoneyPulse`.
5. Refaire le Dashboard autour des informations importantes.
6. Auditer chaque fonctionnalité existante.
7. Corriger les incohérences métier.
8. Utiliser personnellement l'application.
9. Documenter les frustrations et besoins.
10. Une fois le produit personnel solide, commencer l'étude de marché et les premiers tests utilisateurs.

> **Le meilleur prochain objectif n'est pas de trouver des clients.**
>
> **Le meilleur prochain objectif est de construire une application que toi-même tu ne voudrais plus abandonner.**
>
> Si tu arrives à ce stade, tu auras une base beaucoup plus solide pour déterminer si elle mérite de devenir un produit commercial.

---

## Principes permanents

- Fiabilité avant sophistication.
- Métier avant IA.
- UX avant fonctionnalités supplémentaires.
- Tests avant refactoring risqué.
- Validation avant commercialisation.
- Sécurité et confidentialité avant données utilisateur.
- Architecture proportionnée au besoin.
- Mesurer l'utilisation réelle plutôt que les intentions.
- Ne pas copier les concurrents : résoudre un problème plus clairement.
- Construire progressivement.
