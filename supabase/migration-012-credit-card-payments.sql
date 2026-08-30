-- Nouvelle table dédiée au solde de carte de crédit, VOLONTAIREMENT
-- indépendante des provisions (pas de lien avec provisions/
-- provision_adjustments) — demandé explicitement par un utilisateur pour
-- garder cette fonctionnalité dans sa propre section, séparée des
-- provisions.
--
-- Remplace l'ancienne approche par catégorie spéciale
-- ("Remboursement Carte Crédit" + case cc) : le solde dû se calcule
-- désormais comme (dépenses réelles marquées "carte") moins (paiements
-- enregistrés ici), sans dépendre d'une catégorie de dépense cachée.
--
-- À exécuter une fois dans Supabase > SQL Editor.

create table if not exists credit_card_payments (
  id uuid primary key default uuid_generate_v4(),
  owner text not null,
  amount numeric(12,2) not null check (amount > 0),
  date date not null,
  note text not null default ''
);

alter table credit_card_payments enable row level security;

create policy "authenticated_all_credit_card_payments" on credit_card_payments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
