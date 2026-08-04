const nf = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
});

export function fmt(n: number | null | undefined): string {
  return nf.format(n || 0);
}
