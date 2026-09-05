-- Corrige un oubli dans reset_everything() (migration-008/013/014/015) :
-- `closed_months` n'était jamais vidée, contrairement à toutes les autres
-- tables de données. Conséquence concrète : "Réinitialiser toutes les
-- données" (data-management) laissait les mois clôturés verrouillés après
-- coup — impossible d'ajouter la moindre dépense/revenu sur ces mois-là
-- tant qu'on ne les rouvrait pas manuellement un par un.
--
-- Trouvé en travaillant sur la concurrence (#8, migration-019) — même
-- table, mêmes lignes de code regardées de près.
--
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS migration-015.

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
  delete from closed_months;
end;
$$;

grant execute on function reset_everything() to authenticated;
