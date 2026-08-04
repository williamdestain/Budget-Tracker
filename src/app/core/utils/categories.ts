// Catégories et palette de couleurs — portées telles quelles depuis
// l'ancienne application, pour un comportement et un rendu identiques.

export const CATEGORIES: string[] = [
  'Loyer',
  'Garderie',
  'REEE',
  'Assurance Auto',
  'Assurance Maison',
  'Assurance Pret',
  'Assurance Invalidité',
  'Assurance Maladie',
  'Assurance Maladie enfants',
  'Internet',
  'Téléphone',
  'Pret voiture',
  'REER W',
  'Epargne W',
  'Celi W',
  'Electricité',
  'Courses',
  'Sport',
  'Essence',
  'Santé/médecine',
  'Autre Dépense',
  'Taxe fonciere/municipale',
  'Taxe scolaire',
  'Transport',
  'Nespresso',
  'REER E',
  'Epargne E',
  'Epg QC--Bonifié',
  'Exceptionnel',
  'Revenu',
  'Remboursement Carte Crédit',
  'Versement',
];

// Palette harmonieuse (angle d'or pour bien répartir les teintes).
const COLORS: string[] = CATEGORIES.map(
  (_, i) =>
    `hsl(${Math.round((i * 137.508) % 360)}, ${62 + (i % 3) * 6}%, ${56 + (i % 2) * 5}%)`,
);

export const COLOR_MAP: Record<string, string> = {};
CATEGORIES.forEach((c, i) => (COLOR_MAP[c] = COLORS[i]));

export const OWNERS: Record<string, string> = {
  moi: 'Moi',
  madame: 'Madame',
  global: 'Global (foyer)',
};
export const OWNERS_SHORT: Record<string, string> = {
  moi: 'Moi',
  madame: 'Mme',
};
