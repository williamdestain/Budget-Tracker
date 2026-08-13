-- Ajoute un pourcentage optionnel par provision, utilisé pour préremplir
-- sa part dans l'outil "🤝 Répartir un versement". À exécuter une fois
-- dans Supabase > SQL Editor si ta base existe déjà.

alter table provisions
  add column if not exists allocation_percent numeric(5,2) not null default 0;
