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
export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  category: string;
  owner: Owner;
  dayOfMonth: number; // 1-31, ajusté au dernier jour du mois si besoin
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
  recurring: boolean;
  recurringInterval: RecurringInterval;
  recurringStartMonth: string; // "YYYY-MM"
}

export interface ProvisionAdjustment {
  id: string;
  amount: number;
  date: string; // "YYYY-MM-DD"
  note: string;
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
  rollingCount: number;
  adjustments: ProvisionAdjustment[];
}

// { owner: { "YYYY-MM": montant } }
export type MonthlyAmountMap = Record<Owner, Record<string, number>>;

// { owner: { "YYYY-MM": { catégorie: montant } } }
export type CategoryBudgetMap = Record<Owner, Record<string, Record<string, number>>>;

export interface BudgetState {
  expenses: Expense[];
  incomes: Income[];
  provisions: Provision[];
  budgets: MonthlyAmountMap;
  rollovers: MonthlyAmountMap;
}
