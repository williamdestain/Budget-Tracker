-- Ajoute un rappel de contribution mensuelle personnelle sur les
-- provisions — séparé du versement reçu, pour les cas où l'utilisateur
-- s'engage à ajouter lui-même un montant fixe chaque mois (ex. sa propre
-- moitié dans un partage 50/50 avec le conjoint, l'autre moitié arrivant
-- déjà via un versement suivi automatiquement).
--
-- Ce n'est qu'un pense-bête affiché dans l'app ("Mes contributions du
-- mois") — rien n'est jamais ajouté automatiquement à la cagnotte, c'est
-- toujours une confirmation manuelle en un clic.
--
-- À exécuter une fois dans Supabase > SQL Editor si ta base existe déjà.
-- Rétrocompatible : les provisions existantes reçoivent NULL (pas de
-- rappel configuré), comportement inchangé.

alter table provisions
  add column if not exists monthly_reminder numeric;
