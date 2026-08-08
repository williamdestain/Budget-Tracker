# Plan - ameliorer "Provisions & fonds de reserve"

## Objectif

Permettre d'ajouter un montant a une provision quand on veut, sans attendre la reserve mensuelle calculee automatiquement.

En pratique, l'idee est d'avoir une action du type "Ajouter au fonds" sur chaque provision. Exemple : la provision "Taxe fonciere" accumule deja 301,85 $/mois, mais je veux ajouter 100 $ aujourd'hui parce qu'il reste de l'argent dans le budget.

## Reponse courte : est-ce facile ?

Oui, c'est relativement facile, car l'application est un seul fichier HTML/JS/CSS et la fonctionnalite provisions est bien centralisee.

Le point important : aujourd'hui, la "cagnotte" n'est pas stockee comme un solde reel. Elle est calculee a la volee :

```text
cagnotte = reserves calculees depuis le debut - paiements reels de la categorie
```

Donc il ne faut pas simplement modifier `p.amount`, parce que `amount` represente le montant attendu au prochain prelevement, pas un depot manuel. Il faut plutot ajouter une petite source de donnees dediee aux ajouts manuels.

## Ce que le code fait deja

- `state.provisions` contient la definition de chaque provision, mais pas d'historique de mouvements.
- `provisionReserveForMonth(p, ym)` calcule la reserve automatique d'un mois.
- `provisionPot(p, currentYM)` calcule la cagnotte affichee.
- `countedExpenses()` ajoute des lignes synthetiques `provision: true` pour compter la reserve dans le budget.
- `renderProvisions()` affiche la cagnotte, la barre de progression, le statut et la suppression.
- `addProvision()` et `removeProvision()` couvrent seulement la creation/suppression d'une provision.

## Option recommandee

Ajouter un tableau de mouvements manuels dans chaque provision :

```js
provision.adjustments = [
  {
    id: "string",
    amount: 100,
    date: "2026-07-18",
    note: "Ajout ponctuel"
  }
]
```

Ces ajustements augmentent la cagnotte, mais ne changent pas le montant du prelevement ni la frequence.

Pourquoi cette option est la plus propre :

- Elle respecte le sens actuel de `amount`.
- Elle garde un historique supprimable/corrigeable.
- Elle ne force pas la creation d'une fausse depense dans une categorie.
- Elle reste compatible avec les sauvegardes existantes : les anciennes provisions auront simplement `adjustments: []`.

## Comportement propose

1. Dans chaque carte de provision, ajouter un bouton `+ Montant`.
2. Au clic, afficher un petit formulaire inline :
   - montant
   - date, par defaut aujourd'hui
   - note optionnelle
3. A la soumission :
   - ajouter l'ajustement dans `p.adjustments`
   - sauvegarder avec `save()`
   - rafraichir avec `renderAll()`
   - afficher un toast de confirmation
4. La cagnotte devient :

```text
cagnotte = reserves calculees + ajouts manuels - paiements reels de la categorie
```

5. Afficher une ligne discrete dans la carte :

```text
Ajouts manuels : 100,00 $
```

Optionnel dans une deuxieme passe : afficher les 2-3 derniers ajouts avec un bouton de suppression.

## Impact budgetaire a valider

Il y a deux interpretations possibles :

### A. Ajout manuel comme transfert interne vers le fonds

L'ajout augmente la cagnotte, mais n'apparait pas comme une depense supplementaire dans le total mensuel.

Avantage : simple, utile si tu veux juste corriger/bonifier le solde du fonds.

Risque : le budget du mois ne montre pas que tu as mis 100 $ de cote ce mois-ci.

### B. Ajout manuel comme reserve supplementaire comptabilisee

L'ajout augmente la cagnotte et apparait dans le mois comme une depense de type reserve.

Avantage : le budget mensuel reflete vraiment le cash mis de cote.

Risque : il faut bien l'afficher comme "reserve supplementaire" pour eviter la confusion avec une vraie facture.

Recommandation : commencer avec l'option B, parce que "ajouter un montant quand je veux" ressemble a une action budgetaire reelle. Dans la liste des depenses, on peut afficher une ligne synthetique separee du type "Taxe fonciere - ajout au fonds".

## Changements techniques prevus

### 1. Modele de donnees

- Etendre `normalizeProvision(p)` pour garantir :

```js
adjustments: Array.isArray(p.adjustments) ? p.adjustments : []
```

- Normaliser chaque ajustement :
  - `id`
  - `amount` positif
  - `date` valide
  - `note` texte optionnel

### 2. Calculs

Ajouter des helpers :

```js
function provisionAdjustments(p, currentYM)
function provisionAdjustmentsForMonth(p, ym)
function provisionAdjustmentTotal(p, currentYM)
```

Modifier `provisionPot(p, currentYM)` :

```text
reserved + adjustments - spent
```

Modifier `countedExpenses()` si on choisit l'option B :

- ajouter des lignes synthetiques pour les ajustements du mois
- les marquer avec un champ distinct, par exemple `provisionAdjustment: true`

### 3. Interface

Dans `renderProvisions()` :

- ajouter un bouton `+ Montant` dans `.prov-actions`
- ajouter le total des ajouts manuels dans le pied de carte
- ajouter un formulaire inline conditionnel ou un prompt controle

Preferer un formulaire inline, plus propre que `prompt()`.

### 4. Actions

Ajouter :

```js
function addProvisionAdjustment(provisionId, amount, date, note)
function removeProvisionAdjustment(provisionId, adjustmentId)
```

Comme le reste de l'application :

```js
save();
renderAll();
toast(...);
```

### 5. Documentation

Mettre a jour `DOCUMENTATION.md` :

- modele de donnees des provisions
- formule de cagnotte
- comportement des ajouts manuels
- export/import, qui continuera de fonctionner car `state.provisions` est deja exporte

## Fichiers a modifier

- `budget-tracker.html`
  - CSS de la carte provision
  - rendu `renderProvisions()`
  - normalisation/migration
  - calculs de cagnotte
  - actions d'ajout/suppression d'ajustement
  - event handlers si le formulaire est rendu dynamiquement
- `DOCUMENTATION.md`
  - mise a jour technique et fonctionnelle

## Risques / points d'attention

- Ne pas confondre un ajout manuel au fonds avec un paiement reel de la facture.
- Eviter le double comptage si l'ajout manuel est aussi compte dans `countedExpenses()`.
- En vue `Global`, additionner correctement les ajustements de Moi et Madame.
- En vue `Tout`, inclure les ajustements dans les bons mois.
- Garder les anciennes sauvegardes compatibles.

## Plan d'implementation propose

1. Ajouter la migration `adjustments: []` dans `normalizeProvision()`.
2. Ajouter les helpers de calcul des ajustements.
3. Modifier `provisionPot()` pour inclure les ajouts manuels.
4. Modifier `countedExpenses()` pour afficher/compter les ajouts comme reserves supplementaires.
5. Ajouter le formulaire/bouton dans `renderProvisions()`.
6. Ajouter les actions `addProvisionAdjustment()` et `removeProvisionAdjustment()`.
7. Mettre a jour le rendu de la liste pour distinguer les reserves automatiques des ajouts manuels.
8. Mettre a jour `DOCUMENTATION.md`.
9. Tester manuellement :
   - ajouter une provision
   - ajouter 100 $ au fonds
   - verifier la cagnotte
   - verifier le total mensuel
   - naviguer entre mois
   - verifier la vue Global
   - exporter/restaurer un JSON

## Estimation

Facilite : moyenne-facile.

La logique est localisee, donc il n'y a pas beaucoup de fichiers a toucher. Le seul morceau delicat est le double comptage : il faut que l'ajout augmente la cagnotte et, si on le compte dans le budget, qu'il apparaisse comme une reserve supplementaire claire, pas comme une facture reelle.

