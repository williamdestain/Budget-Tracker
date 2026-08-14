-- Objectifs d'épargne (roadmap #10) : accumulation libre vers une cible,
-- sans échéance récurrente ni facture à absorber (contrairement aux
-- provisions). À exécuter une fois dans Supabase > SQL Editor si ta base
-- existe déjà.

create table if not exists savings_goals (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  target_amount numeric(12,2) not null,
  target_date date,
  owner text not null check (owner in ('moi','madame')),
  created_at timestamptz not null default now()
);

create table if not exists savings_goal_contributions (
  id uuid primary key default uuid_generate_v4(),
  savings_goal_id uuid not null references savings_goals(id) on delete cascade,
  amount numeric(12,2) not null,
  date date not null,
  note text not null default ''
);

alter table savings_goals enable row level security;
alter table savings_goal_contributions enable row level security;

create policy "authenticated_all_savings_goals" on savings_goals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_savings_goal_contributions" on savings_goal_contributions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
