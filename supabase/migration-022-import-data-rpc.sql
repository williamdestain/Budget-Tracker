-- Transactions RPC pour l'import complet (plan d'action #7, 2/2 — voir
-- migration-021 pour la répartition de versement).
--
-- L'ancien importData() faisait : resetEverything() (déjà atomique, RPC
-- depuis migration-008) PUIS une dizaine d'inserts HTTP indépendants
-- (provisions, ajustements, objectifs d'épargne, contributions, dépenses/
-- revenus récurrents, catégories, paiements carte, dépenses, revenus,
-- budgets, reports, budgets par catégorie). Si l'un de ces inserts
-- échouait après que d'autres aient déjà réussi, le code rappelait
-- resetEverything() comme rollback de compensation — mais ce rollback
-- pouvait lui-même échouer (ex. coupure réseau prolongée), laissant
-- l'utilisateur avec un message l'invitant à "vérifier manuellement dans
-- Supabase" (voir l'ancien insertImportedData()/importData() dans
-- budget-store.service.ts).
--
-- Cette RPC regroupe le vidage ET la réécriture dans UNE seule
-- transaction Postgres, en réutilisant reset_everything() (voir
-- migration-020) pour le vidage : un appel de fonction plpgsql dans une
-- autre partage la même transaction, donc un échec n'importe où (y
-- compris dans les inserts) annule aussi le vidage — l'ancien état est
-- intégralement préservé, plus besoin d'un rollback applicatif séparé qui
-- peut lui-même échouer.
--
-- N'inclut PAS `categories` dans le vidage (comme reset_everything()) :
-- les catégories du foyer sont préservées, seules les catégories
-- personnalisées absentes sont ajoutées via p_categories (dédoublonnage
-- par nom fait côté TS avant l'appel, comme avant).
--
-- Tous les paramètres sont des tableaux jsonb (un par table), déjà
-- entièrement construits côté TS (mapping des colonnes, génération de
-- vrais UUID pour les anciens identifiants courts de l'app d'origine,
-- dédoublonnage des catégories) — cette RPC ne fait AUCUNE logique
-- métier, seulement des inserts, pour ne pas dupliquer côté SQL des
-- règles qui vivent déjà dans supabase-mappers.ts et budget-store.service.ts.
-- Défaut '[]'::jsonb sur chaque paramètre : un jeu de données optionnel
-- absent (ex. sauvegarde faite avant l'ajout des objectifs d'épargne)
-- passe simplement un tableau vide.
--
-- Ordre des inserts important pour les clés étrangères :
--   - provision_adjustments après provisions
--   - savings_goal_contributions après savings_goals
--   - expenses après recurring_expenses (recurring_source_id)
--   - incomes après recurring_incomes (recurring_source_id)
--
-- security invoker : les policies RLS `household_scoped_*` (with check
-- household_id = auth_household_id()) s'appliquent normalement à chaque
-- ligne insérée — si le payload contenait un household_id qui n'est pas
-- celui de l'utilisateur connecté, l'insert échouerait et annulerait toute
-- la transaction, comme n'importe quel insert direct aujourd'hui.
--
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS migration-021.

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

  -- Doit venir AVANT incomes (incomes.recurring_source_id référence
  -- recurring_incomes(id)).
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

  -- Doit venir APRÈS recurring_expenses (recurring_source_id).
  insert into expenses (id, household_id, amount, category, date, owner, cc, recurring_source_id)
  select id, household_id, amount, category, date, owner, cc, recurring_source_id
  from jsonb_to_recordset(p_expenses) as x(
    id uuid, household_id uuid, amount numeric, category text, date date, owner text,
    cc boolean, recurring_source_id uuid
  );

  -- Doit venir APRÈS recurring_incomes (recurring_source_id).
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
