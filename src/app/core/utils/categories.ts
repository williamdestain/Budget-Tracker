// Les catégories sont désormais gérées dynamiquement (ajout/renommage/
// archivage) via la table `categories` et BudgetStore.categories() — voir
// migration-016-categories.sql. Ce fichier ne garde que ce qui reste
// statique : les profils (Moi/Madame) et le tri alphabétique.
//
// Couleur d'une NOUVELLE catégorie : même formule (angle d'or) que
// l'ancienne liste codée en dur, appliquée à l'index de création plutôt
// qu'à une position dans un tableau — la couleur est ensuite figée en
// base pour toujours, elle ne bouge plus jamais après coup (ajouter ou
// archiver une AUTRE catégorie ne doit jamais changer sa couleur).
export function nextCategoryColor(existingCount: number): string {
  const i = existingCount;
  return `hsl(${Math.round((i * 137.508) % 360)}, ${62 + (i % 3) * 6}%, ${56 + (i % 2) * 5}%)`;
}

export const OWNERS: Record<string, string> = {
  moi: 'Moi',
  madame: 'Madame',
  global: 'Global (foyer)',
};
export const OWNERS_SHORT: Record<string, string> = {
  moi: 'Moi',
  madame: 'Mme',
};

// Tri alphabétique (fr) pour l'affichage dans les listes déroulantes.
export function sortedAlpha(list: string[]): string[] {
  return [...list].sort((a, b) => a.localeCompare(b, 'fr'));
}
