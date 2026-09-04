-- Schéma Supabase pour le Traqueur de Budget.
-- À exécuter une fois dans : Supabase > SQL Editor > New query > Run.
--
-- Modèle multi-foyers : chaque compte appartient à un foyer (households +
-- household_members), et chaque ligne de donnée appartient à un foyer
-- précis. Les policies RLS ne laissent voir/modifier que les données du
-- foyer de l'utilisateur connecté — voir migration-017-households.sql pour
-- l'historique complet et les explications détaillées de ce modèle (ce
-- fichier schema.sql sert seulement de référence pour une installation
-- neuve, qui part directement sur la version finale du schéma).

create extension if not exists "uuid-ossp";

-- --- Foyers ------------------------------------------------------------

create table if not exists households (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Mon foyer',
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_label text not null check (owner_label in ('moi', 'madame')),
  joined_at timestamptz not null default now(),
  unique (user_id),                      -- un compte = un seul foyer
  unique (household_id, owner_label)     -- un foyer = un "moi" + une "madame" max
);

-- `security definer` : nécessaire pour éviter la récursion RLS classique
-- (une policy sur household_members qui interrogerait household_members
-- dans sa propre condition). `set search_path = public` bloque le
-- détournement classique de search_path sur les fonctions security definer.
create or replace function auth_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid() limit 1;
$$;

-- Créer/rejoindre un foyer : les 2 seules portes d'entrée pour écrire dans
-- households/household_members (aucune policy insert/update/delete pour le
-- rôle "authenticated" — voir plus bas). Chaque nouveau foyer reçoit ici
-- son propre jeu de catégories par défaut (mêmes noms/couleurs qu'à
-- l'origine de l'app), personnalisable ensuite indépendamment par foyer.
create or replace function create_household(p_owner_label text, p_name text default 'Mon foyer')
returns table (household_id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  if p_owner_label not in ('moi', 'madame') then
    raise exception 'Profil invalide : %', p_owner_label;
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Ce compte appartient déjà à un foyer.';
  end if;

  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (random() * 31)::int + 1, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from households where households.join_code = v_code);
  end loop;

  insert into households (name, join_code) values (p_name, v_code) returning id into v_id;
  insert into household_members (household_id, user_id, owner_label) values (v_id, auth.uid(), p_owner_label);

  insert into categories (household_id, name, color, sort_order) values
    (v_id, 'Loyer', 'hsl(0, 62%, 56%)', 0),
    (v_id, 'Garderie', 'hsl(138, 68%, 61%)', 1),
    (v_id, 'REEE', 'hsl(275, 74%, 56%)', 2),
    (v_id, 'Assurance Auto', 'hsl(53, 62%, 61%)', 3),
    (v_id, 'Assurance Maison', 'hsl(190, 68%, 56%)', 4),
    (v_id, 'Assurance Pret', 'hsl(328, 74%, 61%)', 5),
    (v_id, 'Assurance Invalidité', 'hsl(105, 62%, 56%)', 6),
    (v_id, 'Assurance Maladie', 'hsl(243, 68%, 61%)', 7),
    (v_id, 'Assurance Maladie enfants', 'hsl(20, 74%, 56%)', 8),
    (v_id, 'Internet', 'hsl(158, 62%, 61%)', 9),
    (v_id, 'Téléphone', 'hsl(295, 68%, 56%)', 10),
    (v_id, 'Pret voiture', 'hsl(73, 74%, 61%)', 11),
    (v_id, 'REER W', 'hsl(210, 62%, 56%)', 12),
    (v_id, 'Epargne W', 'hsl(348, 68%, 61%)', 13),
    (v_id, 'Celi W', 'hsl(125, 74%, 56%)', 14),
    (v_id, 'Electricité', 'hsl(263, 62%, 61%)', 15),
    (v_id, 'Courses', 'hsl(40, 68%, 56%)', 16),
    (v_id, 'Sport', 'hsl(178, 74%, 61%)', 17),
    (v_id, 'Essence', 'hsl(315, 62%, 56%)', 18),
    (v_id, 'Santé/médecine', 'hsl(93, 68%, 61%)', 19),
    (v_id, 'Autre Dépense', 'hsl(230, 74%, 56%)', 20),
    (v_id, 'Taxe fonciere/municipale', 'hsl(8, 62%, 61%)', 21),
    (v_id, 'Taxe scolaire', 'hsl(145, 68%, 56%)', 22),
    (v_id, 'Transport', 'hsl(283, 74%, 61%)', 23),
    (v_id, 'Nespresso', 'hsl(60, 62%, 56%)', 24),
    (v_id, 'REER E', 'hsl(198, 68%, 61%)', 25),
    (v_id, 'Epargne E', 'hsl(335, 74%, 56%)', 26),
    (v_id, 'Epg QC--Bonifié', 'hsl(113, 62%, 61%)', 27),
    (v_id, 'Exceptionnel', 'hsl(250, 68%, 56%)', 28),
    (v_id, 'Revenu', 'hsl(28, 74%, 61%)', 29),
    (v_id, 'Remboursement Carte Crédit', 'hsl(165, 62%, 56%)', 30),
    (v_id, 'Versement', 'hsl(303, 68%, 61%)', 31);

  return query select v_id, v_code;
end;
$$;

create or replace function join_household(p_code text, p_owner_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if p_owner_label not in ('moi', 'madame') then
    raise exception 'Profil invalide : %', p_owner_label;
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Ce compte appartient déjà à un foyer.';
  end if;

  select id into v_household_id from households where households.join_code = upper(trim(p_code));
  if v_household_id is null then
    raise exception 'Code invalide.';
  end if;
  if exists (
    select 1 from household_members
    where household_id = v_household_id and owner_label = p_owner_label
  ) then
    raise exception 'Le profil "%" existe déjà dans ce foyer.', p_owner_label;
  end if;

  insert into household_members (household_id, user_id, owner_label) values (v_household_id, auth.uid(), p_owner_label);
  return v_household_id;
end;
$$;

grant execute on function auth_household_id() to authenticated;
grant execute on function create_household(text, text) to authenticated;
grant execute on function join_household(text, text) to authenticated;

alter table households enable row level security;
alter table household_members enable row level security;

create policy "select_own_household" on households
  for select using (id = auth_household_id());
create policy "select_own_household_members" on household_members
  for select using (household_id = auth_household_id());

-- --- Données, toutes scoped par foyer -----------------------------------

-- Modèles de dépenses récurrentes ("Dépenses attendues ce mois-ci").
-- Suggestion + confirmation manuelle, pour éviter les doublons avec une
-- saisie manuelle. Créée avant "expenses" car cette dernière la référence.
create table if not exists recurring_expenses (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  owner text not null check (owner in ('moi','madame')),
  day_of_month integer not null check (day_of_month between 1 and 31),
  cc boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  amount numeric(12,2) not null check (amount > 0),
  category text not null,
  date date not null,
  owner text not null check (owner in ('moi','madame')),
  cc boolean not null default false,
  recurring_source_id uuid references recurring_expenses(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Catégories — un jeu par foyer (seedé par create_household() ci-dessus),
-- personnalisable indépendamment (ajout/renommage/archivage).
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  name text not null,
  color text not null,
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table if not exists recurring_incomes (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  amount numeric(12,2) not null check (amount > 0),
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
  household_id uuid not null references households(id),
  amount numeric(12,2) not null check (amount > 0),
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

create table if not exists provisions (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  every_n integer not null check (every_n > 0),
  interval_unit text not null check (interval_unit in ('months','days')),
  start_ym text,          -- "YYYY-MM", si interval_unit = 'months'
  start_date date,        -- si interval_unit = 'days'
  category text not null,
  owner text not null check (owner in ('moi','madame')),
  auto_recalibrate boolean not null default true,
  allocation_percent numeric(5,2) not null default 0 check (allocation_percent between 0 and 100),
  rolling_count integer not null default 0 check (rolling_count >= 0),
  created_at timestamptz not null default now()
);

-- Ajouts manuels au fonds d'une provision ("+$ Ajouter au fonds")
create table if not exists provision_adjustments (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  provision_id uuid not null references provisions(id) on delete cascade,
  amount numeric(12,2) not null,
  date date not null,
  note text not null default '',
  versement_expense_id uuid references expenses(id) on delete cascade
);

-- Objectifs d'épargne : accumulation libre vers une cible, sans échéance
-- récurrente ni facture à absorber (contrairement aux provisions).
create table if not exists savings_goals (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  target_date date, -- optionnelle, indicative
  owner text not null check (owner in ('moi','madame')),
  created_at timestamptz not null default now()
);

create table if not exists savings_goal_contributions (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  savings_goal_id uuid not null references savings_goals(id) on delete cascade,
  amount numeric(12,2) not null,
  date date not null,
  note text not null default ''
);

-- Budget manuel par foyer, profil et mois.
create table if not exists budgets (
  household_id uuid not null references households(id),
  owner text not null check (owner in ('moi','madame')),
  ym text not null, -- "YYYY-MM"
  amount numeric(12,2) not null check (amount >= 0),
  primary key (household_id, owner, ym)
);

-- Budget par catégorie, profil et mois. Un mois sans valeur explicite
-- hérite du montant du mois précédent le plus récent qui en a une (géré
-- côté application, pas en SQL).
create table if not exists category_budgets (
  household_id uuid not null references households(id),
  owner text not null check (owner in ('moi','madame')),
  ym text not null, -- "YYYY-MM"
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  primary key (household_id, owner, ym, category)
);

-- Report de solde (clôture du mois) par foyer, profil et mois. Le report
-- "Global" n'est jamais stocké : toujours recalculé comme moi[ym] +
-- madame[ym] côté application.
create table if not exists rollovers (
  household_id uuid not null references households(id),
  owner text not null check (owner in ('moi','madame')),
  ym text not null, -- "YYYY-MM"
  amount numeric(12,2) not null,
  primary key (household_id, owner, ym)
);

-- Clôture de mois : verrou global par FOYER (pas par profil individuel).
-- Un mois présent ici bloque toute opération datée dans ce mois côté
-- application, pour les deux profils du foyer.
create table if not exists closed_months (
  household_id uuid not null references households(id),
  ym text not null, -- "YYYY-MM"
  closed_at timestamptz not null default now(),
  primary key (household_id, ym)
);

-- Paiements de carte de crédit (voir credit-card feature).
create table if not exists credit_card_payments (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  amount numeric(12,2) not null check (amount > 0),
  date date not null,
  owner text not null check (owner in ('moi','madame')),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Row Level Security : scoped par foyer (voir auth_household_id() plus haut).
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
alter table credit_card_payments enable row level security;

create policy "household_scoped_expenses" on expenses
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_recurring_expenses" on recurring_expenses
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_incomes" on incomes
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_recurring_incomes" on recurring_incomes
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_categories" on categories
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_provisions" on provisions
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_provision_adjustments" on provision_adjustments
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_savings_goals" on savings_goals
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_savings_goal_contributions" on savings_goal_contributions
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_budgets" on budgets
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_category_budgets" on category_budgets
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_rollovers" on rollovers
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_closed_months" on closed_months
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_credit_card_payments" on credit_card_payments
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
