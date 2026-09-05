-- Défense en profondeur (audit §4.1 / plan d'action #6) : la migration-010
-- a bloqué les montants incohérents, mais aucune limite n'existait sur les
-- champs texte libres (`name`, `category`, `type`, `note`, `color`). Avec
-- la clé anon exposée côté client, n'importe qui pouvait jusqu'ici insérer
-- une catégorie ou une note de plusieurs dizaines de milliers de
-- caractères en contournant l'app.
--
-- Les limites choisies sont volontairement larges par rapport à un usage
-- normal (aucun champ de l'UI ne les approche) : l'objectif est de bloquer
-- l'abus, pas de contraindre la saisie légitime.
--   - noms/catégories/types courts (foyer, catégorie, dépense/revenu
--     récurrent, provision, objectif d'épargne)     : 100 caractères
--   - couleur (`hsl(...)`, générée par l'app)         :  30 caractères
--   - notes (champ libre le plus permissif de l'app)  : 1000 caractères
--
-- À exécuter une fois dans Supabase > SQL Editor. Si l'ajout d'une
-- contrainte échoue avec une erreur de violation, c'est qu'une ligne
-- existante dépasse déjà la limite — l'identifier et la corriger (ou
-- ajuster la limite ci-dessous) avant de relancer cette migration :
--
--   select id, char_length(name) from recurring_expenses where char_length(name) > 100;
--   -- (adapter la table/colonne selon la contrainte qui échoue)

alter table households
  add constraint households_name_length check (char_length(name) <= 100);

alter table categories
  add constraint categories_name_length check (char_length(name) <= 100),
  add constraint categories_color_length check (char_length(color) <= 30);

alter table recurring_expenses
  add constraint recurring_expenses_name_length check (char_length(name) <= 100),
  add constraint recurring_expenses_category_length check (char_length(category) <= 100);

alter table expenses
  add constraint expenses_category_length check (char_length(category) <= 100);

alter table category_budgets
  add constraint category_budgets_category_length check (char_length(category) <= 100);

alter table recurring_incomes
  add constraint recurring_incomes_type_length check (char_length(type) <= 100),
  add constraint recurring_incomes_note_length check (char_length(note) <= 1000);

alter table incomes
  add constraint incomes_type_length check (char_length(type) <= 100),
  add constraint incomes_note_length check (char_length(note) <= 1000);

alter table provisions
  add constraint provisions_name_length check (char_length(name) <= 100),
  add constraint provisions_category_length check (char_length(category) <= 100);

alter table provision_adjustments
  add constraint provision_adjustments_note_length check (char_length(note) <= 1000);

alter table savings_goals
  add constraint savings_goals_name_length check (char_length(name) <= 100);

alter table savings_goal_contributions
  add constraint savings_goal_contributions_note_length check (char_length(note) <= 1000);

alter table credit_card_payments
  add constraint credit_card_payments_note_length check (char_length(note) <= 1000);
