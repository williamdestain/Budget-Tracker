-- Rend resetEverything() réellement atomique (voir
-- AUDIT_PRODUCTION_V2.md §3.3, REVIEW_ARCHITECTURE_ET_PLAN_REFACTORING.md).
-- Avant ce correctif, le "reset complet" faisait 8 DELETE séparés depuis
-- le client : un échec réseau/permission à mi-parcours pouvait laisser la
-- base dans un état partiellement vidé, sans rollback possible côté
-- client. Une fonction PL/pgSQL s'exécute dans une seule transaction
-- Postgres implicite — si une ligne du corps échoue, TOUT le bloc est
-- annulé automatiquement, aucune table n'est touchée.
--
-- security invoker (pas definer) : la fonction s'exécute avec les droits
-- de l'appelant, donc les politiques RLS existantes ("authenticated_all_*"
-- sur chaque table) s'appliquent normalement — ce correctif ne contourne
-- pas la sécurité par ligne, il rend juste l'opération atomique.
--
-- provision_adjustments et savings_goal_contributions ne sont pas listées
-- explicitement : elles sont vidées par cascade (on delete cascade) via
-- la suppression de provisions/savings_goals respectivement — cf.
-- schema.sql.
--
-- À exécuter une fois dans Supabase > SQL Editor.

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
  delete from budgets;
  delete from category_budgets;
  delete from rollovers;
end;
$$;

grant execute on function reset_everything() to authenticated;
