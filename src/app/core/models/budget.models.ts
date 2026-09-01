// Modèles de données — reflètent exactement la structure de l'ancienne
// application (fichier unique HTML/localStorage), pour une migration 1:1
// sans perte ni changement de comportement.

export type Owner = 'moi' | 'madame';
export type OwnerOrGlobal = Owner | 'global';

export type RecurringInterval =
  | 'once'
  | 'monthly'
  | 'weekly'
  | 'biweekly'
  | 'semimonthly';

export interface Expense {
  id: string;
  amount: number;
  category: string;
  date: string; // "YYYY-MM-DD"
  owner: Owner;
  cc: boolean; // chargé à la carte de crédit
  recurringSourceId?: string | null; // dépense récurrente confirmée à l'origine de cette ligne
}

// Modèle de dépense récurrente ("Dépenses attendues ce mois-ci").
// Option B du document de roadmap : suggestion à confirmer, jamais générée
// automatiquement (pour éviter les doublons avec une saisie manuelle).
//
// Fréquence : 'monthly' (comportement d'origine, une échéance par mois à
// dayOfMonth) | 'weekly' | 'biweekly' (calées sur startDate, peuvent
// produire 0, 1, 2 ou 3 échéances selon le mois) | 'semimonthly' (deux
// échéances fixes par mois, dayOfMonth + secondDayOfMonth).
export type RecurringExpenseInterval = 'monthly' | 'weekly' | 'biweekly' | 'semimonthly';

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  category: string;
  owner: Owner;
  interval: RecurringExpenseInterval;
  dayOfMonth: number; // 1-31 — utilisé si interval 'monthly' ou 'semimonthly' (1er jour)
  secondDayOfMonth?: number | null; // 1-31 — utilisé seulement si interval 'semimonthly'
  startDate?: string | null; // "YYYY-MM-DD" — date d'ancrage, utilisée si interval 'weekly'/'biweekly'
  cc: boolean;
  active: boolean;
}

export interface Income {
  id: string;
  amount: number;
  type: string;
  date: string; // "YYYY-MM-DD"
  owner: Owner;
  note: string;
  // Conservés pour affichage/rétrocompatibilité (badge de fréquence dans
  // la liste) — la logique de calcul ne s'appuie plus dessus, voir
  // RecurringIncome ci-dessous. `recurring: true` signifie ici "cette
  // ligne est une occurrence générée par un modèle récurrent".
  recurring: boolean;
  recurringInterval: RecurringInterval;
  recurringStartMonth: string; // "YYYY-MM"
  // Modèle récurrent à l'origine de cette occurrence (voir RecurringIncome) —
  // même principe que Expense.recurringSourceId.
  recurringSourceId?: string | null;
}

// Modèle de revenu récurrent ("paie"). Remplace l'ancienne approche où un
// seul Income "récurrent" était compté en moyenne mensuelle dans chaque
// mois (voir income.utils.ts, ancien incomeForMonth) : désormais chaque
// paie est une vraie ligne Income datée, générée automatiquement (voir
// syncRecurringIncomes() dans budget-store.service.ts), liée au modèle via
// recurringSourceId — exactement comme RecurringExpense/Expense.
//
// Avantages : le solde/historique d'un mois ne change plus jamais après
// coup, et supprimer le modèle n'efface pas les paies déjà générées —
// seules les prochaines s'arrêtent.
export type IncomeRecurringInterval = 'monthly' | 'weekly' | 'biweekly' | 'semimonthly';

export interface RecurringIncome {
  id: string;
  amount: number; // montant d'UNE occurrence (pas une moyenne)
  type: string;
  owner: Owner;
  note: string;
  interval: IncomeRecurringInterval;
  dayOfMonth: number; // 1-31 — utilisé si interval 'monthly' ou 'semimonthly' (1er jour)
  secondDayOfMonth?: number | null; // 1-31 — utilisé seulement si interval 'semimonthly'
  startDate: string; // "YYYY-MM-DD" — ancrage ; utilisé pour 'weekly'/'biweekly', et borne de départ pour tous
  active: boolean;
}

export interface ProvisionAdjustment {
  id: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
  note: string;
  // Renseigné quand l'ajout vient de "🤝 Répartir un versement" : l'id de
  // la dépense "Versement" d'origine, pour pouvoir annuler toute la
  // répartition en un clic.
  versementExpenseId?: string;
}

export type ProvisionIntervalUnit = 'months' | 'days';

export interface Provision {
  id: string;
  name: string;
  amount: number; // montant cible pour un cycle complet
  everyN: number; // nombre de mois ou de jours entre deux échéances
  intervalUnit: ProvisionIntervalUnit;
  startYM: string; // "YYYY-MM" — utilisé si intervalUnit === "months"
  startDate: string; // "YYYY-MM-DD" — utilisé si intervalUnit === "days"
  category: string;
  owner: Owner;
  autoRecalibrate: boolean;
  // Part (%) de cette provision utilisée pour préremplir sa portion dans
  // l'outil "Répartir un versement" (0 = pas de préremplissage automatique).
  allocationPercent: number;
  rollingCount: number;
  // Montant que l'utilisateur s'engage à ajouter lui-même chaque mois,
  // séparément de tout versement reçu (ex. sa propre moitié dans un
  // partage 50/50 avec le conjoint). null/0 = pas de rappel configuré.
  // Contrairement au versement (de l'argent qui transite réellement d'un
  // profil à l'autre), c'est juste un pense-bête : rien n'est ajouté
  // automatiquement, l'utilisateur confirme lui-même chaque mois via la
  // carte "Mes contributions du mois".
  monthlyReminder: number | null;
  adjustments: ProvisionAdjustment[];
}

// Paiement fait pour rembourser la carte de crédit — modèle indépendant
// des provisions (pas de lien avec Provision/ProvisionAdjustment). Le
// solde dû sur la carte se calcule comme :
//   (somme des dépenses réelles marquées "carte") - (somme de ces paiements)
// voir creditCardBalance() dans budget-store.service.ts.
export interface CreditCardPayment {
  id: string;
  owner: Owner;
  amount: number;
  date: string; // "YYYY-MM-DD"
  note: string;
}

// { owner: { "YYYY-MM": montant } }
export type MonthlyAmountMap = Record<Owner, Record<string, number>>;

// { owner: { "YYYY-MM": { catégorie: montant } } }
export type CategoryBudgetMap = Record<Owner, Record<string, Record<string, number>>>;

export interface SavingsContribution {
  id: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
  note: string;
}

// Objectif d'épargne (roadmap #10) : à la différence d'une provision, pas
// de facture ni d'échéance récurrente à absorber — juste une accumulation
// libre vers une cible, avec une date cible optionnelle (indicative, pas
// contraignante).
export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null; // "YYYY-MM-DD", optionnelle
  owner: Owner;
  contributions: SavingsContribution[];
}

export interface BudgetState {
  expenses: Expense[];
  incomes: Income[];
  provisions: Provision[];
  savingsGoals: SavingsGoal[];
  budgets: MonthlyAmountMap;
  rollovers: MonthlyAmountMap;
}
