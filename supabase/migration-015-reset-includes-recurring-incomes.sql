-- Met à jour reset_everything() (voir migration-008, migration-013) pour
-- vider aussi recurring_incomes (migration-014) — sans cette mise à jour,
-- "Réinitialiser toutes les données" laisserait les modèles de revenus
-- récurrents intacts, même bug de fond que BUG-006 (recurring_expenses)
-- et migration-013 (credit_card_payments).
--
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS migration-014.

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
end;
$$;

grant execute on function reset_everything() to authenticated;
