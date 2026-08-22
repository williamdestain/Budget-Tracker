-- Clôture de mois : verrou global (pas par profil) sur un mois donné.
-- Une fois un mois présent dans cette table, plus aucune opération datée
-- dans ce mois n'est acceptée côté application (dépenses, revenus
-- ponctuels, ajustements de provisions, contributions d'épargne, budgets
-- par catégorie, report). Les entités structurelles qui s'étendent sur
-- plusieurs mois (provisions, dépenses/revenus récurrents, objectifs
-- d'épargne eux-mêmes) ne sont volontairement PAS bloquées par cette
-- table. À exécuter une fois dans Supabase > SQL Editor si ta base existe
-- déjà.

create table if not exists closed_months (
  ym text primary key, -- "YYYY-MM"
  closed_at timestamptz not null default now()
);

alter table closed_months enable row level security;

create policy "authenticated_all_closed_months" on closed_months
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
