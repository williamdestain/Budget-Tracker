# FINA — Concept et description des pages (v2, fusionné)

## 1. Ce qui a changé par rapport aux deux propositions précédentes

Ce prototype (`fina-prototype.html`) fusionne :

- **De la première maquette** (le budget de foyer) : la direction visuelle
  distinctive (palette sauge/vert forêt/or, typographie Fraunces + IBM Plex
  Sans, métaphore de l'enveloppe, filets fins plutôt qu'ombres partout), la
  mécanique bureau/mobile avec bascule, et les données réalistes du foyer.
- **De la proposition ChatGPT (FINA)** : le nom du produit, le cadrage en
  cinq questions mentales, les pages Comptes et Investissements, le bouton
  `+` central dans la barre mobile, les boutons d'export, et l'idée de
  préparer le terrain pour la synchronisation bancaire.
- **Nouveau dans cette version** : les profils fixes « Moi / Madame » sont
  remplacés par une liste de **membres du foyer configurable** (ici Alex et
  Sam, à titre d'exemple neutre) — nécessaire pour que FINA fonctionne aussi
  bien pour une personne seule, un couple, une colocation ou une famille.

Comme dans la version précédente, c'est un fichier HTML autonome avec des
données fictives — une maquette pour valider les décisions avant d'écrire
la moindre ligne de code Angular.

## 2. Le concept : cinq questions plutôt que des menus techniques

| Question | Page(s) |
|---|---|
| Où en suis-je ? | Tableau de bord |
| Qu'est-ce qui s'est passé ? | Mouvements |
| Comment organiser mon argent ? | Budget & enveloppes |
| Qu'est-ce que je veux atteindre ? | Épargne & objectifs |
| Vais-je dans la bonne direction ? | Investissements, Rapports |

Comptes et Paramètres n'entrent dans aucune de ces cinq questions par
nature : ce sont les pages d'infrastructure (où vivent les données et les
réglages), pas des pages de décision quotidienne — d'où leur position en
bas de la navigation.

## 3. Comment parcourir le prototype

- **Bureau / Mobile** en haut : bascule tout l'aperçu, taille adaptée à
  votre écran automatiquement.
- **8 onglets** : Tableau de bord, Mouvements, Budget & enveloppes,
  Épargne & objectifs, Investissements, Comptes, Rapports, Paramètres.
- Le texte sous l'aperçu change selon l'écran affiché et explique le choix
  de design.

### Ce qui est réellement fonctionnel

- Navigation complète entre les 8 pages (barre latérale en bureau, barre
  du bas + feuille « Plus » en mobile).
- Le sélecteur de **membres** (Tous / Alex / Sam) — recolore l'accent du
  bandeau de solde. *Les montants affichés restent ceux du foyer dans
  cette démo ; en production ils seraient recalculés par membre.*
- Les filtres de la page Mouvements (type, compte, recherche texte) —
  filtrent vraiment la liste.
- Le bouton **+ Ajouter** (bureau et mobile) — ouvre un vrai formulaire.
- **Répartir un versement**, **Voir le détail** (sur la carte de crédit,
  depuis Comptes) — ouvrent des formulaires ou un détail.
- Le bouton de thème (haut de l'écran ou dans Paramètres) — **vrai mode
  sombre fonctionnel**, par substitution de variables CSS.
- Les boutons « bientôt disponible » (synchronisation, export, nouveau
  compte, nouvel objectif) affichent volontairement un message honnête
  plutôt que de simuler une action qui n'existe pas encore.

## 4. Page par page

### Tableau de bord
Le bandeau « ligne comptable » (Revenus − Dépenses = Solde net), les
alertes qui comptent, une prévision de fin de mois, les enveloppes à
surveiller, ce qui s'en vient, et — nouveauté — un aperçu compact du
patrimoine total (comptes + investissements − dettes) avec un lien vers
Comptes.

### Mouvements
Flux unique de transactions (dépenses, revenus, transferts), filtrable par
type, par compte et par mots-clés. Un résumé du mois et le top des
catégories en colonne latérale sur bureau.

### Budget & enveloppes
Budgets par catégorie (barres) et enveloppes pour les dépenses irrégulières
(cartes avec échéance et code couleur). Les objectifs d'épargne ont été
déplacés dans leur propre page (voir ci-dessous) pour ne pas mélanger deux
horizons de temps différents — un budget se consomme chaque mois, un
objectif se construit sur plusieurs mois.

### Épargne & objectifs *(nouvelle page)*
Chaque objectif affiche sa progression en anneau, sa contribution
mensuelle et son évolution récente (« +200,00 $ ce mois-ci ») — pensé pour
être motivant plutôt que purement comptable, comme le proposait la
maquette FINA.

### Investissements *(nouvelle page)*
Valeur totale, performance sur 12 mois (graphique en ligne), allocation en
anneau, liste des comptes d'investissement. Volontairement limité à un
suivi patrimonial simple — FINA n'a pas vocation à devenir une plateforme
de trading.

### Comptes *(nouvelle page, remplace l'ancienne page « Carte de crédit »)*
Vue d'ensemble de la valeur nette et de tous les comptes, groupés par type
(bancaires, cartes de crédit, investissements). Chaque compte bancaire
affiche un badge « Synchronisation bancaire : bientôt » — honnête sur
l'état actuel plutôt que de laisser croire à une fonctionnalité existante.
Cliquer sur « Voir le détail » d'une carte de crédit ouvre la répartition
par catégorie et l'historique des paiements (repris de la première
maquette, maintenant en fenêtre de détail plutôt qu'en page dédiée — plus
extensible si d'autres types de comptes ont un jour besoin du même genre
de détail).

### Rapports
Vue annuelle (qui sert aussi de flux de trésorerie), répartition par
catégorie, comparaison du mois en cours vs précédent, et des boutons
d'export CSV/PDF (état « bientôt disponible » assumé).

### Paramètres
Réglages groupés par catégorie (Profil, Foyer & membres, Catégories,
Automatisations, Données, Sécurité) plutôt qu'empilés sur une page unique,
avec le contrôle du thème clair/sombre en haut.

## 5. Système de design (inchangé dans son esprit, précisé ici)

- **Couleurs** : fond sauge très pâle, encre chaude plutôt que noir pur,
  vert forêt en accent principal, or/laiton en accent secondaire, rouge
  brique pour les alertes — chaque membre du foyer a sa propre couleur,
  utilisée comme repère fonctionnel (qui a fait quoi) plutôt que comme
  décoration.
- **Typographie** : Fraunces (serif) pour les titres et libellés de
  contexte, IBM Plex Sans pour tout le reste, avec chiffres tabulaires
  pour que les montants s'alignent proprement en colonnes.
- **Mode sombre** : mêmes noms de variables CSS, valeurs différentes —
  aucun composant n'a besoin d'être « conscient » du thème actif, ce qui
  simplifiera beaucoup l'implémentation Angular (voir la feuille de route
  produit).

## 6. Limites assumées de ce prototype

- Les montants ne changent pas réellement selon le membre sélectionné ou
  le mois affiché (démonstration visuelle, pas de moteur de calcul).
- Aucune des actions marquées « bientôt disponible » n'est réellement
  implémentée — c'est intentionnel, voir `FINA-feuille-de-route-produit.md`
  pour savoir dans quel ordre les construire.
- Aucune authentification, aucune base de données, aucune vraie connexion
  bancaire.
