# FINA — Feuille de route pour devenir un vrai produit

Ce document complète `plan-industrialisation.md` (qui couvre la migration
visuelle vers Angular). Ici, on regarde plus large : qu'est-ce qu'il faut
mettre en place, techniquement, légalement et sur le plan affaires, pour
que FINA passe d'une appli privée à un produit que d'autres foyers peuvent
utiliser.

**Avertissement :** je ne suis ni avocat ni comptable. Les sections légales
et fiscales ci-dessous donnent un état des lieux factuel pour que vous
puissiez poser les bonnes questions — pas des conseils juridiques. Avant
d'ouvrir FINA à d'autres utilisateurs payants, faites valider la conformité
par un·e avocat·e spécialisé·e en protection des données au Québec.

---

## 1. D'abord, une vraie décision à prendre : jusqu'où ?

« Devenir un vrai produit » recouvre trois paliers très différents en
termes d'effort. Rien n'oblige à viser le palier 3 dès le départ — chaque
palier est un produit complet et utilisable en soi.

| Palier | Description | Ce que ça demande en plus |
|---|---|---|
| **A — Votre foyer, en mieux** | FINA reste privé à vous deux, mais avec le nouveau design, les enveloppes, les investissements et les comptes multiples | Ce qui est déjà dans `plan-industrialisation.md` + le modèle financier canonique et le modèle de membres généralisé (sections 2 et 3) |
| **B — Cercle restreint** | Famille et amis créent leur propre foyer dans la même appli | Modèle multi-foyers, inscription/connexion en libre-service, pages légales de base |
| **C — Produit public** | N'importe qui peut s'inscrire, éventuellement payer | Tout le palier B + facturation, conformité Loi 25 complète, support, sécurité renforcée, stratégie de synchronisation bancaire |

Le reste de ce document est organisé pour qu'on puisse s'arrêter à
n'importe quel palier sans avoir travaillé « pour rien ».

---

## 2. Le modèle financier canonique (avant tout le reste)

Peu importe le palier visé, il y a une priorité qui passe avant le design
et avant l'infrastructure : que les calculs soient toujours justes. Une
interface magnifique qui affiche un mauvais solde net perd la confiance
instantanément — bien plus vite qu'une interface un peu datée mais qui
calcule juste. C'est le genre de travail invisible qu'on reporte
facilement, jusqu'à ce qu'un foyer pilote découvre l'incohérence avant
vous.

Concrètement, ça veut dire documenter une fois, clairement, ce que chaque
entité représente et comment elle se calcule — plutôt que de laisser
chaque composant Angular recalculer sa propre version d'un même chiffre.

### Les entités à documenter

Bonne nouvelle : elles existent déjà, éparpillées dans votre `BudgetStore`
et vos composants `features/`. Ce qui manque, c'est un endroit unique qui
les documente formellement :

```text
Compte (Account)
Transaction
Catégorie (Category)
Budget de catégorie (CategoryBudget)
Provision (enveloppe)
Revenu récurrent (RecurringIncome)
Dépense récurrente (RecurringExpense)
Objectif d'épargne (SavingsGoal)
Compte d'investissement (InvestmentAccount)
Foyer (Household)
Membre (HouseholdMember)
Clôture de mois (MonthClosure)
Prévision (Forecast)
Alerte (Alert)
```

Pour chacune, notez quelque part (un simple fichier `MODELE.md` dans le
dépôt suffit, pas besoin d'un outil dédié) :

- **qui calcule quoi** — le solde net est-il calculé dans le store, dans
  un composant, ou dupliqué aux deux endroits ?
- **le cycle de vie** — une transaction peut-elle changer de catégorie
  après la clôture du mois ? Une provision reporte-t-elle son surplus ou
  repart-elle à zéro ?
- **les unités** — devise (CAD pour l'instant, mais autant le documenter
  avant d'en avoir besoin), arrondi (au cent près, toujours de la même
  façon), fuseau horaire pour les dates de transaction.
- **le comportement rétroactif** — si on modifie une dépense du mois
  dernier, qu'est-ce qui doit se recalculer ? Le budget de la catégorie ?
  La prévision ? Rien, si le mois est déjà clôturé ?

### Une seule définition par métrique

Le piège classique d'une appli de budget qui grossit : « dépenses du
mois » qui ne veut plus dire la même chose sur le tableau de bord (qui
exclut peut-être les provisions), sur la page Rapports (qui les inclut)
et dans un export CSV. Choisissez une définition par métrique,
consignez-la dans le `MODELE.md`, et faites en sorte que chaque écran
passe par la même fonction du store plutôt que de la recalculer
localement. Ce n'est pas du travail en plus — c'est le travail qui évite
de découvrir un bug de calcul après que plusieurs foyers l'ont vu avant
vous.

Ce travail se fait entièrement au palier A, avant même de penser à
d'autres foyers — c'est justement ce qui rend le palier B sans danger
plus tard : vous n'ajoutez pas de nouveaux utilisateurs à un moteur de
calcul encore flou.

---

## 3. Généraliser l'identité : foyers, membres et rôles

Le prototype remplace les profils fixes « Moi / Madame » par une liste de
**membres du foyer**. Pour que ça tienne au-delà de votre propre foyer
(palier B), il faut un modèle un peu plus riche qu'une simple liste de
noms :

```text
User             — un compte de connexion (courriel, mot de passe)
Household        — un foyer
HouseholdMember  — le lien entre un User et un Household, avec un rôle
Role             — propriétaire / membre, au minimum
Invitation       — pour ajouter quelqu'un à un foyer existant
```

Dans Supabase, concrètement :

- Une table `household_members` (foyer, utilisateur, nom affiché,
  couleur, rôle) au lieu de colonnes ou d'énumérations codées en dur pour
  deux personnes précises.
- Une table `accounts` générique (nom, institution, type : bancaire /
  carte de crédit / investissement, solde) — au lieu d'un module « carte
  de crédit » séparé. C'est ce qui permet à la page Comptes de tout
  afficher au même endroit et à la synchronisation bancaire future de
  s'y brancher sans tout reconstruire.
- Les tables `transactions`, `provisions`, `savings_goals` référencent un
  `member_id` et un `account_id` plutôt que des champs `owner: 'moi' |
  'madame'`.
- Une table `invitations` (courriel invité, foyer, rôle proposé, statut)
  — nécessaire seulement au palier B, mais autant réserver le nom de
  table maintenant pour éviter une migration plus tard.

Le rôle (`owner` vs `member`) ne sert à rien tant que vous êtes deux dans
un foyer de confiance — mais le poser maintenant évite une migration de
données pénible le jour où un foyer voudra, par exemple, donner un accès
en lecture seule à un·e comptable.

C'est un changement de schéma, pas un changement de complexité — les
règles RLS (row-level security) que vous avez déjà pour isoler les
données d'un foyer continuent de fonctionner de la même façon, juste sur
des tables mieux nommées, avec en plus une vérification du rôle pour les
actions sensibles (inviter quelqu'un, supprimer le foyer).

---

## 4. Le cadre légal, si vous accueillez d'autres foyers (palier B et C)

Comme vous êtes basé au Québec, la loi qui s'applique en premier n'est
**pas le RGPD européen** (souvent cité par erreur comme référence) mais la
**Loi 25** — la Loi modernisant des dispositions législatives en matière de
protection des renseignements personnels. Points concrets :

- Depuis le 22 septembre 2024, l'ensemble des dispositions de la Loi 25 s'appliquent au Québec, et la Commission d'accès à l'information dispose du pouvoir d'imposer seule des sanctions administratives pouvant atteindre 10 millions de dollars ou 2 % du chiffre d'affaires mondial — et elle s'applique **peu importe la taille de l'entreprise**, dès que vous traitez des renseignements personnels de résident·es du Québec.
- Vous devrez **désigner une personne responsable de la protection des
  renseignements personnels** (ça peut être vous) et publier son titre et
  ses coordonnées sur le site.
- Il faut tenir un registre des incidents de confidentialité et notifier
  la Commission d'accès à l'information en cas de fuite présentant un
  risque de préjudice sérieux.
- Les utilisateurs et utilisatrices ont droit à la portabilité de leurs
  données (pouvoir exporter leurs transactions dans un format structuré —
  ce qui recoupe d'ailleurs les boutons d'export CSV déjà prévus dans le
  prototype) et à une information claire sur ce qui est fait de leurs
  données.
- Au niveau fédéral, la loi de référence reste la LPRPDE (PIPEDA) : le projet de loi C-27, qui devait la moderniser, est mort au feuilleton en janvier 2025 et aucun remplacement n'a été déposé depuis — la Loi 25 reste donc, en pratique, la barre la plus haute à respecter.

Concrètement, avant le palier B : une politique de confidentialité réelle
(pas un gabarit générique), un point de contact publié, et un plan simple
« que faire si les données fuient ».

---

## 5. La synchronisation bancaire : où en est le Canada, et quand s'y mettre

Le badge « Synchronisation bancaire : bientôt » dans le prototype n'est
pas juste un vœu pieux — c'est le bon moment pour ne **pas** se précipiter :

- Le cadre canadien de « banque axée sur le consommateur » (Consumer-Driven Banking) repose sur la Loi sur les services bancaires axés sur les consommateurs, adoptée en 2024 et étendue par le projet de loi C-15, sanctionné en mars 2026, avec la Banque du Canada comme organisme de surveillance.
- Le déploiement se fait en deux phases : la phase 1 (accès en lecture seule aux données de compte) et la phase 2, prévue autour de mi-2027, pour l'accès en écriture (paiements). Les six grandes banques sont des participants obligatoires ; les coopératives et petites institutions peuvent y adhérer volontairement.
- Ce nouveau cadre remplace le « screen scraping » — la pratique actuelle où des centaines de fintechs canadiennes accèdent aux données bancaires avec les identifiants de l'utilisateur — par des connexions API chiffrées et accréditées, ce qui veut dire que bâtir votre propre connecteur par grattage d'écran serait un investissement voué à devenir obsolète, voire non conforme.

**Recommandation concrète :** ne construisez pas votre propre connexion
bancaire. Deux chemins réalistes existent déjà aujourd'hui pour un projet
de cette taille :

1. **Rester en saisie manuelle** (ce que fait le prototype) jusqu'à ce que
   le cadre réglementaire soit mature — c'est le choix le plus sûr pour un
   produit en palier A ou B.
2. **Passer par un agrégateur accrédité** le moment venu : Flinks, fondé à Montréal, est aujourd'hui une filiale semi-autonome de la Banque Nationale du Canada et alimente déjà des produits comme Wealthsimple, Borrowell et EQ Bank ; Plaid, son concurrent américain, a aussi élargi sa couverture des institutions canadiennes, incluant Desjardins, la Banque Nationale et plusieurs coopératives de crédit. Les deux existent en mode « payer par appel API », sans devoir attendre votre propre accréditation réglementaire.

Autrement dit : le modèle de données `accounts` (section 3) est le seul
prérequis technique réel aujourd'hui. La décision d'intégration bancaire
peut attendre le palier C sans rien bloquer d'ici là.

---

## 6. Modèle d'affaires (si palier C)

Quelques options concrètes, pas mutuellement exclusives :

- **Abonnement freemium** : gratuit pour un foyer avec fonctionnalités de
  base (le cœur budget/enveloppes), payant pour les investissements, les
  rapports avancés ou plusieurs foyers liés — modèle le plus proche de
  YNAB ou Copilot Money.
- **Abonnement simple, sans palier gratuit** : plus simple à opérer pour
  un projet solo, moins de friction produit (pas de logique de
  limitation de fonctionnalités à maintenir).
- **Modèle par recommandation/affiliation** : Hardbacon, une plateforme québécoise de finances personnelles, génère des revenus grâce à des partenariats avec des fournisseurs de produits financiers lorsque des utilisateurs font une demande par son entremise plutôt que par abonnement. Moins adapté à un outil de suivi comme FINA (l'utilisateur n'est pas en train de magasiner un produit financier), mais une option à garder en tête si une page de recommandations voit le jour un jour.

Pour la facturation elle-même, Stripe fonctionne bien pour une entreprise
basée au Canada et gère la taxation (TPS/TVQ) de façon largement
automatisée — à valider avec un·e comptable au moment venu.

---

## 7. Infrastructure et sécurité (paliers B et C)

- **Supabase** (déjà en place) supporte le multi-tenant sans changement
  d'outil — c'est une question de schéma (sections 2 et 3) et de règles
  RLS correctement écrites par foyer, pas de migration technologique.
- **Hébergement** : GitHub Pages (déjà utilisé) reste suffisant tant que
  FINA est une application cliente pure qui parle directement à Supabase.
  Un nom de domaine dédié devient nécessaire dès le palier B (crédibilité
  + email transactionnel cohérent).
- **Authentification** : l'authentification Supabase existante devient le
  chemin d'inscription libre-service — prévoir la vérification de
  courriel, la réinitialisation de mot de passe, et, avant le palier C,
  une option d'authentification à deux facteurs.
- **Observabilité minimale** avant d'accueillir des foyers externes : un
  suivi d'erreurs (ex. Sentry, plan gratuit largement suffisant au départ)
  et des sauvegardes automatiques de la base de données (Supabase les
  offre nativement).

---

## 8. Feuille de route suggérée

```
Palier A — votre foyer (voir aussi plan-industrialisation.md)
  1. Modèle financier canonique documenté (section 2)
  2. Modèle d'identité généralisé : foyers, membres, rôles (section 3)
  3. Migration visuelle des 8 pages
  4. Mode sombre, accessibilité

Palier B — cercle restreint (famille, amis)
  5. Inscription/connexion en libre-service + création de foyer
  6. Multi-tenant réel (RLS par foyer, testé avec 2-3 foyers pilotes)
  7. Politique de confidentialité + responsable désigné (section 4)
  8. Nom de domaine, email transactionnel, sauvegardes, suivi d'erreurs

Palier C — produit public
  9. Facturation (si applicable) + pages légales complètes
  10. Authentification renforcée (2FA), registre d'incidents opérationnel
  11. Décision sur l'intégration bancaire (Flinks/Plaid) — section 5
  12. Support client (même minimal : une adresse courriel suivie)
  13. Lancement progressif (liste d'attente plutôt qu'ouverture large)
```

Chaque palier peut rester le point d'arrêt final — il n'y a aucune
obligation d'aller jusqu'au palier C.

---

## 9. Ce qu'il ne faut pas faire tout de suite

- Construire votre propre connecteur bancaire par grattage d'écran (voir
  section 5 — en plus d'être fragile, le nouveau cadre réglementaire vise
  précisément à éliminer cette pratique).
- Ajouter du trading ou de l'exécution d'ordres — FINA fait du suivi
  patrimonial, pas de courtage ; c'est une tout autre catégorie de
  réglementation (valeurs mobilières) qui n'a pas sa place ici.
- Ouvrir l'inscription publique avant d'avoir une politique de
  confidentialité réelle et un responsable désigné (section 4) — c'est le
  strict minimum légal, pas une nice-to-have.
- Refaire l'architecture de données à chaque nouveau palier : les modèles
  des sections 2 et 3, posés une fois correctement, servent du palier A
  au palier C sans réécriture.

---

## Sources

- Loi 25 — entrée en vigueur complète et sanctions : secureprivacy.ai, fasken.com (avril 2026)
- Statut du projet de loi fédéral C-27 : secureprivacy.ai (citant Torys, IAPP)
- Cadre de banque axée sur le consommateur (C-15, Banque du Canada) : fiskil.com, openbankingtracker.com, facephi.com
- Flinks et son actionnariat : altss.com
- Couverture canadienne de Plaid : crowdfundinsider.com
- Modèle d'affaires de Hardbacon : hardbacon.ca
