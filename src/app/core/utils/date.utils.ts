// Fonctions de dates — portées telles quelles depuis l'ancienne application
// (fichier unique HTML) pour un comportement identique.

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const MOIS_COURT = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
  'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc',
];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MOIS[m - 1]} ${y}`;
}

export function monthShortLabel(ym: string): string {
  const [, m] = ym.split('-').map(Number);
  return MOIS_COURT[m - 1];
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MOIS[m - 1].slice(0, 3)} ${y}`;
}

export function ymOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function isoOfDate(d: Date): string {
  return (
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-` +
    String(d.getDate()).padStart(2, '0')
  );
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Mois suivant/précédent au format "YYYY-MM".
export function nextYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function prevYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function monthsBetween(startYM: string, endYM: string): number {
  const [sy, sm] = startYM.split('-').map(Number);
  const [ey, em] = endYM.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return ymOf(d);
}

// Nombre de jours CALENDAIRES entre deux dates "YYYY-MM-DD" (négatif si
// endISO précède startISO).
//
// Calculé en UTC exprès : la différence de deux `Date` en heure locale
// (parseISODate) vaut 1 heure de moins quand un passage à l'heure d'été
// tombe entre les deux dates — ex. 1er janvier → 1er juillet donne 180,96 j
// à Montréal mais exactement 181 j en UTC. Un `Math.floor` sur ce résultat
// donnait donc 180 ou 181 selon le fuseau de la machine (bug de
// `provisionDaysUntilNext`). En UTC il n'y a aucun changement d'heure : le
// résultat est un entier exact, identique partout.
export function daysBetween(startISO: string, endISO: string): number {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / MS_PER_DAY;
}
