import { Expense, Owner, OwnerOrGlobal, Provision, ProvisionAdjustment } from '../models/budget.models';
import { fmt } from './currency.utils';
import { fmtDate, monthLabel, monthsBetween, addMonths, daysBetween, isoOfDate, parseISODate, ymOf, prevYM } from './date.utils';

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

// Construit une date "YYYY-MM-DD" pour un jour donné dans un mois, en
// ramenant au dernier jour du mois si celui-ci en a moins (ex. jour 31
// dans un mois de 30 jours, ou le 29/30/31 février).
export function clampDayToMonth(ym: string, day: number): string {
  const lastDay = Number(lastDayOfMonthYM(ym).slice(-2));
  const clamped = Math.min(Math.max(day, 1), lastDay);
  return `${ym}-${String(clamped).padStart(2, '0')}`;
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

// Bug corrigé : cette fonction ne bornait auparavant que par le HAUT (date
// <= fin du mois consulté), sans jamais exclure les ajouts antérieurs au
// début du CYCLE EN COURS. Résultat concret rapporté par un utilisateur :
// après avoir payé une provision à recalage automatique, celle-ci
// redémarre un nouveau cycle (voir syncProvisionsFromExpense) — mais sa
// cagnotte affichait encore l'argent ajouté pendant l'ANCIEN cycle, comme
// si une "autre provision" venait d'apparaître déjà partiellement
// remplie. provisionSpent() (juste en dessous) borne déjà correctement
// par le bas avec provisionStart(p) — cette fonction doit faire pareil.
export function provisionAdjustmentsUpTo(p: Provision, currentYM: string): ProvisionAdjustment[] {
  const start = provisionStart(p);
  // Même référence que provisionReferenceDate (plus bas dans ce fichier) :
  // le dernier jour du mois consulté s'il est déjà passé, sinon la vraie
  // date du jour — pour qu'une simple PRÉVISUALISATION d'un mois futur ne
  // fasse jamais sortir des bornes de calcul l'argent déjà mis de côté
  // (voir le commentaire détaillé sur provisionReferenceDate ci-dessous).
  const end = provisionReferenceDate(currentYM);
  // Cas particulier : l'ancre représente encore une échéance FUTURE (pas
  // encore atteinte par rapport au mois affiché). Ça veut dire qu'aucun
  // paiement réel n'a encore recalé cette provision — on est dans la
  // toute première période d'accumulation, AVANT la première échéance.
  // Il n'y a donc pas d'"ancien cycle" à exclure : tout ce qui a déjà été
  // ajouté doit compter, même si sa date est antérieure à l'ancre (ex.
  // provision créée le 10 juillet avec 1re échéance au 10 septembre —
  // l'argent ajouté en juillet/août doit bien compter pour le 10
  // septembre, pas être ignoré comme si c'était un "vieux cycle").
  // Dès que l'ancre est atteinte ou dépassée (config d'origine passée, ou
  // date d'un vrai paiement après un recalage), on revient à la borne
  // stricte habituelle.
  if (start > end) {
    return (p.adjustments || []).filter((a) => a.date <= end);
  }
  return (p.adjustments || []).filter((a) => a.date >= start && a.date <= end);
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

// Cagnotte actuelle = ajouts manuels − paiements réels. Aucun prélèvement
// automatique n'est fait sur le budget : tout vient des ajouts manuels
// (bouton "+$") jusqu'à ce que le montant cible soit atteint.
// Peut être négative (facture payée avant d'avoir assez économisé).
export function provisionPot(p: Provision, currentYM: string, expenses: Expense[]): number {
  return provisionAdjustmentTotal(p, currentYM) - provisionSpent(p, currentYM, expenses);
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

// Bug rapporté par un utilisateur (capture d'écran) : la carte affichait
// à la fois "Échéance ce mois — X $ restant à payer" (basé sur
// isHitMonth(), qui détecte correctement l'échéance DANS le mois/la
// période affichée) ET "Prochaine échéance : [date d'un cycle plus tard]"
// (basé sur provisionNextHit(), qui saute TOUJOURS par-dessus l'échéance
// en cours par conception — voir son test dédié). Les deux venaient de la
// même provision mais parlaient de deux échéances différentes, l'une
// contredisant l'autre sur la même carte. Le même saut faussait aussi
// provisionDaysUntilNext()/provisionDueAlert() : une échéance de ce mois
// restée impayée ne déclenchait jamais l'alerte "en retard", puisque le
// nombre de jours était calculé par rapport au cycle SUIVANT (donc
// toujours positif et grand), pas par rapport à l'échéance impayée
// elle-même.
//
// provisionUpcomingHit() corrige ça : si le mois/la période affichée est
// elle-même une échéance (isHitMonth), on renvoie CETTE date-là (pas la
// suivante). provisionNextHit() reste inchangée et disponible séparément
// pour un usage de planification pure ("après celle-ci, la suivante sera
// quand ?"), mais provisionUpcomingHit() est ce qu'il faut utiliser
// partout où on affiche/alerte sur "la prochaine échéance à surveiller".
export function provisionUpcomingHit(p: Provision, currentYM: string): string {
  if (!isHitMonth(p, currentYM)) return provisionNextHit(p, currentYM);
  if (provisionUnit(p) !== 'days') return currentYM;
  // Même logique de grille que isHitMonth (jours) : retrouve le point
  // précis DANS ce mois plutôt que de renvoyer tout le mois.
  const start = provisionStart(p);
  const monthStart = currentYM + '-01';
  let hitDate = start;
  while (hitDate < monthStart) {
    hitDate = addDays(hitDate, p.everyN);
  }
  return hitDate;
}

export function formatProvisionUpcomingHit(p: Provision, currentYM: string): string {
  const next = provisionUpcomingHit(p, currentYM);
  return provisionUnit(p) === 'days' ? fmtDate(next) : monthLabel(next);
}

export function formatProvisionStart(p: Provision): string {
  return provisionUnit(p) === 'days' ? fmtDate(provisionStart(p)) : monthLabel(p.startYM);
}

export function provisionMetaLine(p: Provision, expenses: Expense[]): string {
  const target = effectiveProvisionAmount(p, expenses);
  if (provisionUnit(p) === 'days') {
    return `${fmt(target)} à économiser tous les ~${p.everyN} j`;
  }
  return `${fmt(target)} à économiser tous les ${p.everyN} mois`;
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

// Référence "aujourd'hui" utilisée pour les alertes/cagnotte : le dernier
// jour du mois consulté SEULEMENT si ce mois est entièrement dans le
// passé (bilan figé d'un mois déjà terminé) ; sinon la vraie date du jour
// — jamais une date qui n'est pas encore arrivée.
//
// Bug corrigé (capture d'écran utilisateur) : l'ancienne règle utilisait
// le dernier jour du mois dès que le mois consulté n'était PAS le mois
// réel en cours — y compris pour un mois FUTUR simplement prévisualisé
// (ex. cliquer "mois suivant" fin août pour jeter un œil à septembre).
// Résultat : l'app croyait septembre déjà terminé le 30, rendant "en
// retard de 20 jours" une échéance du 10 qui n'était pourtant pas encore
// arrivée, ET faisait sortir des bornes de calcul l'argent déjà mis de
// côté (cagnotte retombée à 0$) — alors qu'aucun paiement réel n'avait eu
// lieu. Un mois futur n'a, par définition, encore rien d'écoulé : la
// référence doit y rester "aujourd'hui", exactement comme pour le mois en
// cours.
function provisionReferenceDate(currentYM: string): string {
  const now = new Date();
  const today = isoOfDate(now);
  return currentYM < ymOf(now) ? lastDayOfMonthYM(currentYM) : today;
}

function provisionNextHitAsDate(p: Provision, currentYM: string): string {
  const hit = provisionUpcomingHit(p, currentYM);
  return provisionUnit(p) === 'days' ? hit : hit + '-01';
}

export function provisionDaysUntilNext(p: Provision, currentYM: string): number {
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

// Catégories couvertes par une provision, pour un profil donné — utilisé
// pour exclure les dépenses réelles déjà représentées par la cagnotte
// d'une provision (countedExpenses ci-dessous).
//
// Bug corrigé (audit BUG-008) : la clé était auparavant la catégorie
// SEULE, sans le profil. En vue Global, si Moi a une provision
// "Assurance" et que Madame a une VRAIE dépense "Assurance" (sans
// provision de son côté), cette dépense de Madame était à tort exclue du
// budget Global — traitée comme "couverte" par une provision qui ne lui
// appartient pourtant pas. Résultat concret : le budget Global
// sous-comptait les dépenses, gonflant artificiellement le solde
// disponible. La clé est maintenant "owner|category", jamais la
// catégorie seule.
export function provisionedCategories(
  provisions: Provision[],
  owner: OwnerOrGlobal,
): Set<string> {
  const relevant = owner === 'global' ? provisions : provisions.filter((p) => p.owner === owner);
  return new Set(relevant.map((p) => `${p.owner}|${p.category}`));
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
  provisionId?: string;
  adjustmentId?: string;
  provisionName?: string;
  note?: string;
}

// Dépenses "comptées" pour le budget/solde : les dépenses réelles des
// catégories NON provisionnées, plus les ajouts manuels ("+$") faits ce
// mois-ci sur chaque provision active. Remplace les paiements réels des
// catégories provisionnées pour éviter le double comptage — la provision
// absorbe déjà ces paiements dans sa cagnotte (voir provisionPot). Aucun
// prélèvement automatique n'est ajouté : seuls les ajouts manuels comptent.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Bug rapporté par un utilisateur : payer une vraie facture (ex.
// Électricité en juillet) alors qu'AUCUN argent n'a jamais été mis dans
// la provision correspondante faisait purement et simplement disparaître
// cette dépense du budget/du graphique — traitée comme "déjà couverte"
// simplement parce qu'une provision existe dans cette catégorie, sans
// vérifier si elle contient réellement de quoi la couvrir. À juste titre
// jugé incorrect : de l'argent est vraiment sorti de la poche, sans
// aucune épargne préalable pour l'absorber.
//
// Corrigé : chaque dépense réelle d'une catégorie provisionnée est
// maintenant comparée à la cagnotte RÉELLEMENT disponible au moment où
// elle survient (pas juste "une provision existe"). Seule la partie
// couverte par de l'épargne déjà accumulée est exclue du budget ; toute
// partie non couverte (cagnotte insuffisante ou à 0) compte comme une
// vraie dépense de ce mois — exactement le même "Déficit de X $ (payé
// avant d'avoir assez économisé)" déjà affiché sur la carte de la
// provision, mais qui ne se répercutait auparavant nulle part dans le
// calcul du budget lui-même.
export function countedExpenses(
  expenses: Expense[],
  provisions: Provision[],
  owner: OwnerOrGlobal,
  currentYM: string,
): CountedExpense[] {
  const visible = expenses
    .filter((e) => owner === 'global' || e.owner === owner)
    .filter((e) => e.date.startsWith(currentYM));
  const relevant = owner === 'global' ? provisions : provisions.filter((p) => p.owner === owner);
  const provisionedKeys = new Set(relevant.map((p) => `${p.owner}|${p.category}`));

  const counted: CountedExpense[] = [];

  // 1) Dépenses de catégories NON provisionnées : comptent intégralement,
  // comme avant — rien ne change ici.
  visible.forEach((e) => {
    if (owner === 'global' && e.category === 'Versement') return;
    if (e.category === 'Revenu') return;
    // Bug rapporté par un utilisateur : un remboursement de carte de
    // crédit était compté une deuxième fois contre le budget — une
    // première fois au moment de l'achat (la dépense réelle, chargée à
    // la carte), une deuxième fois au moment de payer la facture de
    // carte (catégorie "Remboursement Carte Crédit"). Le remboursement
    // règle une dépense déjà comptée à l'achat ; il ne doit pas être
    // compté une seconde fois, exactement comme un versement entre
    // profils n'est pas une vraie dépense du foyer.
    if (e.category === 'Remboursement Carte Crédit') return;
    if (provisionedKeys.has(`${e.owner}|${e.category}`)) return; // traitées ci-dessous
    counted.push({ id: e.id, amount: e.amount, category: e.category, date: e.date, owner: e.owner, cc: e.cc });
  });

  // 2) Pour chaque provision : ne déduire que la part de ses dépenses
  // réelles du mois réellement couverte par la cagnotte disponible, dans
  // l'ordre chronologique (une cagnotte qui s'épuise ne peut pas couvrir
  // deux fois le même dollar).
  relevant.forEach((p) => {
    let runningPot = provisionPot(p, prevYM(currentYM), expenses);

    visible
      .filter((e) => e.category === p.category && e.owner === p.owner && e.amount > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .forEach((e) => {
        const covered = Math.min(e.amount, Math.max(runningPot, 0));
        const uncovered = round2(e.amount - covered);
        runningPot -= e.amount;
        if (uncovered > 0) {
          counted.push({
            id: e.id,
            amount: uncovered,
            category: e.category,
            date: e.date,
            owner: e.owner,
            cc: e.cc,
          });
        }
      });

    // Ajustements manuels (contributions à la cagnotte) du mois — bornés
    // par le cycle en cours (audit BUG-009), inchangé.
    provisionAdjustmentsUpTo(p, currentYM)
      .filter((a) => a.date.startsWith(currentYM))
      .forEach((a) => {
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
          provisionId: p.id,
          adjustmentId: a.id,
          provisionName: p.name,
          note: a.note,
        });
      });
  });

  return counted;
}
