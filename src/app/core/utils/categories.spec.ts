import { describe, it, expect } from 'vitest';
import { nextCategoryColor, sortedAlpha } from './categories';

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

// Les catégories sont désormais gérées dynamiquement (voir
// BudgetStore.categories()) ; nextCategoryColor() ne fait plus que
// calculer la couleur d'UNE catégorie au moment de sa création — voir
// migration-016-categories.sql pour les couleurs figées des catégories
// d'origine.
describe('nextCategoryColor', () => {
  it('reproduit exactement la formule (angle d’or) de l’ancienne liste codée en dur, pour ne rien changer visuellement', () => {
    // Sentinelle : la 1ère catégorie ('Loyer' à l'origine) était
    // 'hsl(0, 62%, 56%)', la 2e ('Garderie') 'hsl(138, 68%, 61%)'.
    expect(nextCategoryColor(0)).toBe('hsl(0, 62%, 56%)');
    expect(nextCategoryColor(1)).toBe('hsl(138, 68%, 61%)');
  });

  it('retourne une couleur différente pour des index différents (bonne répartition des teintes)', () => {
    const colors = new Set([0, 1, 2, 3, 4].map(nextCategoryColor));
    expect(colors.size).toBe(5);
  });
});
