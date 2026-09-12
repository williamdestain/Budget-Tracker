# Description du prototype — `budget-redesign.html`

## Qu'est-ce que c'est

Un fichier HTML unique, autonome (pas besoin d'installation), qui montre à
quoi pourrait ressembler le Traqueur de Budget avec le nouveau design — en
version **bureau** et **mobile**, sur **5 écrans**. Ce n'est pas du code
Angular à copier tel quel : c'est une maquette cliquable pour valider la
direction visuelle avant de l'implémenter (voir `plan-industrialisation.md`
pour la suite). Les données affichées sont fictives mais réalistes
(catégories, montants, dates).

## Comment le parcourir

En haut de la page, deux réglages :

- **Bureau / Mobile** — bascule tout l'aperçu entre les deux formats. La
  taille du cadre s'adapte automatiquement à la largeur de votre écran.
- **Les 5 onglets d'écran** — Tableau de bord, Mouvements, Enveloppes &
  épargne, Carte de crédit, Rapports.

Un court texte sous l'aperçu explique le choix de design propre à l'écran
affiché.

### Ce qui est réellement cliquable dans la maquette

- Le sélecteur **Moi / Madame / Global** en haut de l'écran (change l'accent
  de couleur du bandeau de solde).
- Les filtres **Tout / Dépenses / Revenus** sur l'écran Mouvements (filtre
  vraiment la liste).
- Le bouton **+ Ajouter** (barre du haut en bureau, bouton rond en bas à
  droite en mobile) — ouvre un vrai formulaire d'ajout de transaction.
- **Payer la carte** et **Répartir un versement** — ouvrent chacun un petit
  formulaire.
- La navigation entre les 5 écrans, via la barre latérale (bureau) ou la
  barre d'onglets du bas (mobile).

Les flèches de mois et les petites actions sur chaque enveloppe (payer,
ajouter) sont volontairement décoratives : elles montrent l'intention sans
simuler toute la logique.

## Direction de design

**Le vrai problème de l'appli actuelle n'était pas la couleur, c'était
l'architecture : tout est empilé sur une seule page** (plus de 20 sections
à faire défiler). Le changement le plus important de cette proposition est
donc de découper ça en **5 destinations** claires — Tableau de bord,
Mouvements, Enveloppes & épargne, Carte de crédit, Rapports — au lieu d'une
seule page géante.

### Palette

| Rôle | Couleur | Pourquoi |
|---|---|---|
| Fond | Sauge très pâle `#F1F4EE` | Neutre et chaleureux, sans être le cliché crème/beige des maquettes génériques |
| Encre (texte) | `#1B241F` | Un noir chaud plutôt qu'un noir pur |
| Accent principal | Vert forêt `#1F6F54` | Évoque la croissance/l'épargne, plus distinctif que le bleu générique des apps de finance |
| Accent secondaire | Or/laiton `#BF8F2E` | Rappelle les pièces de monnaie et l'idée d'enveloppe/cagnotte |
| Profil « Moi » | Bleu ardoise `#4A6FA1` | Code couleur fonctionnel pour distinguer qui a fait quoi |
| Profil « Madame » | Prune `#A15385` | Idem |
| Alerte / dépassement | Rouge brique `#B3432B` | Chaud plutôt que criard |

### Typographie

Deux familles, deux rôles bien séparés :
- **Fraunces** (serif) pour les titres et les libellés de contexte — donne
  un peu de caractère et évoque un vrai registre comptable/journal.
- **IBM Plex Sans** pour tout le reste (montants, listes, boutons), avec
  chiffres tabulaires pour que les colonnes de montants s'alignent
  proprement.

### Mise en page

- **Bureau** : barre latérale sombre fixe pour la navigation, contenu
  principal sur fond clair, cartes délimitées par un simple filet plutôt
  que des ombres portées partout (pour éviter l'effet « kit de composants
  générique »).
- **Mobile** : barre d'onglets en bas (convention iOS/Android), formulaires
  en feuille remontant du bas plutôt qu'en fenêtre centrée.

### Inspirations

- **Copilot Money** et **Monarch Money** : un flux unique de transactions
  filtrable plutôt que deux listes séparées (revenus/dépenses).
- **YNAB** : les provisions comme de vraies « enveloppes » visuelles.

## Écran par écran

1. **Tableau de bord** — un bandeau « ligne comptable » (Revenus − Dépenses
   = Solde net) au lieu d'indicateurs séparés, suivi des alertes qui
   comptent vraiment, d'une prévision de fin de mois, et de ce qui s'en
   vient (échéances + enveloppes à surveiller).
2. **Mouvements** — flux unique de transactions, filtrable, avec un
   résumé du mois et le top des catégories en colonne latérale (bureau).
3. **Enveloppes & épargne** — budgets par catégorie (barres), enveloppes
   (cartes avec échéance et code couleur), objectifs d'épargne (anneaux de
   progression, pour bien les différencier des échéances récurrentes).
4. **Carte de crédit** — solde dû, répartition par catégorie (barre
   empilée + liste), historique des paiements.
5. **Rapports** — vue annuelle en graphique (barres + courbe de solde net),
   répartition en anneau, comparaison du mois en cours vs précédent.

## Prochaine étape

Le fichier `plan-industrialisation.md` détaille comment faire passer cette
direction dans le vrai code Angular, écran par écran, sans toucher à la
logique métier existante.
