import { Account, AccountBalanceSnapshot, AccountType, OwnerOrGlobal } from '../models/budget.models';

// Définition canonique de la valeur nette (MODELE.md, section 5.4) : un seul
// endroit, jamais recalculée différemment ailleurs (page Comptes, tableau de
// bord). Fonctions pures — pas de store, pas de signal — pour rester
// testables sans TestBed.

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Comptes bancaires',
  credit: 'Cartes de crédit',
  investment: 'Investissements',
  other: 'Autres comptes',
};

export const ACCOUNT_TYPE_ORDER: AccountType[] = ['bank', 'credit', 'investment', 'other'];

// Solde de la carte de crédit pour un membre (null = compte partagé → tout le
// foyer). Fourni par l'appelant (en pratique `store.creditCardBalance`), ce qui
// garde ce fichier indépendant du store. Convention du code : une DETTE
// POSITIVE (dépensé − payé), pas un nombre négatif.
export type CreditBalanceFn = (memberId: string | null) => number;

export interface NetWorthBreakdown {
  bank: number;
  investment: number;
  other: number;
  /** Dette de carte, positive (voir CreditBalanceFn). Soustraite dans `net`. */
  credit: number;
  net: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Snapshots d'un compte, du plus récent au plus ancien, jusqu'à `asOf`
// inclus. Un snapshot daté du futur est ignoré (saisi d'avance ou faute de
// frappe) : le solde affiché est celui « à aujourd'hui ou avant » (§5.2).
export function snapshotsUpTo(
  snapshots: AccountBalanceSnapshot[],
  accountId: string,
  asOf: string,
): AccountBalanceSnapshot[] {
  return snapshots
    .filter((s) => s.accountId === accountId && s.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Solde d'un compte à la date `asOf`. `null` = aucun solde connu (à ne pas
// confondre avec 0). Un compte 'credit' n'a pas de snapshot : son solde est
// la façade de creditCardBalance() (§5.1), sans aucun nouveau calcul.
export function accountBalance(
  account: Account,
  snapshots: AccountBalanceSnapshot[],
  asOf: string,
  creditBalance: CreditBalanceFn,
): number | null {
  if (account.type === 'credit') return creditBalance(account.memberId);
  return snapshotsUpTo(snapshots, account.id, asOf)[0]?.balance ?? null;
}

// Comptes visibles pour le profil actif : un compte partagé (memberId null)
// est visible de tous (§5.1) ; la vue « global » voit tout.
export function visibleAccounts(accounts: Account[], owner: OwnerOrGlobal): Account[] {
  if (owner === 'global') return accounts;
  return accounts.filter((a) => a.memberId === null || a.memberId === owner);
}

// Deux comptes 'credit' actifs dont les périmètres se recouvrent (un partagé
// + un personnel, ou deux du même membre) afficheraient chacun la même dette
// — et la compteraient deux fois dans la valeur nette. Vrai s'il y a conflit.
export function creditScopeConflict(accounts: Account[], memberId: string | null): boolean {
  return accounts.some(
    (a) =>
      a.type === 'credit' &&
      !a.archived &&
      (a.memberId === null || memberId === null || a.memberId === memberId),
  );
}

// Dette de carte comptée UNE fois par périmètre, même si des données
// existantes contiennent déjà un recouvrement : un compte partagé couvre
// tout le foyer (donc absorbe les autres) ; sinon, un membre = une fois.
function creditDebt(accounts: Account[], creditBalance: CreditBalanceFn): number {
  const credit = accounts.filter((a) => a.type === 'credit' && !a.archived);
  if (credit.length === 0) return 0;
  if (credit.some((a) => a.memberId === null)) return creditBalance(null);
  const members = [...new Set(credit.map((a) => a.memberId))];
  return members.reduce((sum, id) => sum + creditBalance(id), 0);
}

export function netWorthBreakdown(
  accounts: Account[],
  snapshots: AccountBalanceSnapshot[],
  asOf: string,
  creditBalance: CreditBalanceFn,
): NetWorthBreakdown {
  const active = accounts.filter((a) => !a.archived);
  const sumOf = (type: AccountType): number =>
    active
      .filter((a) => a.type === type)
      .reduce((sum, a) => sum + (accountBalance(a, snapshots, asOf, creditBalance) ?? 0), 0);

  const bank = round2(sumOf('bank'));
  const investment = round2(sumOf('investment'));
  const other = round2(sumOf('other'));
  const credit = round2(creditDebt(active, creditBalance));
  return { bank, investment, other, credit, net: round2(bank + investment + other - credit) };
}
