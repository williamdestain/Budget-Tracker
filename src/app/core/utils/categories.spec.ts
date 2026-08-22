import { describe, it, expect } from 'vitest';
import { CATEGORIES, COLOR_MAP, sortedAlpha } from './categories';

describe('sortedAlpha', () => {
  it('trie une liste alphabétiquement (locale fr)', () => {
    expect(sortedAlpha(['Courses', 'Assurance Auto', 'Internet', 'Électricité'])).toEqual([
      'Assurance Auto',
      'Courses',
      'Électricité',
      'Internet',
    ]);
  });

  it("ne modifie pas le tableau d'entrée (retourne une copie)", () => {
    const input = ['Courses', 'Assurance Auto'];
    const result = sortedAlpha(input);
    expect(input).toEqual(['Courses', 'Assurance Auto']); // inchangé
    expect(result).not.toBe(input); // nouvelle référence
  });

  it('gère une liste vide', () => {
    expect(sortedAlpha([])).toEqual([]);
  });
});

describe('CATEGORIES / COLOR_MAP', () => {
  it("l'ordre canonique de CATEGORIES reste inchangé (ne pas trier la source)", () => {
    // Sentinelle volontaire : CATEGORIES ne doit JAMAIS être trié
    // directement, car COLOR_MAP assigne une couleur par INDEX dans ce
    // tableau — le trier changerait la couleur de chaque catégorie
    // existante dans toute l'app. Ce test casse intentionnellement si
    // quelqu'un trie CATEGORIES par erreur un jour.
    expect(CATEGORIES[0]).toBe('Loyer');
    expect(CATEGORIES[CATEGORIES.length - 1]).toBe('Versement');
  });

  it('COLOR_MAP assigne bien une couleur à chaque catégorie', () => {
    CATEGORIES.forEach((c) => {
      expect(COLOR_MAP[c]).toBeTruthy();
    });
  });
});
