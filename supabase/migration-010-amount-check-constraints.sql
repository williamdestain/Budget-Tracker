-- Défense en profondeur, 3e couche (audit BUG-013 — voir aussi les gardes
-- ajoutées côté TypeScript dans budget-store.service.ts) : contraintes
-- PostgreSQL empêchant des montants incohérents d'être insérés même en
-- contournant complètement l'application (accès direct à l'API Supabase,
-- script, etc.).
--
-- 0 $ reste explicitement autorisé sur category_budgets (catégorie
-- volontairement gelée pour le mois, voir le correctif dédié) et sur
-- rollovers (un report peut légitimement être négatif — solde reporté en
-- dette — donc AUCUNE contrainte n'est ajoutée sur cette table).
--
-- À exécuter une fois dans Supabase > SQL Editor. Si l'ajout d'une
-- contrainte échoue avec une erreur de violation, c'est qu'une ligne
-- existante a déjà une valeur incohérente (montant négatif ou nul) —
-- il faudra la corriger manuellement avant de relancer cette migration.

alter table expenses
  add constraint expenses_amount_positive check (amount > 0);

alter table incomes
  add constraint incomes_amount_positive check (amount > 0);

alter table recurring_expenses
  add constraint recurring_expenses_amount_positive check (amount > 0);

alter table provisions
  add constraint provisions_amount_positive check (amount > 0),
  add constraint provisions_every_n_positive check (every_n > 0),
  add constraint provisions_allocation_percent_range check (allocation_percent between 0 and 100),
  add constraint provisions_rolling_count_non_negative check (rolling_count >= 0);

alter table provision_adjustments
  add constraint provision_adjustments_amount_positive check (amount > 0);

alter table savings_goals
  add constraint savings_goals_target_amount_positive check (target_amount > 0);

alter table savings_goal_contributions
  add constraint savings_goal_contributions_amount_positive check (amount > 0);

alter table category_budgets
  add constraint category_budgets_amount_non_negative check (amount >= 0);
