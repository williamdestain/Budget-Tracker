-- Rend les catégories gérables (ajout/renommage/archivage) depuis l'app,
-- au lieu d'une liste codée en dur dans core/utils/categories.ts.
--
-- Important : la couleur de chaque catégorie est FIGÉE ici, calculée
-- exactement comme l'ancien système (angle d'or selon la position dans la
-- liste d'origine) — donc AUCUN changement visuel pour les catégories
-- existantes après cette migration. Les nouvelles catégories créées via
-- l'app recevront une couleur assignée au moment de leur création (jamais
-- recalculée depuis la liste), pour que renommer/archiver une catégorie ne
-- fasse jamais changer la couleur des autres.
--
-- Les colonnes `category` (texte libre) de expenses/provisions/
-- category_budgets/recurring_expenses ne sont PAS modifiées par cette
-- migration : elles continuent de fonctionner exactement comme avant,
-- cette table ne fait que piloter les menus déroulants + couleurs.
--
-- À exécuter une fois dans Supabase > SQL Editor.

create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  color text not null,
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;

create policy "authenticated_all_categories" on categories
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into categories (name, color, sort_order) values
  ('Loyer', 'hsl(0, 62%, 56%)', 0),
  ('Garderie', 'hsl(138, 68%, 61%)', 1),
  ('REEE', 'hsl(275, 74%, 56%)', 2),
  ('Assurance Auto', 'hsl(53, 62%, 61%)', 3),
  ('Assurance Maison', 'hsl(190, 68%, 56%)', 4),
  ('Assurance Pret', 'hsl(328, 74%, 61%)', 5),
  ('Assurance Invalidité', 'hsl(105, 62%, 56%)', 6),
  ('Assurance Maladie', 'hsl(243, 68%, 61%)', 7),
  ('Assurance Maladie enfants', 'hsl(20, 74%, 56%)', 8),
  ('Internet', 'hsl(158, 62%, 61%)', 9),
  ('Téléphone', 'hsl(295, 68%, 56%)', 10),
  ('Pret voiture', 'hsl(73, 74%, 61%)', 11),
  ('REER W', 'hsl(210, 62%, 56%)', 12),
  ('Epargne W', 'hsl(348, 68%, 61%)', 13),
  ('Celi W', 'hsl(125, 74%, 56%)', 14),
  ('Electricité', 'hsl(263, 62%, 61%)', 15),
  ('Courses', 'hsl(40, 68%, 56%)', 16),
  ('Sport', 'hsl(178, 74%, 61%)', 17),
  ('Essence', 'hsl(315, 62%, 56%)', 18),
  ('Santé/médecine', 'hsl(93, 68%, 61%)', 19),
  ('Autre Dépense', 'hsl(230, 74%, 56%)', 20),
  ('Taxe fonciere/municipale', 'hsl(8, 62%, 61%)', 21),
  ('Taxe scolaire', 'hsl(145, 68%, 56%)', 22),
  ('Transport', 'hsl(283, 74%, 61%)', 23),
  ('Nespresso', 'hsl(60, 62%, 56%)', 24),
  ('REER E', 'hsl(198, 68%, 61%)', 25),
  ('Epargne E', 'hsl(335, 74%, 56%)', 26),
  ('Epg QC--Bonifié', 'hsl(113, 62%, 61%)', 27),
  ('Exceptionnel', 'hsl(250, 68%, 56%)', 28),
  ('Revenu', 'hsl(28, 74%, 61%)', 29),
  ('Remboursement Carte Crédit', 'hsl(165, 62%, 56%)', 30),
  ('Versement', 'hsl(303, 68%, 61%)', 31)
on conflict (name) do nothing;
