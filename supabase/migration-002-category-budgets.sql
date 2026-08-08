-- Ajoute la table nécessaire pour "Budget par catégorie".
-- À exécuter une fois dans Supabase > SQL Editor si ta base existe déjà.

create table if not exists category_budgets (
  owner text not null check (owner in ('moi','madame')),
  ym text not null,
  category text not null,
  amount numeric(12,2) not null,
  primary key (owner, ym, category)
);

alter table category_budgets enable row level security;

create policy "authenticated_all_category_budgets" on category_budgets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
