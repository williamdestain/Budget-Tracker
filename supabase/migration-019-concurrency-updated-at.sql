-- Concurrence (plan d'action #8) : maintenant que 2 vrais comptes/appareils
-- distincts existent par foyer (avant : un seul login partagé, donc aucun
-- vrai scénario d'écriture simultanée), deux sessions peuvent modifier la
-- même ligne en même temps sans le savoir — ex. Moi et Madame éditent le
-- même budget de catégorie au même moment, le dernier `upsert` écrasait
-- silencieusement l'autre ("lost update"), sans avertissement.
--
-- Cette migration ajoute une colonne `updated_at`, tenue à jour par un
-- trigger côté base (donc impossible à contourner en oubliant de la
-- mettre à jour côté client), sur les 3 tables où ce risque est réel :
--   - category_budgets : des montants qu'on édite ligne par ligne — le
--     cas d'écrasement silencieux le plus concret.
--   - closed_months : clôturer/rouvrir un mois est un verrou global au
--     foyer, donc directement exposé à une course entre les 2 comptes.
--   - budgets : même risque en principe (actuellement seulement lu/
--     importé côté app, pas encore éditable ligne par ligne comme
--     category_budgets, mais la colonne est ajoutée dès maintenant pour
--     ne pas avoir à refaire une migration le jour où elle le devient).
--
-- Le mécanisme de contrôle de concurrence optimiste côté application
-- (comparer `updated_at` avant d'écrire, recharger si ça a changé) est
-- implémenté dans budget-store.service.ts (setCategoryBudget,
-- removeCategoryBudget, closeMonth, reopenMonth).
--
-- À exécuter une fois dans Supabase > SQL Editor.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table budgets
  add column if not exists updated_at timestamptz not null default now();
alter table category_budgets
  add column if not exists updated_at timestamptz not null default now();
alter table closed_months
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_updated_at on budgets;
create trigger set_updated_at
  before update on budgets
  for each row execute function set_updated_at();

drop trigger if exists set_updated_at on category_budgets;
create trigger set_updated_at
  before update on category_budgets
  for each row execute function set_updated_at();

drop trigger if exists set_updated_at on closed_months;
create trigger set_updated_at
  before update on closed_months
  for each row execute function set_updated_at();
