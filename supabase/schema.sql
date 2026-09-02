-- Schéma Supabase pour le Traqueur de Budget.
-- À exécuter une fois dans : Supabase > SQL Editor > New query > Run.
--
-- Compte partagé : Moi et Madame se connectent avec le même identifiant,
-- donc les règles RLS ci-dessous exigent simplement "utilisateur connecté",
-- sans distinction de propriétaire au niveau des permissions (le champ
-- "owner" sert juste à filtrer/afficher, comme dans l'ancienne app).

create extension if not exists "uuid-ossp";

-- Modèles de dépenses récurrentes ("Dépenses attendues ce mois-ci").
-- Option B du document de roadmap : on suggère, l'utilisateur confirme —
-- pas de création automatique, pour éviter les doublons avec une saisie
-- manuelle. Créée avant "expenses" car cette dernière la référence.
create table if not exists recurring_expenses (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  amount numeric(12,2) not null,
  category text not null,
  owner text not null check (owner in ('moi','madame')),
  day_of_month integer not null check (day_of_month between 1 and 31),
  cc boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Dépenses
create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  amount numeric(12,2) not null,
  category text not null,
  date date not null,
  owner text not null check (owner in ('moi','madame')),
  cc boolean not null default false,
  recurring_source_id uuid references recurring_expenses(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Revenus
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  color text not null,
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists recurring_incomes (
  id uuid primary key default uuid_generate_v4(),
  amount numeric(12,2) not null,
  type text not null,
  owner text not null check (owner in ('moi','madame')),
  note text not null default '',
  interval text not null default 'monthly'
    check (interval in ('monthly', 'weekly', 'biweekly', 'semimonthly')),
  day_of_month integer not null check (day_of_month between 1 and 31),
  second_day_of_month integer
    check (second_day_of_month is null or second_day_of_month between 1 and 31),
  start_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists incomes (
  id uuid primary key default uuid_generate_v4(),
  amount numeric(12,2) not null,
  type text not null,
  date date not null,
  owner text not null check (owner in ('moi','madame')),
  note text not null default '',
  recurring boolean not null default false,
  recurring_interval text check (recurring_interval in ('once','monthly','weekly','biweekly','semimonthly')),
  recurring_start_month text, -- "YYYY-MM"
  recurring_source_id uuid references recurring_incomes(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Provisions
create table if not exists provisions (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  amount numeric(12,2) not null,
  every_n integer not null,
  interval_unit text not null check (interval_unit in ('months','days')),
  start_ym text,          -- "YYYY-MM", si interval_unit = 'months'
  start_date date,        -- si interval_unit = 'days'
  category text not null,
  owner text not null check (owner in ('moi','madame')),
  auto_recalibrate boolean not null default true,
  allocation_percent numeric(5,2) not null default 0, -- part (%) utilisée pour préremplir la répartition d'un versement
  rolling_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Ajouts manuels au fonds d'une provision ("+$ Ajouter au fonds")
create table if not exists provision_adjustments (
  id uuid primary key default uuid_generate_v4(),
  provision_id uuid not null references provisions(id) on delete cascade,
  amount numeric(12,2) not null,
  date date not null,
  note text not null default '',
  versement_expense_id uuid references expenses(id) on delete cascade
);

-- Objectifs d'épargne ("Objectifs d'épargne") : accumulation libre vers une
-- cible, sans échéance récurrente ni facture à absorber (contrairement aux
-- provisions).
create table if not exists savings_goals (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  target_amount numeric(12,2) not null,
  target_date date, -- optionnelle, indicative
  owner text not null check (owner in ('moi','madame')),
  created_at timestamptz not null default now()
);

-- Ajouts ponctuels à un objectif d'épargne.
create table if not exists savings_goal_contributions (
  id uuid primary key default uuid_generate_v4(),
  savings_goal_id uuid not null references savings_goals(id) on delete cascade,
  amount numeric(12,2) not null,
  date date not null,
  note text not null default ''
);

-- Budget manuel par profil et par mois : { owner: { "YYYY-MM": montant } }
create table if not exists budgets (
  owner text not null check (owner in ('moi','madame')),
  ym text not null, -- "YYYY-MM"
  amount numeric(12,2) not null,
  primary key (owner, ym)
);

-- Budget par catégorie, profil et mois ("Budget par catégorie").
-- Un mois sans valeur explicite hérite du montant du mois précédent le plus
-- récent qui en a une (géré côté application, pas en SQL).
create table if not exists category_budgets (
  owner text not null check (owner in ('moi','madame')),
  ym text not null, -- "YYYY-MM"
  category text not null,
  amount numeric(12,2) not null,
  primary key (owner, ym, category)
);

-- Report de solde (clôture du mois) par profil et par mois.
-- Le report "Global" n'est jamais stocké : toujours recalculé comme
-- moi[ym] + madame[ym] côté application, comme dans l'ancienne app.
create table if not exists rollovers (
  owner text not null check (owner in ('moi','madame')),
  ym text not null, -- "YYYY-MM"
  amount numeric(12,2) not null,
  primary key (owner, ym)
);

-- Clôture de mois : verrou global (pas par profil). Un mois présent ici
-- bloque toute opération datée dans ce mois côté application (dépenses,
-- revenus ponctuels, ajustements de provisions, contributions d'épargne,
-- budgets par catégorie, report). Voir migration-007-closed-months.sql.
create table if not exists closed_months (
  ym text primary key, -- "YYYY-MM"
  closed_at timestamptz not null default now()
);

-- Row Level Security : accès réservé aux utilisateurs connectés
-- (compte partagé unique pour Moi + Madame).
alter table expenses enable row level security;
alter table recurring_expenses enable row level security;
alter table incomes enable row level security;
alter table recurring_incomes enable row level security;
alter table categories enable row level security;
alter table provisions enable row level security;
alter table provision_adjustments enable row level security;
alter table savings_goals enable row level security;
alter table savings_goal_contributions enable row level security;
alter table budgets enable row level security;
alter table category_budgets enable row level security;
alter table rollovers enable row level security;
alter table closed_months enable row level security;

create policy "authenticated_all_expenses" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_recurring_expenses" on recurring_expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_incomes" on incomes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_recurring_incomes" on recurring_incomes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_categories" on categories
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_provisions" on provisions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_provision_adjustments" on provision_adjustments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_savings_goals" on savings_goals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_savings_goal_contributions" on savings_goal_contributions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_budgets" on budgets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_category_budgets" on category_budgets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_rollovers" on rollovers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_closed_months" on closed_months
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Catégories par défaut (installation neuve) — mêmes noms/couleurs que
-- l'ancienne liste codée en dur, pour un rendu identique dès le départ.
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
