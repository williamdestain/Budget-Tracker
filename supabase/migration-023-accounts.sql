-- Comptes et suivi manuel des soldes (Phase 2, vague B).
--
-- Les comptes sont volontairement séparés des dépenses/revenus existants :
-- les données historiques ne sont pas reliées à un compte bancaire précis.
-- Les comptes bancaires, d'investissement et autres utilisent donc des
-- instantanés de solde saisis manuellement. Un compte de type "credit" sert
-- de façade pour le calcul de carte de crédit déjà présent dans l'application.
--
-- À exécuter une fois dans Supabase > SQL Editor, après migration-022.
-- Prérequis obligatoire : migration-017-households.sql doit déjà avoir été
-- exécutée dans CE projet Supabase. Ce script ne recrée volontairement pas
-- les tables du foyer.

do $$
begin
  if to_regclass('public.households') is null
     or to_regclass('public.household_members') is null then
    raise exception
      'Prérequis manquant : exécutez migration-017-households.sql (ou schema.sql pour une nouvelle base) avant migration-023-accounts.sql.';
  end if;

  if to_regprocedure('public.auth_household_id()') is null then
    raise exception
      'Prérequis manquant : la fonction auth_household_id() de migration-017-households.sql est absente.';
  end if;
end;
$$;

create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  member_id uuid references household_members(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  institution text check (institution is null or char_length(institution) <= 100),
  type text not null check (type in ('bank', 'credit', 'investment', 'other')),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists account_balance_snapshots (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  date date not null,
  balance numeric(12,2) not null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  unique (account_id, date)
);

create table if not exists investment_allocations (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  asset_class text not null check (char_length(asset_class) between 1 and 100),
  percent numeric(5,2) not null check (percent between 0 and 100),
  date date not null,
  created_at timestamptz not null default now(),
  unique (account_id, date, asset_class)
);

create index if not exists accounts_household_id_idx
  on accounts (household_id);
create index if not exists accounts_member_id_idx
  on accounts (member_id);
create index if not exists account_balance_snapshots_account_date_idx
  on account_balance_snapshots (account_id, date desc);
create index if not exists investment_allocations_account_date_idx
  on investment_allocations (account_id, date desc);

alter table accounts enable row level security;
alter table account_balance_snapshots enable row level security;
alter table investment_allocations enable row level security;

drop policy if exists "household_scoped_accounts" on accounts;
create policy "household_scoped_accounts" on accounts
  for all using (household_id = auth_household_id())
  with check (household_id = auth_household_id());

drop policy if exists "household_scoped_account_balance_snapshots"
  on account_balance_snapshots;
create policy "household_scoped_account_balance_snapshots"
  on account_balance_snapshots
  for all using (household_id = auth_household_id())
  with check (household_id = auth_household_id());

drop policy if exists "household_scoped_investment_allocations"
  on investment_allocations;
create policy "household_scoped_investment_allocations"
  on investment_allocations
  for all using (household_id = auth_household_id())
  with check (household_id = auth_household_id());
