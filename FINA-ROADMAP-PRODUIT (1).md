# FINA — Feuille de route pour passer du prototype au vrai produit

**Version : 1.0 — septembre 2026**

## 1. Objectif

Transformer le prototype UX/UI de FINA en un produit de gestion financière personnelle robuste, sécurisé, maintenable et progressivement commercialisable.

Le principe directeur est de **ne pas transformer trop tôt l'application personnelle en SaaS complexe**. La progression recommandée est :

```text
Prototype UX
    ↓
Produit personnel stable
    ↓
MVP multi-utilisateur
    ↓
Bêta fermée
    ↓
Produit public
    ↓
SaaS financier mature
```

La roadmap distingue volontairement :

- le produit et la proposition de valeur ;
- le domaine financier et la qualité des calculs ;
- le frontend / backend ;
- la sécurité et la confidentialité ;
- la synchronisation bancaire ;
- l'exploitation ;
- l'acquisition et le modèle commercial.

---

# 2. Vision produit

## 2.1 Positionnement proposé

FINA ne doit pas essayer de devenir uniquement un clone de YNAB ou une application de consultation de comptes.

La proposition de valeur à construire est plutôt :

> **Aider un foyer à comprendre son argent aujourd'hui, prévoir les dépenses importantes et savoir ce qu'il peut réellement dépenser sans compromettre ses projets.**

Les concepts différenciants à conserver :

1. Budget mensuel.
2. Provisions / enveloppes pour les dépenses futures.
3. Prévision de fin de mois.
4. Gestion du foyer et des membres.
5. Objectifs d'épargne.
6. Analyse des habitudes.
7. À terme : synchronisation bancaire.

---

# 3. Phase 0 — Valider l'expérience produit

**Objectif : verrouiller l'UX avant de refactorer Angular.**

### À faire

- Finaliser la navigation principale.
- Finaliser desktop + mobile.
- Valider les écrans :
  - Accueil ;
  - Transactions ;
  - Budget ;
  - Provisions ;
  - Épargne ;
  - Comptes ;
  - Investissements ;
  - Analyses ;
  - Paramètres.
- Définir tous les états :
  - loading ;
  - empty ;
  - error ;
  - success ;
  - offline ;
  - synchronisation en cours.
- Définir les parcours critiques :
  - première utilisation ;
  - ajout d'un compte ;
  - ajout d'une transaction ;
  - création d'un budget ;
  - création d'une provision ;
  - création d'un objectif ;
  - clôture d'un mois ;
  - import de données.

### Livrables

- Prototype HTML validé.
- Arborescence fonctionnelle.
- Design system initial.
- User flows.
- Glossaire métier.

### Critère de sortie

Aucune ambiguïté sur la fonction de chaque écran et sur le sens de chaque montant affiché.

---

# 4. Phase 1 — Stabiliser le moteur financier

**Priorité maximale avant ouverture à d'autres utilisateurs.**

L'interface peut être excellente : si les calculs sont faux, le produit perd immédiatement la confiance de l'utilisateur.

## 4.1 Définir un modèle financier canonique

Documenter précisément :

```text
Account
Transaction
Category
Budget
Provision
RecurringIncome
RecurringExpense
SavingsGoal
InvestmentAccount
Household
Member
MonthClosure
Forecast
Alert
```

Pour chaque entité, documenter :

- source de vérité ;
- propriétaire ;
- cycle de vie ;
- relations ;
- règles de calcul ;
- timezone ;
- devise ;
- arrondis ;
- dates ;
- comportement lors d'une modification rétroactive.

## 4.2 Formaliser les métriques

Chaque métrique doit avoir une définition unique.

Exemples :

```text
Solde bancaire
Solde disponible
Revenus du mois
Dépenses du mois
Montant provisionné
Épargne du mois
Budget restant
Disponible par jour
Solde net projeté
Patrimoine net
```

### Point critique

Il faut notamment séparer explicitement :

```text
Solde bancaire
≠
Disponible à dépenser
≠
Solde net du mois
≠
Patrimoine net
```

## 4.3 Tests métier

Créer des jeux de données couvrant :

- mois sans dépense ;
- mois déficitaire ;
- report du mois précédent ;
- provision partiellement alimentée ;
- provision entièrement alimentée ;
- provision en retard ;
- dépense récurrente ;
- revenu récurrent ;
- remboursement ;
- transfert entre comptes ;
- carte de crédit ;
- transaction supprimée ;
- transaction corrigée ;
- changement de catégorie ;
- changement de mois ;
- clôture puis modification rétroactive.

### Critère de sortie

Les calculs métier sont déterministes et couverts par des tests automatisés.

---

# 5. Phase 2 — Refactoriser l'architecture Angular

**Objectif : transformer le prototype en véritable application maintenable.**

## Structure cible

```text
src/app/
│
├── core/
│   ├── auth/
│   ├── http/
│   ├── config/
│   ├── guards/
│   ├── interceptors/
│   └── telemetry/
│
├── shared/
│   ├── ui/
│   ├── forms/
│   ├── charts/
│   ├── pipes/
│   └── utils/
│
├── layout/
│   ├── desktop-shell/
│   ├── mobile-shell/
│   └── navigation/
│
└── features/
    ├── dashboard/
    ├── transactions/
    ├── budget/
    ├── provisions/
    ├── savings/
    ├── accounts/
    ├── investments/
    ├── analytics/
    └── settings/
```

## Principes

- composants métier isolés ;
- design system réutilisable ;
- logique de calcul hors composants ;
- état local là où possible ;
- état global uniquement lorsque nécessaire ;
- API typées ;
- gestion explicite des erreurs ;
- tests sur les composants critiques.

### Design System

Industrialiser :

```text
Button
Input
Select
DatePicker
MoneyInput
Card
Badge
Alert
Progress
Chart
TransactionRow
BudgetRow
ProvisionCard
GoalCard
AccountCard
PageHeader
EmptyState
LoadingState
ErrorState
Modal
Drawer
BottomSheet
Toast
```

---

# 6. Phase 3 — Transformer FINA en application multi-utilisateur

Avant le mode public, il faut passer d'un modèle « moi » à un modèle de compte utilisateur.

## Identité

Mettre en place :

- inscription ;
- connexion ;
- déconnexion ;
- récupération du compte ;
- changement de mot de passe ;
- sessions ;
- vérification email ;
- suppression du compte.

## Foyer

Créer :

```text
User
Household
HouseholdMember
Role
Invitation
```

Exemple :

```text
Foyer Destain
│
├── Williams — Owner
└── Partenaire — Member
```

Les droits doivent être conçus dès cette phase, même si le produit reste simple.

## Multi-tenant

Chaque donnée financière doit être reliée sans ambiguïté à son périmètre :

```text
User / Household
        ↓
Account
        ↓
Transaction
```

Aucune requête API ne doit pouvoir accéder à la donnée financière d'un autre utilisateur/foyer.

---

# 7. Phase 4 — Backend de production

## Architecture minimale recommandée

Pour le MVP, éviter de partir immédiatement sur des microservices.

```text
Angular
   ↓
API Backend
   ↓
PostgreSQL
   ↓
Redis / Cache (si besoin)
```

Puis ajouter progressivement :

```text
Queue / Jobs
Monitoring
Object Storage
Bank Sync Service
Notification Service
```

## API

Définir une API versionnée :

```text
/api/v1/auth
/api/v1/users
/api/v1/households
/api/v1/accounts
/api/v1/transactions
/api/v1/budgets
/api/v1/provisions
/api/v1/goals
/api/v1/investments
/api/v1/reports
/api/v1/sync
```

## Principes API

- idempotence pour les opérations sensibles ;
- pagination ;
- filtres ;
- tri ;
- validation serveur ;
- erreurs structurées ;
- correlation ID ;
- audit des opérations importantes.

---

# 8. Phase 5 — Sécurité et confidentialité

**Cette phase commence avant la bêta, pas après le lancement.**

L'application traite potentiellement des informations très sensibles : revenus, habitudes de dépenses, comptes bancaires et patrimoine. Au Canada, les données financières et habitudes de dépense sont considérées comme des renseignements personnels et les obligations de protection varient selon le cadre juridique applicable. citeturn556844search3turn556844search6

Au Québec, le développement commercial doit intégrer les exigences de la Loi 25, notamment la gouvernance des renseignements personnels et certaines évaluations des facteurs relatifs à la vie privée. citeturn556844search12

### À mettre en place

- Threat model.
- Privacy impact assessment lorsque requis.
- Politique de confidentialité.
- Registre des données personnelles.
- Politique de rétention/suppression.
- Gestion des consentements.
- Chiffrement en transit.
- Chiffrement au repos lorsque pertinent.
- Gestion sécurisée des secrets.
- MFA à terme.
- Rate limiting.
- Protection contre les attaques courantes.
- Audit logs sans données sensibles inutiles.
- Sauvegardes chiffrées.
- Plan de restauration.
- Procédure de gestion de violation de données.

Le Commissariat à la protection de la vie privée recommande notamment une approche de gestion de la vie privée couvrant les finalités, le consentement, la minimisation, les mesures de protection, la rétention et la gestion des incidents. citeturn556844search7turn556844search4

### Règle fondamentale

Ne jamais stocker les identifiants bancaires de l'utilisateur dans FINA si le fournisseur de synchronisation permet une délégation sécurisée.

---

# 9. Phase 6 — Synchronisation bancaire

Ne pas commencer par développer les intégrations bancaires une par une.

Créer une abstraction :

```text
FINA
 ↓
Bank Aggregation Adapter
 ↓
Provider
 ↓
Financial Institution
```

## Domaine

```text
Connection
Institution
ExternalAccount
ExternalTransaction
SyncJob
SyncCursor
SyncError
```

## Pipeline

```text
Connexion banque
      ↓
Découverte comptes
      ↓
Association compte FINA
      ↓
Première synchronisation
      ↓
Normalisation
      ↓
Déduplication
      ↓
Catégorisation
      ↓
Règles utilisateur
      ↓
Calculs FINA
```

## Problèmes à traiter

- doublons ;
- transaction pending → posted ;
- remboursement ;
- transfert ;
- montant modifié ;
- transaction disparue ;
- compte déconnecté ;
- institution temporairement indisponible ;
- consentement expiré ;
- resynchronisation historique.

### Critère de sortie

Un utilisateur peut connecter un compte, recevoir les transactions, les catégoriser et retrouver des chiffres cohérents avec les données sources.

---

# 10. Phase 7 — Préparer la bêta fermée

Ne pas ouvrir à 10 000 utilisateurs.

Commencer par environ :

```text
5 familles
↓
10 familles
↓
25 familles
↓
50 familles
```

Le principe est d'observer les comportements réels avant d'accélérer.

## Mesures à suivre

### Activation

```text
Inscription
 ↓
Premier compte
 ↓
Première transaction
 ↓
Premier budget
 ↓
Première utilisation récurrente
```

### Engagement

- utilisateurs actifs hebdomadaires ;
- utilisateurs actifs mensuels ;
- fréquence d'utilisation ;
- budgets créés ;
- transactions catégorisées ;
- objectifs créés ;
- provisions utilisées.

### Fiabilité

- erreurs API ;
- erreurs de synchronisation ;
- transactions en doublon ;
- temps de réponse ;
- incidents ;
- erreurs de calcul.

### Produit

Demander régulièrement :

> « Quelle fonctionnalité vous ferait gagner le plus de temps chaque semaine ? »

et :

> « Qu'est-ce qui vous empêche de faire confiance aux chiffres affichés ? »

---

# 11. Phase 8 — Observabilité et exploitation

Avant le lancement public :

```text
Application
 ↓
Logs structurés
 ↓
Metrics
 ↓
Tracing
 ↓
Alerting
 ↓
Dashboard opérationnel
```

## À surveiller

- disponibilité API ;
- erreurs HTTP ;
- latence P50 / P95 / P99 ;
- jobs de synchronisation ;
- erreurs DB ;
- consommation CPU/RAM ;
- files d'attente ;
- erreurs frontend ;
- taux de crash ;
- synchronisations échouées.

Mettre en place des SLO simples avant de parler de haute disponibilité complexe.

---

# 12. Phase 9 — CI/CD et qualité industrielle

Pipeline cible :

```text
Pull Request
    ↓
Lint
    ↓
Unit Tests
    ↓
Integration Tests
    ↓
Build
    ↓
Security Scan
    ↓
Sonar / Quality Gate
    ↓
E2E
    ↓
Deploy Staging
    ↓
Smoke Tests
    ↓
Production
```

## Environnements

```text
local
 ↓
dev
 ↓
staging
 ↓
production
```

Avec données de test totalement séparées de la production.

---

# 13. Phase 10 — Préparation commerciale

Ne pas chercher à vendre avant de savoir **pourquoi quelqu'un choisirait FINA plutôt que YNAB, Monarch, Copilot Money, Neontra ou une feuille Excel**.

## Étape 1 — Positionnement

Construire une matrice concurrentielle :

| Produit | Budget | Banque | Provisions | Foyer | Prévisions | Analyse | Cible |
|---|---|---|---|---|---|---|---|
| FINA | ✓ | À venir | ✓ | ✓ | ✓ | ✓ | À définir |
| YNAB | ✓ | ✓/selon pays | Enveloppes | ✓ | Partiel | ✓ | Budget |
| Monarch | ✓ | ✓ | Partiel | ✓ | ✓ | ✓ | Finance personnelle |
| Copilot | ✓ | ✓ | Partiel | ✓ | ✓ | ✓ | Finance personnelle |

Cette matrice devra être actualisée avant chaque décision commerciale importante.

## Étape 2 — Cible initiale

Ne pas viser « tout le monde ».

Tester une niche :

> foyers canadiens qui veulent piloter leur budget mensuel et leurs dépenses futures, particulièrement les familles qui jonglent avec plusieurs dépenses récurrentes.

## Étape 3 — Landing page

Construire :

```text
Problème
↓
Promesse
↓
Screenshots
↓
Différenciateurs
↓
Comment ça marche
↓
Sécurité
↓
FAQ
↓
Inscription bêta
```

## Étape 4 — Acquisition

Commencer par :

- réseau personnel ;
- groupes spécialisés ;
- communautés finances personnelles ;
- contenu éducatif ;
- démonstrations ;
- referral.

Éviter les dépenses publicitaires significatives avant d'avoir validé activation et rétention.

---

# 14. Phase 11 — Business model

Tester plusieurs hypothèses plutôt que décider immédiatement.

### Modèle possible

```text
Free
├── budget manuel
├── transactions manuelles
└── fonctionnalités de base

Premium
├── synchronisation bancaire
├── prévisions avancées
├── analyses
├── automatisations
└── objectifs avancés
```

Mais ne pas ajouter un abonnement uniquement parce que « les SaaS sont payants ».

Le prix doit découler :

```text
Valeur perçue
+
Coût infrastructure
+
Coût fournisseur bancaire
+
Support
+
Marge cible
```

---

# 15. Phase 12 — Lancement public

## Checklist Go-Live

### Produit

- [ ] Onboarding terminé.
- [ ] UX mobile validée.
- [ ] UX desktop validée.
- [ ] Empty states.
- [ ] Error states.
- [ ] Import/export.
- [ ] Suppression compte.
- [ ] Support utilisateur.

### Technique

- [ ] CI/CD.
- [ ] Monitoring.
- [ ] Backup.
- [ ] Disaster recovery testé.
- [ ] Rate limiting.
- [ ] Secrets management.
- [ ] Security review.
- [ ] E2E critique.

### Juridique / confidentialité

- [ ] Politique de confidentialité.
- [ ] Conditions d'utilisation.
- [ ] Gestion des consentements.
- [ ] Processus d'accès/correction/suppression.
- [ ] Processus incident / breach.
- [ ] Analyse de la législation applicable.
- [ ] Validation juridique professionnelle avant lancement.

### Commercial

- [ ] Landing page.
- [ ] Analytics.
- [ ] Pricing.
- [ ] Support.
- [ ] FAQ.
- [ ] Email transactionnel.
- [ ] Programme de referral.

---

# 16. Roadmap chronologique recommandée

## Étape A — Prototype

```text
[✓] UX desktop
[✓] UX mobile
[✓] Navigation
[✓] Direction artistique
[ ] Validation finale de l'arborescence
[ ] User flows complets
```

## Étape B — Produit personnel robuste

```text
[ ] Refactoring Angular
[ ] Design System
[ ] Modèle financier canonique
[ ] Tests métier
[ ] Correction des incohérences de calcul
[ ] Import/export fiable
[ ] Sauvegardes
```

## Étape C — MVP multi-utilisateur

```text
[ ] Auth
[ ] Household
[ ] Isolation des données
[ ] Backend production
[ ] API v1
[ ] PostgreSQL production
[ ] Observabilité
[ ] CI/CD
```

## Étape D — Bêta privée

```text
[ ] 5 utilisateurs/familles
[ ] 10
[ ] 25
[ ] 50
[ ] Mesure activation
[ ] Mesure rétention
[ ] Collecte feedback
[ ] Correction bugs critiques
```

## Étape E — Synchronisation bancaire

```text
[ ] Choix fournisseur
[ ] Architecture adapter
[ ] Consentement
[ ] Première institution
[ ] Normalisation
[ ] Déduplication
[ ] Reconciliation
[ ] Monitoring sync
```

## Étape F — Production publique

```text
[ ] Security review
[ ] Privacy review
[ ] Legal review
[ ] Pricing
[ ] Landing page
[ ] Support
[ ] Monitoring
[ ] Incident response
[ ] Launch
```

## Étape G — Croissance

```text
[ ] Amélioration onboarding
[ ] Automatisation catégorisation
[ ] Prévisions avancées
[ ] Fonctionnalités sociales/foyer
[ ] Application mobile native ou PWA améliorée
[ ] Plus d'institutions
[ ] Referral
[ ] Acquisition payante contrôlée
```

---

# 17. Priorisation MoSCoW

## Must Have

- Authentification.
- Multi-utilisateur.
- Modèle financier fiable.
- Transactions.
- Comptes.
- Budget.
- Provisions.
- Épargne.
- Dashboard.
- Tests métier.
- Sécurité.
- Sauvegardes.
- Monitoring.

## Should Have

- Synchronisation bancaire.
- Prévisions.
- Analyses avancées.
- Notifications.
- Import automatique.
- Catégorisation intelligente.

## Could Have

- Investissements avancés.
- IA financière.
- Recommandations.
- Automatisation poussée.
- Mobile natif.

## Won't Have au début

- Marketplace financière.
- Crédit.
- Paiements.
- Courtage.
- Produit bancaire.
- Microservices distribués prématurément.

---

# 18. Architecture cible à moyen terme

```text
                         ┌───────────────────┐
                         │   Angular / PWA   │
                         └─────────┬─────────┘
                                   │
                              HTTPS / API
                                   │
                         ┌─────────▼─────────┐
                         │   Backend FINA     │
                         │                   │
                         │ Auth              │
                         │ Finance           │
                         │ Budget            │
                         │ Forecast          │
                         │ Reporting         │
                         └───┬───────┬───────┘
                             │       │
                    ┌────────▼─┐   ┌─▼──────────┐
                    │PostgreSQL│   │ Redis/Queue│
                    └──────────┘   └─────┬──────┘
                                         │
                                ┌────────▼────────┐
                                │ Bank Sync Worker │
                                └────────┬────────┘
                                         │
                                ┌────────▼────────┐
                                │ Bank Aggregator  │
                                └──────────────────┘
```

L'objectif est de garder une architecture simple tant que le volume ne justifie pas davantage de distribution.

---

# 19. KPI de pilotage du produit

## Acquisition

- visiteurs ;
- inscriptions ;
- conversion landing → inscription.

## Activation

- % ayant créé un compte financier ;
- % ayant effectué une première transaction ;
- % ayant créé un budget ;
- % ayant atteint le premier « aha moment ».

## Rétention

- D7 ;
- D30 ;
- WAU/MAU ;
- familles actives.

## Valeur

- nombre de budgets actifs ;
- transactions catégorisées ;
- provisions utilisées ;
- objectifs actifs ;
- prévisions consultées.

## Technique

- uptime ;
- P95 API ;
- taux d'erreur ;
- taux d'échec sync ;
- incidents ;
- coût par utilisateur actif.

## Business

- conversion Free → Premium ;
- MRR ;
- churn ;
- CAC ;
- LTV ;
- coût fournisseur bancaire par utilisateur.

---

# 20. La stratégie que je recommande personnellement pour FINA

Ne pas chercher à lancer immédiatement une « grosse application financière ».

Construire progressivement :

```text
Phase 1
Excellent outil personnel
        ↓
Phase 2
Excellent outil pour quelques foyers
        ↓
Phase 3
Produit fiable pour 50 familles
        ↓
Phase 4
Produit sécurisé pour 500 utilisateurs
        ↓
Phase 5
Produit commercialisable
```

Le point de bascule n'est pas le nombre de fonctionnalités.

Le vrai signal de maturité est :

> **un utilisateur connecte ses données, comprend immédiatement sa situation financière, fait confiance aux calculs, revient régulièrement et considère que FINA lui fait gagner du temps.**

---

# 21. Ordre de développement concret

Pour éviter de partir dans tous les sens, voici l'ordre que je recommande :

```text
01 — UX / Design final
02 — Modèle financier
03 — Tests métier
04 — Refactoring Angular
05 — Backend/API
06 — Authentification
07 — Multi-tenant / foyer
08 — Sécurité
09 — CI/CD
10 — Observabilité
11 — Bêta privée
12 — Synchronisation bancaire
13 — Onboarding
14 — Pricing
15 — Landing page
16 — Lancement public
17 — Acquisition
18 — Croissance
```

**Règle : ne passer à l'étape suivante que lorsque la précédente est suffisamment stable.**

---

# 22. Définition du MVP

Le MVP public de FINA devrait rester volontairement limité.

### Inclus

- compte utilisateur ;
- foyer ;
- comptes ;
- transactions ;
- catégories ;
- budget mensuel ;
- provisions ;
- objectifs d'épargne ;
- dashboard ;
- rapports essentiels ;
- import/export ;
- notifications principales ;
- sécurité et confidentialité de production.

### Après MVP

- banque connectée ;
- investissements ;
- prévisions avancées ;
- IA ;
- recommandations ;
- automatisations avancées.

Cela permet de tester d'abord **la valeur fondamentale de FINA** sans rendre le produit impossible à maintenir.

---

# 23. Résultat attendu

Au terme de cette roadmap, FINA doit être capable de fournir :

```text
Utilisateur
   ↓
Compte sécurisé
   ↓
Foyer
   ↓
Comptes financiers
   ↓
Transactions
   ↓
Budget + Provisions
   ↓
Épargne
   ↓
Prévisions
   ↓
Analyses
   ↓
Décisions financières
```

Et techniquement :

```text
Angular
+
Backend Java/.NET
+
PostgreSQL
+
CI/CD
+
Observabilité
+
Security
+
Privacy
+
Bank Aggregation
```

Le tout doit rester suffisamment simple pour être développé et opéré par une petite équipe avant d'introduire une architecture distribuée plus complexe.
