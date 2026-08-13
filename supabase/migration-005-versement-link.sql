-- Lie chaque ajout de provision créé par "🤝 Répartir un versement" à la
-- dépense "Versement" qui l'a généré, pour permettre d'annuler toute la
-- répartition en un clic (supprime la dépense + tous les ajouts liés).
-- À exécuter une fois dans Supabase > SQL Editor si ta base existe déjà.

alter table provision_adjustments
  add column if not exists versement_expense_id uuid references expenses(id) on delete cascade;
