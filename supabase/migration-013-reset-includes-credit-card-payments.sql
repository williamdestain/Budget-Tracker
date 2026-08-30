-- Met à jour la fonction reset_everything() (voir migration-008) pour
-- vider aussi credit_card_payments (migration-012) — sans cette mise à
-- jour, "Réinitialiser toutes les données" laisserait les paiements de
-- carte de crédit intacts, comme le bug BUG-006 corrigé pour
-- recurring_expenses en son temps.
--
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS migration-008 et
-- migration-012.

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
  delete from credit_card_payments;
end;
$$;

grant execute on function reset_everything() to authenticated;
