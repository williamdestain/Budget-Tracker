-- Ajoute le support des fréquences hebdomadaire / aux 2 semaines / 2x par
-- mois aux dépenses récurrentes, qui ne supportaient jusqu'ici que le
-- mensuel (day_of_month). Même logique que ce qui existait déjà pour les
-- revenus récurrents (recurring_interval sur incomes), généralisée ici.
--
-- interval          : 'monthly' (défaut, comportement inchangé) | 'weekly'
--                      | 'biweekly' | 'semimonthly'
-- start_date         : date d'ancrage du cycle pour 'weekly'/'biweekly'
--                      (ex. la prochaine échéance connue) — inutilisée pour
--                      'monthly'/'semimonthly'.
-- second_day_of_month : deuxième jour du mois pour 'semimonthly' (le
--                      premier jour reste day_of_month) — inutilisée sinon.
--
-- À exécuter une fois dans Supabase > SQL Editor si ta base existe déjà.
-- Rétrocompatible : les lignes existantes reçoivent interval='monthly' et
-- gardent leur day_of_month tel quel, comportement strictement identique.

alter table recurring_expenses
  add column if not exists interval text not null default 'monthly'
    check (interval in ('monthly', 'weekly', 'biweekly', 'semimonthly'));

alter table recurring_expenses
  add column if not exists start_date date;

alter table recurring_expenses
  add column if not exists second_day_of_month integer
    check (second_day_of_month is null or second_day_of_month between 1 and 31);
