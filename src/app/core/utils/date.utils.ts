// Fonctions de dates — portées telles quelles depuis l'ancienne application
// (fichier unique HTML) pour un comportement identique.

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MOIS[m - 1]} ${y}`;
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

export function daysBetween(startISO: string, endISO: string): number {
  const ms = parseISODate(endISO).getTime() - parseISODate(startISO).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
