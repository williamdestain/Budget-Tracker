import { Expense, Owner, OwnerOrGlobal, Provision, ProvisionAdjustment } from '../models/budget.models';
import { fmt } from './currency.utils';
import { fmtDate, monthLabel, monthsBetween, addMonths, daysBetween, isoOfDate, parseISODate, ymOf } from './date.utils';

// ============================================================
// Provisions : calcul de la cagnotte, statut, prochain paiement
// ============================================================
// Une provision modélise une dépense irrégulière lissée sur l'année :
// - amount        : montant dû à chaque échéance
// - everyN        : intervalle (mois ou jours selon intervalUnit)
// - intervalUnit  : "months" (défaut) | "days"
// - startYM       : début du cycle mensuel (YYYY-MM)
// - startDate     : date de référence pour les intervalles en jours (YYYY-MM-DD)
// - category      : catégorie de la dépense réelle qu'elle couvre
// - owner         : profil propriétaire (moi/madame)

export function provisionUnit(p: Provision): 'months' | 'days' {
  return p.intervalUnit === 'days' ? 'days' : 'months';
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return isoOfDate(d);
}

export function lastDayOfMonthYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return isoOfDate(new Date(y, m, 0));
}

export function provisionStart(p: Provision): string {
  if (provisionUnit(p) === 'days') {
    return p.startDate || p.startYM + '-01';
  }
  return p.startYM + '-01';
}

export function provisionStartYM(p: Provision): string {
  return provisionStart(p).slice(0, 7);
}

function daysInMonthOverlap(p: Provision, ym: string): number {
  const start = provisionStart(p);
  const monthStart = ym + '-01';
  const monthEnd = lastDayOfMonthYM(ym);
  if (start > monthEnd) return 0;
  const effectiveStart = start > monthStart ? start : monthStart;
  return daysBetween(effectiveStart, monthEnd);
}

function sumCategory(
  expenses: Expense[],
  category: string,
  owner: OwnerOrGlobal,
  fromYM: string | null,
  toYM: string | null,
): number {
  return expenses
    .filter((e) => {
      if (e.category !== category) return false;
      if (owner !== 'global' && e.owner !== owner) return false;
      const ym = e.date.slice(0, 7);
      return (!fromYM || ym >= fromYM) && (!toYM || ym <= toYM);
    })
    .reduce((s, e) => s + e.amount, 0);
}

function sumCategoryFromDate(
  expenses: Expense[],
  category: string,
  owner: OwnerOrGlobal,
  fromDate: string,
  toYM: string | null,
): number {
  return expenses
    .filter((e) => {
      if (e.category !== category) return false;
      if (owner !== 'global' && e.owner !== owner) return false;
      if (e.date < fromDate) return false;
      if (toYM && e.date.slice(0, 7) > toYM) return false;
      return true;
    })
    .reduce((s, e) => s + e.amount, 0);
}

export function recentCategoryExpenses(
  expenses: Expense[],
  category: string,
  owner: Owner,
  limit: number,
): Expense[] {
  return expenses
    .filter(
      (e) =>
        e.category === category &&
        e.owner === owner &&
        e.amount > 0 &&
        e.category !== 'Revenu' &&
        e.category !== 'Versement',
    )
    .sort(
      (a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)),
    )
    .slice(0, limit);
}

// Montant cible pour la prochaine échéance (moyenne mobile des N dernières
// factures si rollingCount >= 1, sinon le montant fixe défini sur la provision).
export function effectiveProvisionAmount(p: Provision, expenses: Expense[]): number {
  const count = p.rollingCount || 0;
  if (count < 1) return p.amount;
  const recent = recentCategoryExpenses(expenses, p.category, p.owner, count);
  if (recent.length === 0) return p.amount;
  return recent.reduce((s, e) => s + e.amount, 0) / recent.length;
}

export function provisionAccrualRate(p: Provision, expenses: Expense[]): number {
  return effectiveProvisionAmount(p, expenses) / p.everyN;
}

// Réserve comptabilisée pour un mois donné.
export function provisionReserveForMonth(p: Provision, ym: string, expenses: Expense[]): number {
  if (provisionUnit(p) === 'days') {
    return provisionAccrualRate(p, expenses) * daysInMonthOverlap(p, ym);
  }
  if (monthsBetween(p.startYM, ym) <= 0) return 0;
  return provisionAccrualRate(p, expenses);
}

export function provisionAdjustmentsUpTo(p: Provision, currentYM: string): ProvisionAdjustment[] {
  const end = lastDayOfMonthYM(currentYM);
  return (p.adjustments || []).filter((a) => a.date <= end);
}

export function provisionAdjustmentsForMonth(p: Provision, ym: string): ProvisionAdjustment[] {
  return (p.adjustments || []).filter((a) => a.date.startsWith(ym));
}

export function provisionAdjustmentTotal(p: Provision, currentYM: string): number {
  return provisionAdjustmentsUpTo(p, currentYM).reduce((s, a) => s + a.amount, 0);
}

// Somme des paiements réels déjà effectués pour cette provision, depuis le
// début du cycle jusqu'à la fin du mois consulté.
export function provisionSpent(p: Provision, currentYM: string, expenses: Expense[]): number {
  if (provisionUnit(p) === 'days') {
    return sumCategoryFromDate(expenses, p.category, p.owner, provisionStart(p), currentYM);
  }
  return sumCategory(expenses, p.category, p.owner, p.startYM, currentYM);
}

// Cagnotte actuelle = réserves accumulées + ajouts manuels − paiements réels.
// Peut être négative (sous-provisionnée).
export function provisionPot(p: Provision, currentYM: string, expenses: Expense[]): number {
  let reserved = 0;
  if (provisionUnit(p) === 'days') {
    const start = provisionStart(p);
    const end = lastDayOfMonthYM(currentYM);
    if (start <= end) {
      reserved = provisionAccrualRate(p, expenses) * daysBetween(start, end);
    }
  } else {
    const monthsElapsed = monthsBetween(p.startYM, currentYM);
    reserved = provisionAccrualRate(p, expenses) * Math.max(monthsElapsed, 0);
  }
  return reserved + provisionAdjustmentTotal(p, currentYM) - provisionSpent(p, currentYM, expenses);
}

// Prochaine échéance (YYYY-MM-DD si jours, YYYY-MM si mois).
export function provisionNextHit(p: Provision, currentYM: string): string {
  if (provisionUnit(p) === 'days') {
    const start = provisionStart(p);
    const end = lastDayOfMonthYM(currentYM);
    if (start > end) return start;
    const totalDays = daysBetween(start, end);
    const nextIdx = Math.floor((totalDays - 1) / p.everyN) + 1;
    return addDays(start, nextIdx * p.everyN);
  }
  const total = monthsBetween(p.startYM, currentYM);
  if (total <= 0) return p.startYM;
  const nextIdx = Math.floor((total - 1) / p.everyN) + 1;
  return addMonths(p.startYM, nextIdx * p.everyN);
}

export function formatProvisionNextHit(p: Provision, currentYM: string): string {
  const next = provisionNextHit(p, currentYM);
  return provisionUnit(p) === 'days' ? fmtDate(next) : monthLabel(next);
}

export function formatProvisionStart(p: Provision): string {
  return provisionUnit(p) === 'days' ? fmtDate(provisionStart(p)) : monthLabel(p.startYM);
}

export function provisionMetaLine(p: Provision, expenses: Expense[]): string {
  const target = effectiveProvisionAmount(p, expenses);
  if (provisionUnit(p) === 'days') {
    return `${fmt(provisionAccrualRate(p, expenses))}/jour · ${fmt(target)} par prélèvement (~${p.everyN} j)`;
  }
  return `${fmt(provisionAccrualRate(p, expenses))}/mois · ${fmt(target)} par prélèvement (${p.everyN} mois)`;
}

export function provisionRollingLabel(p: Provision, expenses: Expense[]): string {
  const count = p.rollingCount || 0;
  if (count < 1) return '';
  const recent = recentCategoryExpenses(expenses, p.category, p.owner, count);
  if (recent.length === 0) return '';
  return ` · moy. ${recent.length} facture${recent.length > 1 ? 's' : ''}`;
}

// Vrai si le mois consulté contient une échéance.
export function isHitMonth(p: Provision, currentYM: string): boolean {
  if (provisionUnit(p) === 'days') {
    const start = provisionStart(p);
    const monthStart = currentYM + '-01';
    const monthEnd = lastDayOfMonthYM(currentYM);
    if (monthEnd < start) return false;
    let hitDate = start;
    while (hitDate < monthStart) {
      hitDate = addDays(hitDate, p.everyN);
    }
    return hitDate >= monthStart && hitDate <= monthEnd;
  }
  const total = monthsBetween(p.startYM, currentYM);
  if (total <= 0) return false;
  return (total - 1) % p.everyN === 0;
}

export interface ProvisionDueAlert {
  type: 'overdue' | 'soon';
  message: string;
}

// Référence "aujourd'hui" utilisée pour les alertes : la date réelle si le
// mois consulté est le mois en cours, sinon le dernier jour de ce mois.
function provisionReferenceDate(currentYM: string): string {
  const today = isoOfDate(new Date());
  if (currentYM === ymOf(new Date())) return today;
  return lastDayOfMonthYM(currentYM);
}

function provisionNextHitAsDate(p: Provision, currentYM: string): string {
  const hit = provisionNextHit(p, currentYM);
  return provisionUnit(p) === 'days' ? hit : hit + '-01';
}

function provisionDaysUntilNext(p: Provision, currentYM: string): number {
  const ref = provisionReferenceDate(currentYM);
  const next = provisionNextHitAsDate(p, currentYM);
  return Math.floor(
    (parseISODate(next).getTime() - parseISODate(ref).getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function provisionDueAlert(
  p: Provision,
  currentYM: string,
  expenses: Expense[],
): ProvisionDueAlert | null {
  const target = effectiveProvisionAmount(p, expenses);
  const pot = provisionPot(p, currentYM, expenses);
  if (pot >= target) return null;
  const daysLeft = provisionDaysUntilNext(p, currentYM);
  const missing = target - pot;
  if (daysLeft < 0) {
    return { type: 'overdue', message: `🔴 Prélèvement en retard — il manque ${fmt(missing)}` };
  }
  if (daysLeft <= 7) {
    const when = daysLeft === 0 ? "aujourd'hui" : daysLeft === 1 ? 'demain' : `dans ${daysLeft} jours`;
    return { type: 'soon', message: `⏰ Prélèvement ${when} — il manque ${fmt(missing)}` };
  }
  return null;
}

// Catégories couvertes par une provision, pour un profil donné.
export function provisionedCategories(provisions: Provision[], owner: OwnerOrGlobal): Set<string> {
  const relevant = owner === 'global' ? provisions : provisions.filter((p) => p.owner === owner);
  return new Set(relevant.map((p) => p.category));
}

export interface CountedExpense {
  id: string;
  amount: number;
  category: string;
  date: string;
  owner: Owner;
  cc: boolean;
  provision?: boolean;
  provisionAdjustment?: boolean;
  provisionName?: string;
  note?: string;
}

// Dépenses "comptées" pour le budget/solde : les dépenses réelles des
// catégories NON provisionnées, plus une réserve synthétique par provision
// active pour le mois consulté (et ses ajustements manuels du mois).
// Remplace les paiements réels des catégories provisionnées pour éviter le
// double comptage — la provision absorbe déjà ces paiements dans sa cagnotte.
export function countedExpenses(
  expenses: Expense[],
  provisions: Provision[],
  owner: OwnerOrGlobal,
  currentYM: string,
): CountedExpense[] {
  const visible = expenses
    .filter((e) => owner === 'global' || e.owner === owner)
    .filter((e) => e.date.startsWith(currentYM));
  const covered = provisionedCategories(provisions, owner);

  const counted: CountedExpense[] = visible.filter((e) => {
    if (owner === 'global' && e.category === 'Versement') return false;
    if (e.category === 'Revenu') return false;
    if (covered.has(e.category)) return false;
    return true;
  });

  const relevant = owner === 'global' ? provisions : provisions.filter((p) => p.owner === owner);
  relevant.forEach((p) => {
    const amount = provisionReserveForMonth(p, currentYM, expenses);
    if (amount > 0) {
      counted.push({
        id: 'prov-' + p.id + '-' + currentYM,
        amount,
        category: p.category,
        date: currentYM + '-01',
        owner: p.owner,
        cc: false,
        provision: true,
      });
    }
    provisionAdjustmentsForMonth(p, currentYM).forEach((a) => {
      if (!(a.amount > 0)) return;
      counted.push({
        id: 'prov-adjust-' + p.id + '-' + a.id,
        amount: a.amount,
        category: p.category,
        date: a.date,
        owner: p.owner,
        cc: false,
        provision: true,
        provisionAdjustment: true,
        provisionName: p.name,
        note: a.note,
      });
    });
  });

  return counted;
}
