# Roadmap d'améliorations - Traqueur de Budget

Ce document regroupe les idées d'amélioration possibles pour faire évoluer l'application de budget dans le temps.

L'objectif n'est pas seulement d'ajouter des boutons, mais de rendre l'application plus utile au quotidien : mieux anticiper, moins saisir à la main, éviter les oublis, et comprendre plus vite où va l'argent.

## Priorités recommandées

| Priorité | Amélioration | Impact | Complexité |
|---|---|---:|---:|
| 1 | Marquer une provision comme payée | Très élevé | Faible à moyenne |
| 2 | Édition d'une dépense | Très élevé | Moyenne |
| 3 | Budget par catégorie | Très élevé | Moyenne à élevée |
| 4 | Prévision de fin de mois | Élevé | Moyenne |
| 5 | Alertes intelligentes | Élevé | Moyenne |
| 6 | Tableau "À payer bientôt" | Élevé | Moyenne |
| 7 | Dépenses récurrentes | Élevé | Moyenne à élevée |
| 8 | Comparaison mois précédent | Moyen à élevé | Moyenne |
| 9 | Vue annuelle | Moyen à élevé | Moyenne |
| 10 | Objectifs d'épargne | Moyen | Moyenne |

## 1. Marquer une provision comme payée

### But

Permettre de transformer une provision en dépense réelle au moment où la facture arrive.

Exemple : la provision "Taxe foncière" est prête. Quand le prélèvement passe, on clique sur "Marquer comme payé", et l'application crée automatiquement la dépense réelle dans la bonne catégorie.

### Comportement attendu

- Bouton dans chaque carte de provision : `Marquer comme payé`.
- Formulaire rapide avec :
  - montant, prérempli avec le montant attendu;
  - date, préremplie avec aujourd'hui;
  - case carte de crédit si nécessaire.
- Création automatique d'une dépense réelle :
  - même catégorie que la provision;
  - même propriétaire;
  - montant choisi;
  - date choisie.
- La dépense réelle est absorbée par la provision, donc pas de double comptage.
- Si la provision est configurée pour se recaler automatiquement, son cycle repart depuis la date du paiement.

### Pourquoi c'est utile

- Moins de saisie manuelle.
- Moins de risque d'utiliser une mauvaise catégorie.
- Meilleure cohérence entre fonds de réserve et facture réelle.

### Points d'attention

- Ne pas compter deux fois la dépense.
- Bien distinguer "ajouter au fonds" et "payer la facture".
- En vue globale, respecter le propriétaire de la provision.

## 2. Édition d'une dépense

### But

Permettre de corriger une dépense existante sans la supprimer puis la recréer.

### Comportement attendu

- Bouton modifier sur chaque ligne de dépense réelle.
- Formulaire d'édition avec :
  - montant;
  - catégorie;
  - date;
  - propriétaire;
  - carte de crédit.
- Sauvegarde immédiate avec `save()` puis `renderAll()`.
- Toast de confirmation.

### Pourquoi c'est utile

- Corriger une faute de frappe.
- Changer une mauvaise catégorie.
- Corriger une date de carte de crédit ou de paiement.

### Points d'attention

- Ne pas permettre l'édition directe des réserves synthétiques de provision.
- Si une dépense éditée appartient à une catégorie provisionnée, recalculer correctement la cagnotte.
- Si une dépense change de propriétaire, les vues Moi / Madame / Global doivent rester cohérentes.

## 3. Budget par catégorie

### But

Ajouter des sous-budgets par catégorie pour mieux comprendre où le budget dérape.

Exemples :

- Courses : 800 $ / mois
- Essence : 250 $ / mois
- Exceptionnel : 300 $ / mois
- Restaurants ou loisirs si une catégorie est ajoutée plus tard

### Comportement attendu

- Une section "Budgets par catégorie".
- Budget par propriétaire, mois et catégorie.
- Héritage du mois précédent, comme le budget mensuel actuel.
- Affichage dans le graphique ou dans une liste :
  - dépensé;
  - budget;
  - restant;
  - pourcentage utilisé.
- Alerte visuelle si une catégorie dépasse son budget.

### Pourquoi c'est utile

Le budget mensuel global dit "combien il reste", mais il ne dit pas toujours "où ça part". Les budgets par catégorie donnent une lecture beaucoup plus actionnable.

### Modèle de données possible

```js
categoryBudgets: {
  moi: {
    "2026-07": {
      Courses: 800,
      Essence: 250
    }
  },
  madame: {}
}
```

### Points d'attention

- Les provisions remplacent les paiements réels par des réserves synthétiques. Les budgets par catégorie doivent utiliser `countedExpenses()`, pas seulement les dépenses réelles.
- En vue globale, additionner les deux profils.
- Éviter de rendre l'interface trop lourde.

## 4. Prévision de fin de mois

### But

Afficher une estimation de la situation à la fin du mois si le rythme actuel continue.

Exemples :

- "À ce rythme, tu finiras le mois à 2 340 $."
- "Il resterait environ 180 $."
- "Risque de dépassement de 120 $."

### Comportement attendu

- Calculer le rythme moyen quotidien du mois en cours.
- Projeter les dépenses jusqu'au dernier jour du mois.
- Afficher une carte simple dans le haut de l'application.
- Ne pas afficher la prévision pour les mois passés ou futurs, sauf si on veut une simulation.

### Formule possible

```text
dépense projetée = dépenses comptées à date / jour courant * nombre de jours dans le mois
solde projeté = budget du mois - dépense projetée
```

### Pourquoi c'est utile

Ça permet d'agir avant la fin du mois, plutôt que de découvrir le dépassement après coup.

### Points d'attention

- Les grosses dépenses du début du mois peuvent fausser la projection.
- Les provisions mensuelles sont déjà comptées au début du mois, donc la formule doit être expliquée ou ajustée.
- Une version plus avancée pourrait comparer avec le rythme habituel des mois précédents.

## 5. Alertes intelligentes

### But

Rendre visibles les situations qui méritent une action.

### Exemples d'alertes

- Provision bientôt due et cagnotte insuffisante.
- Catégorie proche de son budget.
- Budget global à plus de 80 % avant la fin du mois.
- Carte de crédit élevée par rapport au budget.
- Solde net négatif.

### Comportement attendu

- Une petite zone "À surveiller".
- Alertes classées par importance.
- Texte court et actionnable.

Exemples :

```text
Taxe scolaire dans 12 jours : il manque 180 $.
Courses à 92 % du budget.
Carte de crédit : 1 240 $ chargés ce mois-ci.
```

### Pourquoi c'est utile

L'application devient proactive. Elle ne fait pas seulement afficher les chiffres, elle aide à décider quoi regarder.

### Points d'attention

- Ne pas afficher trop d'alertes.
- Éviter les messages anxiogènes ou répétitifs.
- Donner priorité aux alertes vraiment utiles.

## 6. Tableau "À payer bientôt"

### But

Créer une vue qui regroupe les prochains paiements importants.

### Contenu possible

- Prochaines échéances de provisions.
- Provisions en déficit.
- Factures récurrentes attendues.
- Remboursement de carte de crédit à venir, si la fonctionnalité carte évolue.

### Comportement attendu

- Liste triée par date.
- Montant prévu.
- Statut :
  - prêt;
  - en accumulation;
  - manque X $;
  - payé.
- Boutons rapides :
  - ajouter au fonds;
  - marquer comme payé.

### Pourquoi c'est utile

Ça donne une vue calendrier du budget. Très pratique pour ne pas se faire surprendre par les gros paiements.

## 7. Dépenses récurrentes

### But

Automatiser ou suggérer les dépenses qui reviennent souvent.

Exemples :

- Loyer;
- Garderie;
- Internet;
- Téléphone;
- assurances mensuelles;
- paiements de voiture;
- épargne programmée.

### Comportement attendu

Deux approches sont possibles.

### Option A : génération automatique

L'application crée automatiquement les dépenses récurrentes au début du mois.

Avantage : très pratique.

Risque : peut créer des doublons si une dépense est saisie manuellement.

### Option B : suggestions à confirmer

L'application affiche "Dépenses attendues ce mois-ci" et l'utilisateur confirme celles qui sont passées.

Avantage : plus sûr.

Risque : demande un clic de plus.

### Recommandation

Commencer par l'option B. Elle est plus simple à contrôler et réduit le risque de doublons.

### Modèle de données possible

```js
recurringExpenses: [
  {
    id: "string",
    name: "Loyer",
    amount: 1450,
    category: "Loyer",
    owner: "moi",
    dayOfMonth: 1,
    cc: false,
    active: true
  }
]
```

## 8. Comparaison avec le mois précédent

### But

Montrer ce qui change d'un mois à l'autre.

### Comportement attendu

- Comparaison du total dépensé.
- Comparaison par catégorie.
- Indicateurs simples :
  - +120 $ en courses;
  - -40 $ en essence;
  - +300 $ en exceptionnel.

### Pourquoi c'est utile

Les variations sont souvent plus parlantes que les montants absolus. Elles aident à comprendre rapidement ce qui explique un bon ou mauvais mois.

### Points d'attention

- Les provisions lissent déjà certaines dépenses. La comparaison doit utiliser les dépenses comptées pour rester cohérente.
- Les mois incomplets doivent être identifiés pour éviter les comparaisons injustes.

## 9. Vue annuelle

### But

Afficher une vision 12 mois du budget.

### Contenu possible

- Dépenses par mois.
- Budget par mois.
- Solde net par mois.
- Revenus par mois.
- Provisions accumulées et payées.
- Carte de crédit par mois.

### Comportement attendu

- Tableau annuel avec une colonne par mois.
- Totaux annuels.
- Couleurs simples pour repérer les dépassements.
- Filtre par propriétaire : Moi / Madame / Global.

### Pourquoi c'est utile

La vue mensuelle sert au quotidien. La vue annuelle sert à planifier : taxes, assurances, vacances, épargne, mois plus lourds.

## 10. Objectifs d'épargne

### But

Ajouter des objectifs d'accumulation qui ne sont pas nécessairement liés à une facture.

Exemples :

- Fonds d'urgence;
- vacances;
- CELI;
- REER;
- rénovation;
- achat important.

### Différence avec les provisions

Une provision sert à préparer une dépense future prévue.

Un objectif d'épargne sert à accumuler vers une cible, sans obligation de paiement à une date précise.

### Comportement attendu

- Nom de l'objectif.
- Montant cible.
- Date cible optionnelle.
- Propriétaire.
- Ajouts ponctuels.
- Barre de progression.

### Modèle de données possible

```js
savingsGoals: [
  {
    id: "string",
    name: "Fonds d'urgence",
    targetAmount: 5000,
    targetDate: "2026-12-31",
    owner: "moi",
    contributions: [
      { id: "string", amount: 100, date: "2026-07-18", note: "" }
    ]
  }
]
```

### Pourquoi c'est utile

Ça donne une place claire aux projets positifs du budget, pas seulement aux dépenses à contrôler.

## Ordre d'implémentation conseillé

### Phase 1 - Corriger les irritants quotidiens

1. Marquer une provision comme payée.
2. Éditer une dépense.

Ces deux améliorations réduisent beaucoup la friction de saisie.

### Phase 2 - Mieux piloter le mois courant

3. Budget par catégorie.
4. Prévision de fin de mois.
5. Alertes intelligentes.

Ces fonctions transforment l'application en outil de décision.

### Phase 3 - Planifier plus loin

6. Tableau "À payer bientôt".
7. Dépenses récurrentes.
8. Vue annuelle.

Ces fonctions rendent le budget plus prévisible.

### Phase 4 - Construire le futur

9. Objectifs d'épargne.
10. Comparaison avancée entre périodes.

Ces fonctions donnent une vision long terme.

## Recommandation finale

La prochaine amélioration la plus logique est **Marquer une provision comme payée**.

Elle complète directement le travail déjà fait sur les provisions :

- création de provision;
- réserve automatique;
- ajout manuel au fonds;
- paiement réel absorbé;
- puis, prochaine étape, paiement depuis la carte de provision.

Après ça, **Édition d'une dépense** serait le meilleur gain de confort.

