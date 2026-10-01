# Plan d'industrialisation — refonte visuelle de FINA (v2, 8 écrans)

Ce plan explique comment faire passer la direction de design du prototype
fusionné (`fina-prototype.html`) dans la vraie application Angular, **sans
toucher à la logique métier existante** (store, calculs de provisions, RLS
Supabase, etc.), qui fonctionne déjà et est couverte par plus de 750 tests (764 au 29
septembre 2026).

**Ce document remplace la version précédente**, écrite avant la fusion avec
la proposition ChatGPT. Les différences principales : 5 destinations
deviennent 8, les profils fixes « Moi / Madame » deviennent une liste de
membres du foyer configurable, et trois écrans (Comptes, Investissements,
Épargne & objectifs) ne sont plus de simples restylages — ils dépendent du
modèle de données généralisé décrit dans `FINA-feuille-de-route-produit.md`
(sections 2 et 3). Ce plan le signale explicitement à chaque fois que c'est
le cas.

Principe directeur inchangé : **c'est d'abord un chantier de couche
présentation.** Un fichier `.ts` de logique métier ne change de
comportement que lorsque c'est justement l'objet de la phase (les nouvelles
tables `accounts`/`household_members`) — jamais en cours de restylage.

---

## Vue d'ensemble des phases

| Phase | Contenu | Effort estimé |
|---|---|---|
| 0 — Fondations | Design tokens, polices, composants partagés, icônes, mini-composants graphiques | 4–6 jours |
| 1 — Architecture de navigation | Routing Angular, 8 destinations, `AppShellComponent`, membres dynamiques | 5–6 jours |
| 2 — Migration visuelle (vague A) | Écrans qui ne dépendent d'aucun nouveau schéma | 8–12 jours |
| 2 — Nouveaux écrans (vague B) | Comptes, Investissements, Épargne & objectifs, Paramètres — dépendent du schéma généralisé | 11–14 jours |
| 3 — Adaptation mobile | Bottom nav à 5 emplacements, bouton `+`, feuille « Plus » | 5–6 jours |
| 4 — Polish & accessibilité | Mode sombre, focus clavier, `prefers-reduced-motion` | 3–5 jours |
| 5 — Tests & déploiement | Non-régression, aperçu, mise en prod progressive | 4–6 jours |
| **Total** | | **≈ 40–55 jours-personne** |

C'est plus long que l'estimation précédente (27–40 jours) — honnêtement,
parce que la portée a grandi : Investissements est une fonctionnalité qui
n'existe pas du tout aujourd'hui, et Comptes/Paramètres ont besoin du
nouveau modèle de données avant d'exister pour de vrai. En mode projet
perso (quelques soirs par semaine), comptez **4 à 6 mois** plutôt que 3 à 4.
Rien n'empêche de s'arrêter après la vague A et de vivre très bien avec un
FINA au visuel refondu mais sans Investissements — voir le palier A de
`FINA-feuille-de-route-produit.md`.

---

## Phase 0 — Fondations du design system (4–6 jours)

**Objectif :** poser le nouveau vocabulaire visuel une fois, à un seul
endroit, avant de toucher au moindre écran.

**État au 12 septembre 2026** — Phase 0 complète, livrée en deux temps
(`fina-phase0-fondations-visuelles.zip` puis
`fina-phase0-complement.zip`). Les fondations sont présentes dans le
projet et le type-check, le build et la suite de tests ont été vérifiés :

| Élément | Statut |
|---|---|
| Tokens de couleur/typographie (`styles.scss`), mêmes noms de variables | ✅ Fait |
| Polices Fraunces + IBM Plex Sans (auto-hébergées via `@fontsource`, importées dans `styles.scss`) | ✅ Fait |
| Correctif badge « Moi » (`--owner-moi`, pour ne pas devenir vert) | ✅ Fait |
| `IconComponent` + registre (33 icônes SVG) | ✅ Fait |
| `ButtonComponent`, `CardComponent`, `ChipComponent`, `ProgressBarComponent`, `ProgressRingComponent` | ✅ Fait |
| `ModalComponent` (fenêtre bureau / feuille mobile, Échap, fond cliquable) | ✅ Fait |
| `DonutChartComponent` | ✅ Fait |
| `BarLineChartComponent` — remplace les deux composants distincts prévus initialement (voir note ci-dessous) | ✅ Fait |
| `MemberSwitchComponent` (branché sur le store ; le repli legacy a été retiré) | ✅ Fait |
| Bac à sable `/design-system` | ✅ Fait, les 10 composants y sont démontrés ; ⬜ **à retirer ou protéger avant la production** — la route est publique et sans garde (constat du 29 septembre) |
| Remplacer les emojis dans les ~20 templates existants | ⬜ **Reste à faire** — c'est le travail de la Phase 2, écran par écran ; l'infrastructure (`IconComponent`) est prête. **Mesuré le 29 septembre 2026 : 126 occurrences dans 33 fichiers** (hors `/design-system`), dont 29 dans la table de correspondance de `icon-names.ts`, légitimes ; le reste se trouve surtout dans les anciens blocs encore empilés sur le tableau de bord |

**Écart par rapport au plan initial, assumé :** un seul `BarLineChartComponent`
remplace les `LineChartComponent`/`BarChartComponent` prévus séparément —
la vue annuelle (barres + ligne) et l'évolution du portefeuille (ligne
seule) partagent exactement le même calcul de position sur l'axe X ; les
séparer aurait dupliqué cette géométrie pour rien.

Le seul ⬜ restant (emojis) est du ressort de la Phase 2, pas de la Phase 0
— la Phase 0 elle-même est donc terminée.

**Validation du 12 septembre 2026** : `npx tsc --noEmit` réussit ;
`npm run build` réussit avec 2 avertissements de budget de taille à
surveiller (bundle initial ~567 Ko pour un budget de 520 Ko,
`provision-card.scss` légèrement au-dessus de sa limite) ; la suite compte
**279 verts sur 279**.

**⚠ Point `provisionDaysUntilNext` — résolu pour de bon le 27 septembre
2026.** Le 12 septembre, le test avait été laissé à `toBe(180)` entre le 1er
janvier et le 1er juillet 2026 (valeur calendaire : 181). L'explication
donnée alors était juste, mais la conclusion — « conserver 180 » — masquait
un vrai bug : le code faisait un `Math.floor` sur une différence de `Date`
**locales**, dont la valeur dépend du fuseau de la machine. Un passage à
l'heure d'été entre les deux dates retire une heure (180,96 j → 180 au
Québec, en Europe, en Californie) ; dans le Sud (Sydney, Auckland) c'est
l'inverse et on obtenait 213 au lieu de 214. La CI, en UTC (aucun
changement d'heure), voyait 181 : le test passait ou échouait selon la
machine, ce qui explique l'échec « préexistant » signalé à l'audit du 25
septembre. **Correctif :** `daysBetween()` (`date.utils.ts`) compte
maintenant en UTC (`Date.UTC`) et `provisionDaysUntilNext()` l'utilise ; le
résultat est un entier exact, identique partout. **Attendu du test : 181**,
vrai dans tous les fuseaux. Couvert par des tests qui forcent 5 fuseaux
(UTC, Toronto, Los Angeles, Paris, Sydney) via `withTimezone()`
(`core/testing/with-timezone.ts`) — vérifiés en échec sur l'ancien code,
en succès sur le nouveau. La suite complète passe aussi sous chacun de ces
fuseaux. `goalDaysLeft()` (épargne) n'avait pas le défaut (son `Math.round`
absorbe l'heure), désormais verrouillé par un test.

Le reste de cette section décrit la portée complète visée — utile pour
savoir *quoi* construire quand on reprend chacun des ⬜ ci-dessus, pas
seulement *qu'*il reste à le faire.

1. **Étendre `src/styles.scss`** : garder les mêmes noms de variables CSS
   qu'aujourd'hui (`--bg`, `--card`, `--ink`, `--accent`, …) pour ne rien
   casser ailleurs, mais changer leurs valeurs pour la nouvelle palette, et
   ajouter : `--primary`, `--primary-dark`, `--gold`, `--font-display`,
   `--font-body`. Les couleurs de membre (`--moi`/`--madame` dans la v1) ne
   sont plus des variables globales fixes — voir point 4.
   - Le mode sombre existant (`:root[data-theme='dark']`, piloté par
     `ThemeService`) reçoit sa propre redéfinition des mêmes noms, comme
     aujourd'hui — c'est aussi ce que le prototype démontre (bascule
     clair/sombre fonctionnelle par simple substitution de variables).
2. **Charger les polices** (Fraunces + IBM Plex Sans) dans `src/index.html`,
   idéalement auto-hébergées (`@fontsource/fraunces`,
   `@fontsource/ibm-plex-sans`) plutôt que Google Fonts en direct.
3. **Composants partagés** dans `src/app/shared/ui/` : `ButtonComponent`,
   `CardComponent`, `ChipComponent`/`SegmentedControlComponent`,
   `ProgressBarComponent`, `ModalComponent` (bottom sheet sur mobile),
   `ToastComponent` (existe déjà, à réutiliser).
4. **Nouveaux petits composants nécessaires pour les 8 écrans** (n'existaient
   pas dans le plan précédent) :
   - `ProgressRingComponent` — l'anneau de progression des objectifs
     d'épargne (le même truc CSS `conic-gradient` que dans le prototype).
   - `DonutChartComponent` — répartition par catégorie et allocation de
     portefeuille, même technique.
   - `LineChartComponent` / `BarChartComponent` — vue annuelle et évolution
     du portefeuille. Le prototype les génère en SVG à la main (voir les
     fonctions `buildYearlyChart`/`buildLineChart` du fichier) ; c'est
     amplement suffisant ici, aucune dépendance npm nécessaire pour un
     graphique de 12 points. Si les besoins grandissent plus tard
     (zoom, tooltips riches), une vraie librairie pourra remplacer ce
     composant sans toucher au reste de l'écran.
   - `MemberSwitchComponent` — rendu dynamique à partir d'une liste de
     membres, pas de profils codés en dur (voir Phase 1).
5. **Remplacer les emojis par un set d'icônes SVG cohérent.** Le prototype
   en utilise une bonne vingtaine (tableau de bord, transactions,
   enveloppes, carte, rapports, réglages, cible, tendance, portefeuille,
   utilisateurs, étiquette, cadenas, banque, bouclier, maison, avion,
   soleil/lune...). Un composant `<app-icon name="wallet" />` avec un
   sprite SVG interne suffit ; substitution progressive, coexistence avec
   les emojis tolérée pendant la migration.
6. **Bac à sable de validation** (`/design-system`, temporaire) pour
   valider chaque composant partagé isolément avant de l'utiliser dans un
   vrai écran.

---

## Phase 1 — Architecture de navigation (5–6 jours)

**État au 9 septembre 2026** — complète, livrée dans
`fina-phase1-navigation.zip` (`ng build` développement + production, et
tests, tous vérifiés) :

**Correctif post-livraison (9 septembre 2026)** : plantage au tout premier
chargement de l'appli — `Cannot read properties of undefined (reading
'data')` dans `AppShell.leafTitle()`. Cause : le titre de page était
calculé directement dans le constructeur, en lisant
`ActivatedRoute.firstChild.snapshot.data` — au moment où le constructeur
s'exécute, le routeur n'a pas encore fini d'attacher l'arbre des routes
enfants (le `<router-outlet>` ne s'active qu'après la construction du
parent). Ni `ng build` ni les tests unitaires en isolation ne pouvaient le
détecter, puisque rien ne construisait `AppShell` via une vraie navigation
imbriquée — trouvé seulement en lançant l'appli pour de vrai. Corrigé
(valeur initiale vide, remplie dès le premier `NavigationEnd`) et couvert
par un nouveau test (`app-shell.spec.ts`) qui reproduit l'erreur exacte
sur l'ancien code avant de confirmer le correctif — 268 tests au total
désormais.

| Élément | Statut |
|---|---|
| `AppShellComponent` (sidebar bureau, barre du bas mobile, en-tête) | ✅ Fait |
| 9 routes (8 destinations + `/carte-de-credit` temporaire) sous un seul `canActivate` | ✅ Fait |
| Sélecteur de membres branché sur le vrai `store.activeOwner` (pas une démo) | ✅ Fait |
| `BudgetStoreService` confirmé `providedIn: 'root'` | ✅ Vérifié dans le code (`budget-store.service.ts` ligne 244) |
| `RoutePlaceholder` générique pour les 8 destinations pas encore construites | ✅ Fait |
| **Découverte imprévue** : le chargement des polices en CDN faisait échouer `ng build` de production | ✅ Corrigé — polices auto-hébergées (`@fontsource`), voir le lisezmoi de la livraison |

**Redondance temporaire assumée** : `/tableau-de-bord` affiche à la fois le
nouvel en-tête d'`AppShell` et l'ancien en-tête de `Dashboard` (mois et
profil en double) — `Dashboard` n'a volontairement pas été touché en
Phase 1 (routing seulement). Disparaît dès l'écran 3 de la vague A
ci-dessous.

**Constat initial :** aucun routing. `app.html` affiche directement
`dashboard.html`, qui empile près de 20 sous-composants. C'est la cause du
défilement interminable.

Architecture retenue — Angular Router avec lazy loading, sur
l'arborescence à 8 destinations :

```
/tableau-de-bord
/mouvements
/budget              (recentré : catégories + enveloppes seulement)
/epargne             (NOUVEAU — objectifs, sortis de /budget)
/investissements     (NOUVEAU — fonctionnalité qui n'existe pas encore)
/comptes             (remplace /carte-de-credit, portée élargie)
/rapports
/parametres          (NOUVEAU en tant que route dédiée)
```

`/carte-de-credit` continue d'exister **temporairement** pendant la vague A
de la Phase 2 (le temps de servir de preuve de concept visuelle), puis est
retirée une fois fusionnée dans `/comptes` en vague B.

- `AppShellComponent` (remplace le contenu actuel de `app.html`) : barre
  latérale bureau avec 7 items + Paramètres en pied de barre ; en mobile,
  barre du bas à 5 emplacements (Accueil, Mouvements, bouton `+` central
  surélevé, Budget, « Plus ») — le bouton « Plus » ouvre une feuille
  listant les 5 destinations restantes (Épargne, Investissements, Comptes,
  Rapports, Paramètres), plutôt que d'essayer de faire tenir 8 icônes dans
  une barre.
- **Sélecteur de membres généralisé** : branché dès maintenant sur
  `store.activeOwner`, contre un tableau statique temporaire (Moi/Madame/
  Global) qui reproduit le comportement actuel — sera rebranché sur la
  vraie table `household_members` une fois que la Phase 2 (vague B) et la
  section 3 de la feuille de route produit sont faites. Le composant ne
  change pas entre les deux ; seule sa source de données change.
- Chaque page assemble les composants `features/` existants sans changer
  leur logique interne (détail phase par phase ci-dessous).

---

## Phase 2, vague A — Écrans à restyler (8–12 jours)

Ces écrans utilisent uniquement des données déjà présentes dans le store
aujourd'hui. Ordre recommandé, du plus isolé au plus structurant :

1. ✅ **Carte de crédit** (`/carte-de-credit`) — **fait le 9 septembre
   2026**, `ng build` (dev + production) et tests (271, +3 nouveaux)
   vérifiés. Aucun calcul touché — seuls `credit-card.html`/`.scss` ont
   changé. Le titre interne (« 💳 Carte de crédit — Moi ») a été retiré,
   redondant avec l'en-tête d'`AppShell`. Bonus à portée large : la classe
   globale `.card-title` (utilisée par 14 écrans) est passée à la
   typographie Fraunces du nouveau design — un petit progrès visuel
   gratuit sur des écrans pas encore migrés.
   La route n'est plus temporaire au sens « pas construite » — elle le
   reste au sens « sera retirée une fois fusionnée dans `/comptes` »
   (vague B).
2. ✅ **Rapports** — livré le 12 septembre 2026. Nouvelle page
   `/rapports` avec résumé annuel, évolution revenus/dépenses/solde,
   répartition des dépenses du mois courant par catégorie et tableau
   détaillé mois par mois. Les calculs existants du store et les composants
   SVG partagés sont réutilisés; aucune logique financière n'est dupliquée.
3. ✅ **Tableau de bord** — fait le 20 septembre 2026 (commit `5faf117`).
   Nouveau bandeau « ledger » (solde net + carte « Patrimoine »),
   panneaux d'alertes et de prévisions (`app-smart-alerts` +
   `app-month-forecast`). L'aperçu de patrimoine du prototype (comptes +
   investissements − dettes) reste bien en `-` tant que la vague B n'est
   pas faite, avec la mention « disponible en vague B » ; solde net +
   enveloppes affichés à la place, comme prévu. Seuls `.html`/`.scss` ont
   changé sur le fond ; le `.ts` n'a bougé que sur des détails cosmétiques
   (import d'icône, wording « les deux profils » → « tous les membres »),
   aucun calcul touché.
   **Mise à jour du 29 septembre 2026** : le bloc « Patrimoine » n'est plus
   un espace réservé. Il affiche la valeur nette calculée par
   `netWorthBreakdown()` (la même fonction que `/comptes`, même périmètre :
   profil actif + comptes partagés), « — » tant qu'aucun compte n'existe.
   **Limite constatée à l'audit du même jour** : le tableau de bord contient
   toujours, empilés, les anciens blocs de la plupart des écrans livrés
   depuis — `ExpenseList`, `IncomeList` (leurs formulaires de saisie n'y sont
   plus, voir « fenêtre Ajouter » plus bas),
   `RecurringExpensesManage`, `SavingsGoalList`, `CreditCard`, `YearlyView`,
   `MonthComparison`, le graphique de dépenses, plus `CategoriesManage` et
   `DataManagement` (des réglages). C'est de la redite avec `/mouvements`,
   `/rapports`, `/epargne` et `/carte-de-credit`, à nettoyer une fois que
   Mouvements permettra de saisir (voir ci-dessous) et que Paramètres
   existera.
4. ✅ **Mouvements** — livré (`Mouvements` dans `features/mouvements/`,
   routé sur `/mouvements`, repéré le 28 septembre en vérifiant l'état
   réel du code plutôt que ce document, qui n'avait pas été mis à jour).
   Combine `ExpenseList` et `IncomeList` dans un seul flux triable et
   filtrable (le seul vrai nouveau bout de logique d'affichage de cette
   vague — un tri fusionné de deux tableaux déjà exposés par le store) ;
   couvert par 7 tests.
   **Limite constatée à l'audit du 29 septembre 2026** : la page est en
   **lecture seule** — aucun formulaire, aucune modification ni suppression.
   Or le bouton « Ajouter » de la barre mobile mène à `/mouvements`. Saisir
   une dépense ou un revenu n'est donc possible que depuis le tableau de
   bord, où vivent encore `ExpenseForm` et `IncomeForm`. Le livrable
   « flux triable et filtrable » est exact ; il ne couvre pas la saisie.
   **Résolu le 29 septembre 2026** par la fenêtre « Ajouter » (voir Phase 3) :
   la saisie est possible depuis toutes les pages.
   **Modification et suppression livrées le 30 septembre 2026** : cliquer (ou
   Entrée / Espace sur) une ligne ouvre une fenêtre « Modifier » (composant
   `EditMovement`, `features/mouvements/edit-movement/`). Seules les vraies
   dépenses et les vrais revenus sont cliquables : les lignes **calculées**
   (contribution à une provision, report, « versement reçu » côté
   destinataire) ne le sont pas, elles reflètent une autre ligne ou un calcul.
   Règles reprises de `ExpenseList` / `IncomeList` et rendues explicites au
   lieu de laisser le store échouer après coup : mois clôturé → lecture seule
   avec la raison ; versement déjà réparti → ni modification ni suppression,
   seulement « annuler la répartition » ; catégorie « Remboursement Carte
   Crédit » verrouillée ; toute suppression en deux temps. Deux défauts de
   l'ancienne édition sont corrigés au passage : un versement dont on change
   l'émetteur pouvait devenir un versement à soi-même (et une dépense qui
   cessait d'en être un gardait son destinataire) ; la suppression d'une
   ligne n'affichait aucune erreur.
   **Écart de comportement voulu** — le revenu : une paie *générée* par un
   modèle récurrent encore actif ne peut plus être supprimée depuis cette
   fenêtre, on propose d'arrêter le modèle. Prouvé par un test du store :
   `syncRecurringIncomes()` recrée à chaque chargement toute paie manquante
   d'un modèle actif, donc la supprimer la fait réapparaître (le commentaire
   de `removeIncome()` disait l'inverse ; corrigé). Pour une paie générée, seul
   le montant est modifiable (changer sa date fausserait le décompte par
   mois) ; pour un revenu ponctuel : montant, type, date et note.
   `ExpenseList` / `IncomeList` du tableau de bord ont toujours l'ancien
   comportement (dont la suppression qui ne tient pas) jusqu'à leur retrait.
5. ✅ **Budget & enveloppes** — livré le 26 septembre 2026. La route
   `/budget` regroupe `CategoryBudgets`, `ProvisionList`/`ProvisionCard`
   et `VersementSplitter`, avec le formulaire, les échéances et les rappels
   nécessaires pour couvrir toutes les provisions. Le résumé lit
   directement `budgetSummary()` et les budgets par catégorie restent
   fondés sur `countedExpensesList()` ; aucun calcul métier n'a changé.
   Les objectifs d'épargne (`SavingsGoalList`/`SavingsGoalCard`) ne sont
   pas dans cette page et restent prévus pour `/epargne` (vague B), afin de
   ne pas mélanger un budget consommé chaque mois avec un objectif qui se
   construit sur plusieurs mois. Validation : `npx tsc --noEmit`,
   `npx ng build` et `npx ng test --watch=false` (317 tests verts).

**Pour chaque écran de cette vague, la même méthode qu'avant :**
réécrire uniquement `.html`/`.scss` avec les nouveaux tokens, ne toucher au
`.ts` que si strictement nécessaire (jamais changer un calcul), relancer
`npx tsc --noEmit` + `ng build` + `ng test --watch=false`, tester
manuellement avec le compte partagé sur chaque membre et la vue globale.

---

## Phase 2, vague B — Nouveaux écrans (11–14 jours)

**Prérequis : le modèle de données généralisé** (`household_members`,
`accounts`) décrit dans `FINA-feuille-de-route-produit.md`, sections 2 et
3, doit exister avant de commencer cette vague — ces trois écrans lisent
et écrivent dans ces nouvelles tables, ce n'est pas du restylage.

**✅ Prérequis rempli le 13 septembre 2026** — la vague B peut démarrer
sur le plan technique, sous réserve du point de rodage ci-dessous.
Historique de la pause : `migration-024-owner-to-member.sql` (généralisation
Owner → Member) a été traitée comme un prérequis strict, dans l'ordre,
avant de continuer `/comptes` — voir le risque correspondant plus bas,
qui s'est concrètement matérialisé.

État du prérequis au 13 septembre 2026 (voir `MODELE.md`, section 6.4) :
- ✅ `migration-024-owner-to-member.sql` écrite et testée localement le 12
  septembre (6 scénarios vérifiés sur Postgres local).
- ✅ Code TypeScript adapté pour `memberId`, avec repli transitoire
  `owner`/`useMemberSchema()`.
- ✅ **Exécutée sur le projet Supabase réel le 13 septembre 2026**, puis
  validée en production : schéma, données existantes (zéro ligne
  orpheline), écritures, et répartition de versement (le chemin le plus
  délicat de la migration) tous testés avec de vraies données — voir
  `MODELE.md` section 6.4.2/6.4.3 pour le détail.
- Point pratique découvert pendant l'exécution, à retenir pour toute
  migration future qui crée une table : le cache de schéma PostgREST ne
  se rafraîchit pas tout seul après une migration — `accounts`,
  `account_balance_snapshots` et `members` renvoyaient des 404 malgré des
  tables bien créées, jusqu'à `notify pgrst, 'reload schema';`.
- ✅ **Couverture de test du nouveau schéma comblée le 15 septembre 2026**
  (voir `MODELE.md` section 9, point 5.3) : écritures simples table par
  table, répartition de versement avec un vrai 3e membre (le chemin le
  plus délicat de la migration), et agrégation (`rolloverFor('global')`,
  `creditCardBalance('global')`, `versementsRecus()`) prouvée sur 3
  membres réels, pas seulement 1. Au passage, une vraie lacune du faux
  client de test a été trouvée et corrigée (il ne simulait que l'ancien
  paramètre RPC `p_sender`, jamais le nouveau `p_sender_member_id`) —
  sans ce correctif, ce chemin restait invérifiable par un test, peu
  importe combien on en aurait écrit. Suite à 285 tests, tous verts.
- ✅ **Rodage terminé — 29 septembre 2026** : aucun bug trouvé en usage
  normal ; `/comptes` a été repris et livré (point 1 ci-dessous). Historique
  de cette étape, à l'origine « une courte période de rodage puis le retrait
  du repli transitoire `owner`/`useMemberSchema()` » (voir `MODELE.md`
  section 9) :
  - ✅ Le drapeau `useMemberSchema()` lui-même (branche à double chemin +
    retry RPC sur l'ancien paramètre) est retiré de
    `budget-store.service.ts`/`supabase-mappers.ts`.
  - **Audit du 25 septembre 2026** : 2 vrais bugs trouvés dans ce
    nettoyage, tous les deux corrigés et couverts par un test de
    régression (309/310 tests ; le seul restant, `provisionDaysUntilNext`,
    était préexistant et sans rapport — **corrigé le 27 septembre**, voir
    Phase 0 ; `MODELE.md` section 9.5.2) :
    - `create_household()`/`join_household()` calculaient un `member_id`
      en interne mais ne le renvoyaient **jamais** — bug de migration-024
      elle-même, pas seulement du TypeScript. `joinHousehold()` stockait
      donc le nom affiché tapé au lieu d'un vrai id (masqué par un filet
      de rattrapage fragile qui compare aussi par `displayName`). Corrigé
      par `migration-026-household-rpc-member-id.sql`, **exécutée sur
      Supabase le 28 septembre 2026** après une vérification complète sur
      Postgres jetable (38 cas, y compris les deux mutations du bug
      historique reproduites pour confirmer que le harnais les détecte —
      voir `supabase/tests/026-household-rpc.test.sql`).
    - Repli « Moi »/« Madame » codé en dur dans
      `activeMembers()`/`memberName()`/`memberColor()` : mort en
      production depuis le 13 septembre, mais masquait un vrai problème
      si `members` était vide pour une mauvaise raison — retiré.
    - Commentaire périmé dans `budget.models.ts` corrigé (référençait
      encore une migration 024 « non exécutée »).
  - ✅ **Consolidation `owner`/`memberId` — faite le 28 septembre 2026**
    (voir `MODELE.md` section 9.5.2 pour le détail complet, y compris un
    reliquat CSS repéré mais volontairement laissé hors périmètre) : les 7
    entités concernées n'ont plus qu'un `memberId: string` ; `Owner` reste
    un type pour désigner un profil, plus un champ dupliqué. 105 erreurs
    de compilation + 13 erreurs de template (invisibles à `tsc`, vues
    seulement par `ng build`) corrigées une par une. Suite complète (662
    tests) verte, `ng build` propre, testé aussi sous 3 fuseaux horaires.

La vague A n'a jamais été concernée par cette pause et peut continuer
normalement (voir « Pour démarrer cette semaine » en fin de document).

1. ✅ **Comptes** (`/comptes`) — **livré le 29 septembre 2026** (705 tests
   verts, `ng build` propre). Valeur nette détaillée, comptes groupés par
   type, ajout avec propriétaire (partagé ou membre), mise à jour du solde
   avec historique, archivage confirmé. Calcul unique dans
   `core/utils/accounts.utils.ts`, réutilisé par le bloc « Patrimoine » du
   tableau de bord (désormais branché). Brouillon initial corrigé : solde
   borné par un champ de formulaire, dette de carte additionnée au lieu
   d'être soustraite, carte lue via des relevés au lieu de
   `creditCardBalance()`, tokens CSS inexistants. **Non fait volontairement** :
   la route `/carte-de-credit` n'est pas retirée (le composant dépend du
   profil actif, pas d'un compte) ; l'import ne relit pas encore les comptes
   (export seulement, voir `MODELE.md` §9 — nécessite une migration SQL sur
   `import_household_data()` et `reset_everything()`).
   *Description d'origine* — vue d'ensemble de la valeur nette et de tous
   les comptes groupés par type. Absorbe et retire l'ancienne route
   `/carte-de-credit` : la logique de `CreditCard` (déjà écrite en vague A)
   devient une simple fenêtre de détail ouverte depuis une ligne de compte,
   plutôt qu'une page à part.
2. **Investissements** (`/investissements`) — **fonctionnalité entièrement
   nouvelle**, aucune donnée existante à réutiliser. Commencer en saisie
   manuelle (valeur du portefeuille, allocation, entrée périodique de la
   performance) ; la synchronisation bancaire/courtage réelle est une
   question de palier C, voir feuille de route produit, section 5.
   **État au 29 septembre 2026** : ⬜ toujours un placeholder. La table
   `investment_allocations` existe (migration-023, RLS) mais il n'y a aucun
   modèle, mapper ni méthode de store côté TypeScript. « Aucune donnée
   existante à réutiliser » n'est **plus exact** : les comptes de type
   `investment` et leurs relevés de solde existent et alimentent déjà la
   valeur nette. Un second modèle de portefeuille compterait le même argent
   deux fois. **Décision à prendre avant de coder** : bâtir cet écran comme
   une vue détaillée des comptes `investment` (allocation, évolution)
   plutôt que comme un modèle parallèle.
3. ✅ **Épargne & objectifs** (`/epargne`) — **livré le 29 septembre 2026**
   (745 tests verts, `ng build` propre). Total épargné, grille d'objectifs
   avec anneau de progression, création (avec propriétaire), ajout et
   suppression de montants, suppression d'un objectif — les deux
   suppressions en deux temps (l'ancienne carte supprimait en un clic). Les
   dates futures sont refusées (cible passée, contribution future), et le
   refus du store pour un mois clôturé est affiché. **Écart au plan** : pas
   de changement de schéma. « Ce mois-ci » et le rythme mensuel moyen
   (3 derniers mois complets) sont *déduits* des contributions
   (`savings.utils.ts`) ; les stocker créerait une 2e source de vérité. Un
   champ « contribution mensuelle *prévue* » resterait possible plus tard
   (migration + formulaire + import/export) si on veut des projections.
   Le composant `SavingsGoalList` du tableau de bord est inchangé (doublon
   partiel à trancher).
   *Description d'origine* — étend le `SavingsGoal` existant
   avec deux champs qui n'existent pas encore : contribution mensuelle et
   évolution récente (« +200,00 $ ce mois-ci ») — un petit changement de
   schéma, pas une nouvelle fonctionnalité.
4. **Paramètres** (`/parametres`) — regroupe les réglages déjà existants
   (probablement épars aujourd'hui) en catégories, **plus** un nouvel écran
   de gestion des membres du foyer (ajouter/retirer un membre, changer son
   rôle) qui, lui, dépend directement de la table `household_members`.
   **État au 29 septembre 2026** : ⬜ toujours un placeholder. Les réglages
   « épars » sont localisés : `CategoriesManage` et `DataManagement` dans
   l'en-tête du tableau de bord, `RecurringExpensesManage` dans son corps.

---

## Phase 3 — Adaptation mobile (5–6 jours)

- Nouveau composant `BottomTabBarComponent`, visible sous `768px` (vraie
  media query, contrairement à la maquette de démo qui simule les deux
  tailles dans un espace fixe) : 5 emplacements (Accueil, Mouvements,
  bouton `+` surélevé, Budget, Plus).
- `MoreSheetComponent` (ou le `ModalComponent` partagé en mode liste) pour
  les 5 destinations qui ne tiennent pas dans la barre.
- Les formulaires (`ExpenseForm`, `IncomeForm`, `ProvisionForm`, et les
  nouveaux formulaires Investissements/Comptes) migrent vers le
  `ModalComponent` partagé — feuille sur mobile, fenêtre centrée sur
  bureau.
- Détails tactiles : zones d'au moins 44px, `inputmode="decimal"` sur les
  montants, `padding-bottom: env(safe-area-inset-bottom)` sous la barre du
  bas.

**État au 29 septembre 2026** : ✅ la barre du bas à 5 emplacements et la
feuille « Plus » (un `Modal`) existent, livrées avec `AppShell` en Phase 1.

✅ **Fenêtre « Ajouter » livrée le 29 septembre 2026** (décision : un `Modal`
plutôt qu'un formulaire dans `/mouvements`, comme dans le prototype). Le
bouton `+` de la barre du bas est désormais un vrai bouton (présent sur toutes
les pages, sur mobile). Sur bureau, un bouton « Ajouter » est ajouté à la
barre du haut, **seulement sur le tableau de bord et Mouvements** (drapeau
`data.showAdd` dans `app.routes.ts`, comme dans le prototype où seul
Mouvements l'a) ; masqué sous 768px, où le `+` le remplace. La même fenêtre
s'ouvre dans tous les cas, sans changer de route. *Correction du même jour,
après retour d'usage* : une première version l'affichait sur toutes les
pages, et le bouton de thème flottant (`app.html`, fixé à 16px du bord,
40px de large) le recouvrait ; la barre du haut réserve maintenant 40px à
droite pour lui. Nouveau composant `AddTransaction`
(`features/mouvements/add-transaction/`) : un sélecteur Dépense / Revenu
au-dessus des formulaires existants, aucune logique de saisie dupliquée.
`ExpenseForm` et `IncomeForm` sont devenus des contenus de fenêtre (ni carte
ni titre propres, bouton `app-button`, confirmation par toast, sortie
`saved` qui ferme la fenêtre) et **ont été retirés du tableau de bord** —
sinon deux champs auraient partagé le même `id` dans la page. Le composant
`Chip` expose désormais son état (`aria-pressed`). Le champ « Compte » du
prototype n'a pas d'équivalent : aucune transaction n'est liée à un compte
(`MODELE.md` §5.1).

⬜ **Reste** : `ProvisionForm` (dans `/budget`) et les formulaires de
`RecurringExpensesManage` restent en ligne ; la disposition des champs des deux
formulaires est encore celle d'origine (rangées qui se replient) et n'a pas
été vérifiée sur un vrai téléphone. `/comptes`, `/epargne`
et le bac à sable utilisaient déjà `Modal`.

---

## Phase 4 — Polish et accessibilité (3–5 jours)

- Contraste des couleurs (vert forêt `#1F6F54` et rouge brique `#B3432B`
  sur blanc passent confortablement WCAG AA ; à revérifier avec les
  valeurs finales, y compris le violet ou toute couleur de membre ajoutée
  plus tard).
- Focus clavier visible sur tous les éléments interactifs, y compris les
  nouveaux composants (anneaux, graphiques, lignes de compte).
- `prefers-reduced-motion` pour les transitions de modales/feuilles.
- Vérifier chaque nouvel écran (Comptes, Investissements, Épargne) dans les
  deux thèmes, pas seulement les écrans de la vague A.

**État au 29 septembre 2026** : ⬜ pas commencée. `prefers-reduced-motion`
n'apparaît que dans `modal.scss`, et `:focus-visible` dans très peu de
feuilles de style. Les écrans `/comptes` et `/epargne` définissent leurs
propres états de focus, mais rien n'a été vérifié sur les deux thèmes au
navigateur.

---

## Phase 5 — Tests et déploiement (4–6 jours)

- Le pipeline existant (`.github/workflows/tests.yml`, `deploy.yml`) ne
  change pas d'infrastructure.
- Travailler sur une branche `refonte-design`, déployée sur une URL de
  prévisualisation, fusionnée sur `main` écran par écran — la vague A peut
  être fusionnée et utilisée au quotidien pendant que la vague B est encore
  en chantier.
- Tests de fumée légers (Playwright, réintroduit uniquement pour ça) sur
  les 8 routes et sur la persistance du membre/mois sélectionné en
  changeant de page. Le reste (plus de 750 tests Vitest) continue de protéger la
  logique métier sans changement.

**État au 29 septembre 2026** : ⬜ pas commencée, et l'infrastructure décrite
ci-dessus ne correspond pas au zip audité. `.github/workflows/` n'y contient
que `deploy.yml` (déclenché sur `main` : `npm ci` puis `ng build`, **sans
lancer les tests**) ; `tests.yml`, cité plus haut, en est absent — à vérifier
dans le dépôt. Playwright n'est pas installé. La branche `refonte-design` ne
peut pas être vérifiée depuis un zip.

---

## Audit du 29 septembre 2026 — état réel et backlog

Méthode : ce plan et `MODELE.md` relus en entier, chaque affirmation
vérifiée contre le code (`src/`, `supabase/`, `.github/`), puis `tsc
--noEmit`, `ng build` et la suite de tests (764 verts après corrections,
aussi sous `Australia/Sydney` et `Pacific/Kiritimati`).

| Phase | État réel |
|---|---|
| 0 — Fondations | ✅ Tokens, polices, 10 composants partagés, icônes. ⬜ Emojis restants (126, voir Phase 0) ; ⬜ `/design-system` à retirer |
| 1 — Navigation | ✅ 9 routes, `AppShell`, membres branchés sur le store |
| 2A — Vague A | ✅ Carte de crédit, Rapports, Budget. ✅ Mouvements (saisie par la fenêtre « Ajouter », modification et suppression par la fenêtre « Modifier »). ⚠️ Tableau de bord (nouveau bandeau, mais l'ancienne pile reste) |
| 2B — Vague B | ✅ Comptes, Épargne. ⬜ Investissements et Paramètres : placeholders |
| 3 — Mobile | ✅ Barre du bas et fenêtre « Ajouter » (dépense/revenu). ⚠️ `ProvisionForm` et dépenses récurrentes restent en ligne ; rien vérifié sur un vrai téléphone |
| 4 — Accessibilité | ⬜ Pas commencée |
| 5 — Tests et déploiement | ⬜ Pas commencée ; CI sans tests dans le zip audité |

**Défaut corrigé pendant l'audit** : plusieurs formulaires initialisaient le
propriétaire à `'moi'`. Dans un foyer à identifiants UUID, en vue Global, la
dépense partait avec un membre inexistant. Corrigé partout par
`defaultMemberId()` ; le libellé « Madame » du répartiteur de versement aussi.
Détail et preuve dans `MODELE.md` section 10.3.

### Backlog ordonné

1. ✅ **Saisie sur mobile — fait le 29 septembre 2026.** Décision : un `Modal`
   ouvert par le bouton `+` (et par un bouton « Ajouter » sur bureau). Voir
   Phase 3.
2. ✅ **Mouvements : modifier et supprimer — fait le 30 septembre 2026.** Voir
   Vague A, point 4. Préalable au nettoyage du tableau de bord (point 5).
3. **Investissements** comme vue détaillée des comptes `investment` (voir
   Vague B, point 2) — valider ce périmètre avant d'écrire du code.
4. **Paramètres** : catégories, sauvegarde, dépenses récurrentes, **revenus
   récurrents** (y compris l'arrêt, aujourd'hui dans `IncomeList`), membres.
5. **Nettoyer le tableau de bord** une fois 2 et 4 faits : retirer les blocs
   redondants avec Mouvements, Rapports, Épargne, Carte de crédit et
   Paramètres.
5. **Import des comptes** : migration SQL sur `import_household_data()` et
   `reset_everything()`, testée sur un Postgres jetable (voir `MODELE.md`
   10.4). Tant que ce n'est pas fait, l'export est une copie de secours
   lisible, pas une restauration.
6. **Hygiène** : retirer `/design-system` de la production ; supprimer les
   doublons de la racine (`budget-store.service.spec.ts` et
   `fake-supabase-client.ts` y existent en copies périmées, différentes de
   celles de `src/`) et les documents en double ; brancher les tests dans le
   pipeline avant déploiement ; décider du sort du rappel de mois non
   clôturé (`MODELE.md` section 7, non planifié).
7. **Phases 4 et 5**, une fois les écrans stabilisés.

---

## Risques et comment les limiter

| Risque | Mitigation |
|---|---|
| Régression de logique métier pendant la refonte visuelle | Geler les fichiers `.ts` de logique en vague A ; ne changer que `.html`/`.scss` ; relancer la suite de tests après chaque écran |
| Construire Comptes/Investissements/Paramètres avant que le schéma généralisé existe | Respecter l'ordre vague A → vague B. **S'est matérialisé le 12 septembre 2026** (brouillon `/comptes` commencé avant la généralisation), **résolu le 13 septembre 2026** : migration Owner → Member écrite, testée, exécutée en production et validée avant toute reprise de `/comptes` |
| Perte d'état du store en changeant de route | Vérifier `providedIn:'root'` sur `BudgetStoreService` avant la Phase 1 ; tester la navigation manuellement |
| Trop d'emojis à remplacer d'un coup | Composant `<app-icon>` centralisé ; migration progressive, coexistence tolérée |
| Envie de tout refaire en même temps (nouvelles fonctionnalités) | Portée de chaque vague strictement limitée à ce qui est listé ici ; toute autre idée va dans un backlog séparé |
| Fatigue sur un projet solo à temps partiel, portée plus grande qu'avant | Vague A seule est un point d'arrêt valide et livrable ; vague B peut attendre plusieurs mois sans que rien ne casse |

---

## Pour démarrer cette semaine

1. ✅ `MODELE.md` — fait.
2. ✅ Phase 0 (fondations visuelles) — complète. Le test
   `provisionDaysUntilNext` (attendu `181`) est corrigé pour de vrai depuis
   le 27 septembre : calcul en UTC, indépendant du fuseau (voir Phase 0).
3. ✅ Phase 1 (architecture de navigation) — complète.
4. ✅ Vague A, écran 1 (Carte de crédit) — complète.
5. ✅ Migration Owner → Member écrite et testée localement
   (`migration-024-owner-to-member.sql`, voir vague B et `MODELE.md`
   section 6.4).
6. ✅ Bascule applicative Owner → Member préparée avec compatibilité
   transitoire; type-check, build et tests validés, dont la couverture
   d'intégration du chemin `useMemberSchema() === true`.
7. ✅ Vague A, écran 2 (Rapports) — livré et validé avec le type-check, le
   build et la suite de tests verte.
8. ✅ **Migration exécutée sur Supabase réel et validée en production le
   13 septembre 2026** — schéma, données existantes, écritures et
   répartition de versement tous vérifiés avec de vraies données, aucune
   régression (voir `MODELE.md` section 6.4.2/6.4.3). La vague B n'est
   donc plus en pause sur le plan technique.
9. ✅ **Couverture de test du schéma Member complétée le 15 septembre
   2026** — répartition de versement avec un vrai 3e membre (le chemin le
   plus délicat), agrégation prouvée sur 3 membres, et un vrai bug du faux
   client de test trouvé et corrigé au passage (voir vague B et `MODELE.md`
   section 9). Suite à 285 tests, tous verts.
10. ✅ **Gestion des membres pour Paramètres — 16 septembre 2026**
    (`migration-025-member-management.sql`, testée avec un rôle Postgres à
    privilèges limités). Renommer/changer la couleur d'un membre marchent
    déjà par écriture directe (policies `FOR ALL` de migration-024) —
    seule la désactivation avait besoin d'une vraie RPC (garde contre un
    foyer sans aucun membre actif), écrite et testée dans les 4 cas. Voir
    `MODELE.md` section 9, point 5.4.
11. ✅ **Vague A — complète** : les 5 écrans (Carte de crédit, Rapports,
    Tableau de bord, Mouvements, Budget & enveloppes) sont tous livrés.
    Point 4 ci-dessus n'était simplement pas coché dans ce document alors
    que le code, lui, était déjà fait.
12. ✅ **Migration 026 exécutée sur Supabase réel — 28 septembre 2026**,
    vérifiée au préalable sur un Postgres jetable (38 vérifications, voir
    `MODELE.md` section 9.5.2 et `supabase/tests/`).
13. ✅ **Consolidation `owner`/`memberId` — 28 septembre 2026.** Le champ
    dupliqué sur les 7 entités concernées n'existe plus ; `Owner` reste un
    type, jamais un champ en double. Détail complet, y compris un
    reliquat CSS repéré mais volontairement laissé hors périmètre, dans
    `MODELE.md` section 9.5.2.
14. ✅ **Rodage terminé, `/comptes` livré — 29 septembre 2026** (Vague B,
    point 1). Le brouillon en pause a été réécrit plutôt que repris tel quel.
15. ✅ **Bloc « Patrimoine » branché et export des comptes — 29 septembre
    2026.** Valeur nette unique (`accounts.utils.ts`) ; les comptes et
    relevés sont dans le JSON exporté (l'import ne les relit pas encore).
16. ✅ **Épargne & objectifs livré — 29 septembre 2026** (Vague B, point 3),
    sans changement de schéma.
17. ✅ **Audit du code réel contre ce plan et `MODELE.md` — 29 septembre
    2026**, et correction des identifiants de membre codés en dur (`'moi'`).
    Voir la section « Audit du 29 septembre 2026 » ci-dessous et
    `MODELE.md` section 10.
18. ✅ **Fenêtre « Ajouter » — 29 septembre 2026** (Phase 3) : le bouton `+`
    ouvre un `Modal` (Dépense / Revenu) depuis toute page ; les formulaires en
    ligne du tableau de bord sont retirés.
19. ✅ **Mouvements : modification et suppression — 30 septembre 2026**
    (Vague A, point 4). Le cycle de saisie est complet depuis `/mouvements`.
20. **Prochaine étape réelle** : Paramètres (il porte les réglages et
    l'arrêt des revenus récurrents), puis le nettoyage du tableau de bord ;
    Investissements reste indépendant et attend la validation de son
    périmètre (Vague B, point 2).
