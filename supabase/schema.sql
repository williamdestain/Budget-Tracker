-- Schéma Supabase pour le Traqueur de Budget.
-- À exécuter une fois dans : Supabase > SQL Editor > New query > Run.
--
-- Compte partagé : Moi et Madame se connectent avec le même identifiant,
-- donc les règles RLS ci-dessous exigent simplement "utilisateur connecté",
-- sans distinction de propriétaire au niveau des permissions (le champ
-- "owner" sert juste à filtrer/afficher, comme dans l'ancienne app).

create extension if not exists "uuid-ossp";

-- Dépenses
create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  amount numeric(12,2) not null,
  category text not null,
  date date not null,
  owner text not null check (owner in ('moi','madame')),
  cc boolean not null default false,
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
  rolling_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Ajouts manuels au fonds d'une provision ("+$ Ajouter au fonds")
create table if not exists provision_adjustments (
  id uuid primary key default uuid_generate_v4(),
  provision_id uuid not null references provisions(id) on delete cascade,
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
alter table incomes enable row level security;
alter table provisions enable row level security;
alter table provision_adjustments enable row level security;
alter table budgets enable row level security;
alter table rollovers enable row level security;

create policy "authenticated_all_expenses" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_incomes" on incomes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_provisions" on provisions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_provision_adjustments" on provision_adjustments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_budgets" on budgets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_rollovers" on rollovers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
