-- Correctif : la contrainte d'origine sur incomes.recurring_interval
-- oubliait la valeur "once" (utilisée pour un revenu NON récurrent).
-- À exécuter une fois dans Supabase > SQL Editor si ta base existe déjà.

alter table incomes drop constraint incomes_recurring_interval_check;
alter table incomes add constraint incomes_recurring_interval_check
  check (recurring_interval in ('once','monthly','weekly','biweekly','semimonthly'));
