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

-- Row Level Security : accès réservé aux utilisateurs connectés
-- (compte partagé unique pour Moi + Madame).
alter table expenses enable row level security;
alter table recurring_expenses enable row level security;
alter table incomes enable row level security;
alter table provisions enable row level security;
alter table provision_adjustments enable row level security;
alter table budgets enable row level security;
alter table category_budgets enable row level security;
alter table rollovers enable row level security;

create policy "authenticated_all_expenses" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_recurring_expenses" on recurring_expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_incomes" on incomes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_provisions" on provisions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_provision_adjustments" on provision_adjustments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_budgets" on budgets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_category_budgets" on category_budgets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_rollovers" on rollovers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
