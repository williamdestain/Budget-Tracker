-- Ajoute les tables/colonnes nécessaires pour "Dépenses récurrentes".
-- À exécuter une fois dans Supabase > SQL Editor si ta base existe déjà.

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

alter table expenses
  add column if not exists recurring_source_id uuid references recurring_expenses(id) on delete set null;

alter table recurring_expenses enable row level security;

create policy "authenticated_all_recurring_expenses" on recurring_expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
