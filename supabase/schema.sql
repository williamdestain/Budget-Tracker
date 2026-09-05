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
  name text not null default 'Mon foyer' check (char_length(name) <= 100),
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
  name text not null check (char_length(name) <= 100),
  amount numeric(12,2) not null check (amount > 0),
  category text not null check (char_length(category) <= 100),
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
  category text not null check (char_length(category) <= 100),
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
  name text not null check (char_length(name) <= 100),
  color text not null check (char_length(color) <= 30),
  archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table if not exists recurring_incomes (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (char_length(type) <= 100),
  owner text not null check (owner in ('moi','madame')),
  note text not null default '' check (char_length(note) <= 1000),
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
  type text not null check (char_length(type) <= 100),
  date date not null,
  owner text not null check (owner in ('moi','madame')),
  note text not null default '' check (char_length(note) <= 1000),
  recurring boolean not null default false,
  recurring_interval text check (recurring_interval in ('once','monthly','weekly','biweekly','semimonthly')),
  recurring_start_month text, -- "YYYY-MM"
  recurring_source_id uuid references recurring_incomes(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists provisions (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  name text not null check (char_length(name) <= 100),
  amount numeric(12,2) not null check (amount > 0),
  every_n integer not null check (every_n > 0),
  interval_unit text not null check (interval_unit in ('months','days')),
  start_ym text,          -- "YYYY-MM", si interval_unit = 'months'
  start_date date,        -- si interval_unit = 'days'
  category text not null check (char_length(category) <= 100),
  owner text not null check (owner in ('moi','madame')),
  auto_recalibrate boolean not null default true,
  allocation_percent numeric(5,2) not null default 0 check (allocation_percent between 0 and 100),
  rolling_count integer not null default 0 check (rolling_count >= 0),
  -- Rappel de contribution mensuelle personnelle (migration-011) —
  -- absent par erreur de ce fichier jusqu'ici (dérive schema.sql/
  -- migrations découverte en travaillant sur import_household_data(),
  -- #7, qui référence cette colonne).
  monthly_reminder numeric,
  created_at timestamptz not null default now()
);

-- Ajouts manuels au fonds d'une provision ("+$ Ajouter au fonds")
create table if not exists provision_adjustments (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  provision_id uuid not null references provisions(id) on delete cascade,
  amount numeric(12,2) not null,
  date date not null,
  note text not null default '' check (char_length(note) <= 1000),
  versement_expense_id uuid references expenses(id) on delete cascade
);

-- Objectifs d'épargne : accumulation libre vers une cible, sans échéance
-- récurrente ni facture à absorber (contrairement aux provisions).
create table if not exists savings_goals (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  name text not null check (char_length(name) <= 100),
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
  note text not null default '' check (char_length(note) <= 1000)
);

-- Budget manuel par foyer, profil et mois.
create table if not exists budgets (
  household_id uuid not null references households(id),
  owner text not null check (owner in ('moi','madame')),
  ym text not null, -- "YYYY-MM"
  amount numeric(12,2) not null check (amount >= 0),
  -- Tenu à jour par un trigger (set_updated_at() plus bas) — utilisé côté
  -- app pour du contrôle de concurrence optimiste (voir migration-019).
  updated_at timestamptz not null default now(),
  primary key (household_id, owner, ym)
);

-- Budget par catégorie, profil et mois. Un mois sans valeur explicite
-- hérite du montant du mois précédent le plus récent qui en a une (géré
-- côté application, pas en SQL).
create table if not exists category_budgets (
  household_id uuid not null references households(id),
  owner text not null check (owner in ('moi','madame')),
  ym text not null, -- "YYYY-MM"
  category text not null check (char_length(category) <= 100),
  amount numeric(12,2) not null check (amount >= 0),
  -- Tenu à jour par un trigger (set_updated_at() plus bas) — utilisé côté
  -- app pour du contrôle de concurrence optimiste (voir migration-019) :
  -- setCategoryBudget()/removeCategoryBudget() comparent cette valeur
  -- avant d'écrire pour détecter une modification concurrente par
  -- l'autre compte du foyer, plutôt que de l'écraser silencieusement.
  updated_at timestamptz not null default now(),
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
  -- Tenu à jour par un trigger (set_updated_at() plus bas) — utilisé côté
  -- app pour du contrôle de concurrence optimiste (voir migration-019) :
  -- closeMonth()/reopenMonth() s'en servent pour détecter une clôture/
  -- réouverture concurrente par l'autre compte du foyer.
  updated_at timestamptz not null default now(),
  primary key (household_id, ym)
);

-- Paiements de carte de crédit (voir credit-card feature).
create table if not exists credit_card_payments (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id),
  amount numeric(12,2) not null check (amount > 0),
  date date not null,
  owner text not null check (owner in ('moi','madame')),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

-- Contrôle de concurrence optimiste (plan d'action #8) : `updated_at` sur
-- budgets/category_budgets/closed_months est tenu à jour par ce trigger,
-- impossible à contourner en oubliant de le faire côté client. Voir
-- migration-019-concurrency-updated-at.sql pour le détail du mécanisme.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at
  before update on budgets
  for each row execute function set_updated_at();
create trigger set_updated_at
  before update on category_budgets
  for each row execute function set_updated_at();
create trigger set_updated_at
  before update on closed_months
  for each row execute function set_updated_at();

-- Réinitialisation complète (bouton "Réinitialiser toutes les données",
-- data-management) : tout-ou-rien via une fonction Postgres plutôt que des
-- delete individuels côté client (voir migration-008 puis migration-020
-- pour l'historique — cette dernière a corrigé l'oubli de `closed_months`,
-- qui laissait les mois clôturés verrouillés après un reset). Ne vide
-- volontairement PAS `categories` : c'est de la configuration/taxonomie,
-- pas une donnée financière.
create or replace function reset_everything()
returns void
language plpgsql
security invoker
as $$
begin
  delete from expenses;
  delete from incomes;
  delete from provisions;        -- cascade -> provision_adjustments
  delete from savings_goals;     -- cascade -> savings_goal_contributions
  delete from recurring_expenses;
  delete from recurring_incomes;
  delete from budgets;
  delete from category_budgets;
  delete from rollovers;
  delete from credit_card_payments;
  delete from closed_months;
end;
$$;

grant execute on function reset_everything() to authenticated;

-- Répartition de versement transactionnelle (plan d'action #7, 1/2) :
-- voir migration-021-split-versement-rpc.sql pour l'explication complète.
create or replace function split_versement_into_provisions(
  p_sender text,
  p_total_amount numeric,
  p_date date,
  p_existing_expense_id uuid,
  p_allocations jsonb
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_household_id uuid := auth_household_id();
  v_expense_id uuid;
  v_alloc jsonb;
  v_amount numeric;
  v_adjustment_id uuid;
  v_adjustment_ids uuid[] := '{}';
begin
  if v_household_id is null then
    raise exception 'Foyer introuvable pour cet utilisateur.';
  end if;
  if p_sender not in ('moi', 'madame') then
    raise exception 'Owner invalide : %', p_sender;
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Montant de versement invalide : %', p_total_amount;
  end if;

  if p_existing_expense_id is not null then
    select id into v_expense_id
      from expenses
      where id = p_existing_expense_id and household_id = v_household_id;
    if v_expense_id is null then
      raise exception 'Versement introuvable.';
    end if;
  else
    insert into expenses (household_id, amount, category, date, owner, cc)
    values (v_household_id, p_total_amount, 'Versement', p_date, p_sender, false)
    returning id into v_expense_id;
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_amount := (v_alloc->>'amount')::numeric;
    if v_amount is not null and v_amount > 0 then
      insert into provision_adjustments (household_id, provision_id, amount, date, note, versement_expense_id)
      values (
        v_household_id,
        (v_alloc->>'provision_id')::uuid,
        v_amount,
        p_date,
        coalesce(v_alloc->>'note', ''),
        v_expense_id
      )
      returning id into v_adjustment_id;
      v_adjustment_ids := array_append(v_adjustment_ids, v_adjustment_id);
    end if;
  end loop;

  return jsonb_build_object('expense_id', v_expense_id, 'adjustment_ids', v_adjustment_ids);
end;
$$;

grant execute on function split_versement_into_provisions(text, numeric, date, uuid, jsonb) to authenticated;

-- Import complet transactionnel (plan d'action #7, 2/2) : voir
-- migration-022-import-data-rpc.sql pour l'explication complète. Réutilise
-- reset_everything() ci-dessus (même transaction, un échec plus loin
-- annule aussi ce vidage).
create or replace function import_household_data(
  p_provisions jsonb default '[]'::jsonb,
  p_provision_adjustments jsonb default '[]'::jsonb,
  p_savings_goals jsonb default '[]'::jsonb,
  p_savings_goal_contributions jsonb default '[]'::jsonb,
  p_recurring_expenses jsonb default '[]'::jsonb,
  p_recurring_incomes jsonb default '[]'::jsonb,
  p_categories jsonb default '[]'::jsonb,
  p_credit_card_payments jsonb default '[]'::jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_incomes jsonb default '[]'::jsonb,
  p_budgets jsonb default '[]'::jsonb,
  p_rollovers jsonb default '[]'::jsonb,
  p_category_budgets jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
as $$
begin
  perform reset_everything();

  insert into provisions (
    id, household_id, name, amount, every_n, interval_unit, start_ym, start_date,
    category, owner, auto_recalibrate, allocation_percent, rolling_count, monthly_reminder
  )
  select id, household_id, name, amount, every_n, interval_unit, start_ym, start_date,
         category, owner, auto_recalibrate, allocation_percent, rolling_count, monthly_reminder
  from jsonb_to_recordset(p_provisions) as x(
    id uuid, household_id uuid, name text, amount numeric, every_n integer,
    interval_unit text, start_ym text, start_date date, category text, owner text,
    auto_recalibrate boolean, allocation_percent numeric, rolling_count integer,
    monthly_reminder numeric
  );

  insert into provision_adjustments (id, household_id, provision_id, amount, date, note)
  select id, household_id, provision_id, amount, date, note
  from jsonb_to_recordset(p_provision_adjustments) as x(
    id uuid, household_id uuid, provision_id uuid, amount numeric, date date, note text
  );

  insert into savings_goals (id, household_id, name, target_amount, target_date, owner)
  select id, household_id, name, target_amount, target_date, owner
  from jsonb_to_recordset(p_savings_goals) as x(
    id uuid, household_id uuid, name text, target_amount numeric, target_date date, owner text
  );

  insert into savings_goal_contributions (id, household_id, savings_goal_id, amount, date, note)
  select id, household_id, savings_goal_id, amount, date, note
  from jsonb_to_recordset(p_savings_goal_contributions) as x(
    id uuid, household_id uuid, savings_goal_id uuid, amount numeric, date date, note text
  );

  insert into recurring_expenses (
    id, household_id, name, amount, category, owner, day_of_month, cc, active
  )
  select id, household_id, name, amount, category, owner, day_of_month, cc, active
  from jsonb_to_recordset(p_recurring_expenses) as x(
    id uuid, household_id uuid, name text, amount numeric, category text, owner text,
    day_of_month integer, cc boolean, active boolean
  );

  insert into recurring_incomes (
    id, household_id, amount, type, owner, note, interval, day_of_month,
    second_day_of_month, start_date, active
  )
  select id, household_id, amount, type, owner, note, interval, day_of_month,
         second_day_of_month, start_date, active
  from jsonb_to_recordset(p_recurring_incomes) as x(
    id uuid, household_id uuid, amount numeric, type text, owner text, note text,
    interval text, day_of_month integer, second_day_of_month integer, start_date date,
    active boolean
  );

  insert into categories (id, household_id, name, color, archived, sort_order)
  select id, household_id, name, color, archived, sort_order
  from jsonb_to_recordset(p_categories) as x(
    id uuid, household_id uuid, name text, color text, archived boolean, sort_order integer
  );

  insert into credit_card_payments (id, household_id, owner, amount, date, note)
  select id, household_id, owner, amount, date, note
  from jsonb_to_recordset(p_credit_card_payments) as x(
    id uuid, household_id uuid, owner text, amount numeric, date date, note text
  );

  insert into expenses (id, household_id, amount, category, date, owner, cc, recurring_source_id)
  select id, household_id, amount, category, date, owner, cc, recurring_source_id
  from jsonb_to_recordset(p_expenses) as x(
    id uuid, household_id uuid, amount numeric, category text, date date, owner text,
    cc boolean, recurring_source_id uuid
  );

  insert into incomes (
    id, household_id, amount, type, date, owner, note, recurring,
    recurring_interval, recurring_start_month, recurring_source_id
  )
  select id, household_id, amount, type, date, owner, note, recurring,
         recurring_interval, recurring_start_month, recurring_source_id
  from jsonb_to_recordset(p_incomes) as x(
    id uuid, household_id uuid, amount numeric, type text, date date, owner text,
    note text, recurring boolean, recurring_interval text, recurring_start_month text,
    recurring_source_id uuid
  );

  insert into budgets (household_id, owner, ym, amount)
  select household_id, owner, ym, amount
  from jsonb_to_recordset(p_budgets) as x(household_id uuid, owner text, ym text, amount numeric);

  insert into rollovers (household_id, owner, ym, amount)
  select household_id, owner, ym, amount
  from jsonb_to_recordset(p_rollovers) as x(household_id uuid, owner text, ym text, amount numeric);

  insert into category_budgets (household_id, owner, ym, category, amount)
  select household_id, owner, ym, category, amount
  from jsonb_to_recordset(p_category_budgets) as x(
    household_id uuid, owner text, ym text, category text, amount numeric
  );
end;
$$;

grant execute on function import_household_data(
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

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
