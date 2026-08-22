import { describe, it, expect } from 'vitest';
import { fmt } from './currency.utils';

// Note : le séparateur de milliers du format fr-CA est une espace insécable
// (U+00A0), pas une espace normale — on utilise des regex plutôt que des
// égalités de chaîne strictes pour ne pas dépendre d'un caractère invisible
// précis, potentiellement différent selon la version d'ICU du runtime.
describe('currency.utils / fmt', () => {
  it('formate un montant avec 2 décimales et le symbole $', () => {
    expect(fmt(42)).toMatch(/^42,00\s\$$/);
  });

  it('conserve les décimales non entières', () => {
    expect(fmt(42.5)).toMatch(/^42,50\s\$$/);
  });

  it('arrondit à 2 décimales', () => {
    expect(fmt(42.567)).toMatch(/^42,57\s\$$/);
  });

  it('groupe les milliers', () => {
    const s = fmt(1234.5);
    expect(s).toMatch(/^1.234,50\s\$$/);
  });

  it('gère les montants négatifs', () => {
    expect(fmt(-42.1)).toMatch(/^-42,10\s\$$/);
  });

  it('traite null comme 0', () => {
    expect(fmt(null)).toMatch(/^0,00\s\$$/);
  });

  it('traite undefined comme 0', () => {
    expect(fmt(undefined)).toMatch(/^0,00\s\$$/);
  });

  it('traite 0 explicite comme 0 (pas de bug "falsy")', () => {
    expect(fmt(0)).toMatch(/^0,00\s\$$/);
  });
});
