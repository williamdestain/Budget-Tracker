-- ============================================================================
-- CORRECTION DU P0 DE L'AUDIT : isolation des données entre foyers.
-- ============================================================================
-- Remplace le modèle actuel (policies ouvertes à tout compte authentifié —
-- voir AUDIT_PRODUCTION_FUSION.md §2) par un vrai modèle multi-foyers :
-- chaque foyer a ses propres membres (jusqu'à 2 : "moi" et "madame"), et
-- chaque ligne de donnée appartient à un foyer précis. Les policies RLS ne
-- laissent plus voir/modifier que les données du foyer de l'utilisateur
-- connecté.
--
-- IMPORTANT — à exécuter dans cet ordre, en une seule fois, dans
-- Supabase > SQL Editor. Lis les instructions à la toute fin AVANT de
-- lancer quoi que ce soit dans l'app après cette migration.
-- ============================================================================

-- --- 1. Tables foyer -------------------------------------------------------

create table if not exists households (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Mon foyer',
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_label text not null check (owner_label in ('moi', 'madame')),
  joined_at timestamptz not null default now(),
  -- Un compte n'appartient qu'à UN SEUL foyer (modèle simple, cohérent
  -- avec le reste de l'app qui suppose exactement 2 profils par foyer).
  unique (user_id),
  -- Un foyer n'a qu'un "moi" et qu'un "madame", jamais deux du même.
  unique (household_id, owner_label)
);

-- --- 2. Fonction utilitaire pour les policies -------------------------------
--
-- `security definer` : nécessaire pour éviter la récursion RLS classique
-- (une policy sur household_members qui interrogerait household_members
-- dans sa propre condition). Cette fonction contourne volontairement la
-- RLS UNIQUEMENT pour cette lecture précise (le foyer de l'utilisateur
-- courant), jamais pour autre chose. `set search_path = public` bloque le
-- détournement classique de search_path sur les fonctions security definer.
create or replace function auth_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid() limit 1;
$$;

-- --- 3. Créer/rejoindre un foyer, uniquement via ces 2 fonctions -----------
--
-- Toute la logique de rattachement passe par ici (jamais par un insert
-- direct côté client) : households/household_members n'ont volontairement
-- AUCUNE policy d'écriture pour le rôle "authenticated" (voir plus bas) —
-- la seule porte d'entrée, ce sont ces 2 fonctions, `security definer`,
-- qui appliquent les règles métier (un compte = un seul foyer, un foyer =
-- un "moi" + une "madame" maximum) de façon atomique.

create or replace function create_household(p_owner_label text, p_name text default 'Mon foyer')
returns table (household_id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  if p_owner_label not in ('moi', 'madame') then
    raise exception 'Profil invalide : %', p_owner_label;
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Ce compte appartient déjà à un foyer.';
  end if;

  -- Code à 6 caractères (sans 0/O/1/I, pour éviter la confusion à la
  -- lecture/saisie), régénéré en cas de collision improbable.
  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (random() * 31)::int + 1, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from households where households.join_code = v_code);
  end loop;

  insert into households (name, join_code) values (p_name, v_code) returning id into v_id;
  insert into household_members (household_id, user_id, owner_label) values (v_id, auth.uid(), p_owner_label);

  -- Chaque nouveau foyer démarre avec le même jeu de catégories par défaut
  -- que l'app a toujours proposé (mêmes noms/couleurs) — les catégories
  -- sont maintenant scoped par foyer (chacun peut ensuite les personnaliser
  -- indépendamment via "🏷️ Gérer les catégories"), donc il faut les semer
  -- ici plutôt qu'une seule fois globalement comme avant ce modèle.
  insert into categories (household_id, name, color, sort_order) values
    (v_id, 'Loyer', 'hsl(0, 62%, 56%)', 0),
    (v_id, 'Garderie', 'hsl(138, 68%, 61%)', 1),
    (v_id, 'REEE', 'hsl(275, 74%, 56%)', 2),
    (v_id, 'Assurance Auto', 'hsl(53, 62%, 61%)', 3),
    (v_id, 'Assurance Maison', 'hsl(190, 68%, 56%)', 4),
    (v_id, 'Assurance Pret', 'hsl(328, 74%, 61%)', 5),
    (v_id, 'Assurance Invalidité', 'hsl(105, 62%, 56%)', 6),
    (v_id, 'Assurance Maladie', 'hsl(243, 68%, 61%)', 7),
    (v_id, 'Assurance Maladie enfants', 'hsl(20, 74%, 56%)', 8),
    (v_id, 'Internet', 'hsl(158, 62%, 61%)', 9),
    (v_id, 'Téléphone', 'hsl(295, 68%, 56%)', 10),
    (v_id, 'Pret voiture', 'hsl(73, 74%, 61%)', 11),
    (v_id, 'REER W', 'hsl(210, 62%, 56%)', 12),
    (v_id, 'Epargne W', 'hsl(348, 68%, 61%)', 13),
    (v_id, 'Celi W', 'hsl(125, 74%, 56%)', 14),
    (v_id, 'Electricité', 'hsl(263, 62%, 61%)', 15),
    (v_id, 'Courses', 'hsl(40, 68%, 56%)', 16),
    (v_id, 'Sport', 'hsl(178, 74%, 61%)', 17),
    (v_id, 'Essence', 'hsl(315, 62%, 56%)', 18),
    (v_id, 'Santé/médecine', 'hsl(93, 68%, 61%)', 19),
    (v_id, 'Autre Dépense', 'hsl(230, 74%, 56%)', 20),
    (v_id, 'Taxe fonciere/municipale', 'hsl(8, 62%, 61%)', 21),
    (v_id, 'Taxe scolaire', 'hsl(145, 68%, 56%)', 22),
    (v_id, 'Transport', 'hsl(283, 74%, 61%)', 23),
    (v_id, 'Nespresso', 'hsl(60, 62%, 56%)', 24),
    (v_id, 'REER E', 'hsl(198, 68%, 61%)', 25),
    (v_id, 'Epargne E', 'hsl(335, 74%, 56%)', 26),
    (v_id, 'Epg QC--Bonifié', 'hsl(113, 62%, 61%)', 27),
    (v_id, 'Exceptionnel', 'hsl(250, 68%, 56%)', 28),
    (v_id, 'Revenu', 'hsl(28, 74%, 61%)', 29),
    (v_id, 'Remboursement Carte Crédit', 'hsl(165, 62%, 56%)', 30),
    (v_id, 'Versement', 'hsl(303, 68%, 61%)', 31);

  return query select v_id, v_code;
end;
$$;

create or replace function join_household(p_code text, p_owner_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if p_owner_label not in ('moi', 'madame') then
    raise exception 'Profil invalide : %', p_owner_label;
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Ce compte appartient déjà à un foyer.';
  end if;

  select id into v_household_id from households where households.join_code = upper(trim(p_code));
  if v_household_id is null then
    raise exception 'Code invalide.';
  end if;
  if exists (
    select 1 from household_members
    where household_id = v_household_id and owner_label = p_owner_label
  ) then
    raise exception 'Le profil "%" existe déjà dans ce foyer.', p_owner_label;
  end if;

  insert into household_members (household_id, user_id, owner_label) values (v_household_id, auth.uid(), p_owner_label);
  return v_household_id;
end;
$$;

grant execute on function auth_household_id() to authenticated;
grant execute on function create_household(text, text) to authenticated;
grant execute on function join_household(text, text) to authenticated;

-- --- 4. RLS sur households / household_members -----------------------------
--
-- Volontairement AUCUNE policy insert/update/delete pour "authenticated" :
-- tout passe par create_household()/join_household() ci-dessus.

alter table households enable row level security;
alter table household_members enable row level security;

create policy "select_own_household" on households
  for select using (id = auth_household_id());

create policy "select_own_household_members" on household_members
  for select using (household_id = auth_household_id());

-- --- 5. household_id sur les 14 tables de données --------------------------

alter table expenses add column if not exists household_id uuid references households(id);
alter table incomes add column if not exists household_id uuid references households(id);
alter table recurring_expenses add column if not exists household_id uuid references households(id);
alter table recurring_incomes add column if not exists household_id uuid references households(id);
alter table categories add column if not exists household_id uuid references households(id);

-- L'unicité du nom de catégorie était globale ("Loyer" ne pouvait exister
-- qu'une fois dans toute la base) — elle doit maintenant être PAR FOYER
-- (chaque foyer peut avoir sa propre "Loyer"), sinon le foyer créé après
-- le premier ne pourrait jamais recevoir les catégories par défaut (voir
-- create_household() plus haut, qui les sème pour chaque nouveau foyer).
alter table categories drop constraint if exists categories_name_key;
alter table categories add constraint categories_household_name_key unique (household_id, name);
alter table provisions add column if not exists household_id uuid references households(id);
alter table provision_adjustments add column if not exists household_id uuid references households(id);
alter table savings_goals add column if not exists household_id uuid references households(id);
alter table savings_goal_contributions add column if not exists household_id uuid references households(id);
alter table budgets add column if not exists household_id uuid references households(id);
alter table category_budgets add column if not exists household_id uuid references households(id);
alter table rollovers add column if not exists household_id uuid references households(id);
alter table closed_months add column if not exists household_id uuid references households(id);
alter table credit_card_payments add column if not exists household_id uuid references households(id);

-- --- 6. Migration des données existantes vers UN foyer ---------------------
--
-- Crée le foyer qui représente ton compte actuel et y rattache TOUTES les
-- données déjà présentes (peu importe leur tag "moi"/"madame" — ce tag est
-- un attribut d'affichage, pas une frontière de foyer ; les deux profils
-- restent dans le MÊME foyer, comme aujourd'hui).
--
-- Aucun compte n'est automatiquement rattaché à ce foyer : le compte
-- partagé actuel est ambigu (utilisé comme "Moi" ET "Madame" selon le
-- moment) — impossible de deviner lequel des deux il représente. Voir les
-- instructions à la toute fin de ce fichier pour la suite.
do $$
declare
  v_household_id uuid;
  v_code text;
begin
  -- Ne recrée pas un foyer si cette migration a déjà été exécutée.
  if exists (select 1 from households) then
    raise notice 'Un foyer existe déjà — migration des données ignorée (déjà faite).';
    return;
  end if;

  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (random() * 31)::int + 1, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from households where households.join_code = v_code);
  end loop;

  insert into households (name, join_code) values ('Mon foyer', v_code) returning id into v_household_id;

  update expenses set household_id = v_household_id where household_id is null;
  update incomes set household_id = v_household_id where household_id is null;
  update recurring_expenses set household_id = v_household_id where household_id is null;
  update recurring_incomes set household_id = v_household_id where household_id is null;
  update categories set household_id = v_household_id where household_id is null;
  update provisions set household_id = v_household_id where household_id is null;
  update provision_adjustments set household_id = v_household_id where household_id is null;
  update savings_goals set household_id = v_household_id where household_id is null;
  update savings_goal_contributions set household_id = v_household_id where household_id is null;
  update budgets set household_id = v_household_id where household_id is null;
  update category_budgets set household_id = v_household_id where household_id is null;
  update rollovers set household_id = v_household_id where household_id is null;
  update closed_months set household_id = v_household_id where household_id is null;
  update credit_card_payments set household_id = v_household_id where household_id is null;

  raise notice '=== Foyer créé : % — CODE POUR REJOINDRE : % ===', v_household_id, v_code;
end $$;

-- Rend household_id obligatoire pour tout NOUVEL enregistrement (la
-- migration ci-dessus a déjà rempli les lignes existantes).
alter table expenses alter column household_id set not null;
alter table incomes alter column household_id set not null;
alter table recurring_expenses alter column household_id set not null;
alter table recurring_incomes alter column household_id set not null;
alter table categories alter column household_id set not null;
alter table provisions alter column household_id set not null;
alter table provision_adjustments alter column household_id set not null;
alter table savings_goals alter column household_id set not null;
alter table savings_goal_contributions alter column household_id set not null;
alter table budgets alter column household_id set not null;
alter table category_budgets alter column household_id set not null;
alter table rollovers alter column household_id set not null;
alter table closed_months alter column household_id set not null;
alter table credit_card_payments alter column household_id set not null;

-- --- 7. Remplace les 13 policies permissives par des policies scoped ------

drop policy if exists "authenticated_all_expenses" on expenses;
drop policy if exists "authenticated_all_recurring_expenses" on recurring_expenses;
drop policy if exists "authenticated_all_incomes" on incomes;
drop policy if exists "authenticated_all_recurring_incomes" on recurring_incomes;
drop policy if exists "authenticated_all_categories" on categories;
drop policy if exists "authenticated_all_provisions" on provisions;
drop policy if exists "authenticated_all_provision_adjustments" on provision_adjustments;
drop policy if exists "authenticated_all_savings_goals" on savings_goals;
drop policy if exists "authenticated_all_savings_goal_contributions" on savings_goal_contributions;
drop policy if exists "authenticated_all_budgets" on budgets;
drop policy if exists "authenticated_all_category_budgets" on category_budgets;
drop policy if exists "authenticated_all_rollovers" on rollovers;
drop policy if exists "authenticated_all_closed_months" on closed_months;
drop policy if exists "authenticated_all_credit_card_payments" on credit_card_payments;

create policy "household_scoped_expenses" on expenses
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_recurring_expenses" on recurring_expenses
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_incomes" on incomes
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_recurring_incomes" on recurring_incomes
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_categories" on categories
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_provisions" on provisions
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_provision_adjustments" on provision_adjustments
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_savings_goals" on savings_goals
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_savings_goal_contributions" on savings_goal_contributions
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_budgets" on budgets
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_category_budgets" on category_budgets
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_rollovers" on rollovers
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_closed_months" on closed_months
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());
create policy "household_scoped_credit_card_payments" on credit_card_payments
  for all using (household_id = auth_household_id()) with check (household_id = auth_household_id());

-- ============================================================================
-- À FAIRE MANUELLEMENT APRÈS AVOIR EXÉCUTÉ CETTE MIGRATION :
--
-- 1. Récupère le code du foyer si tu ne l'as pas vu dans les logs :
--      select join_code from households;
--
-- 2. Dans Supabase > Authentication > Users, crée 2 comptes distincts
--    (email + mot de passe) si ce n'est pas déjà fait — un pour toi, un
--    pour Madame. Le compte partagé actuel continuera de fonctionner pour
--    se connecter, mais n'aura AUCUN foyer tant qu'il n'aura pas
--    créé/rejoint un foyer depuis l'app (écran affiché automatiquement à
--    la prochaine connexion si le compte n'a pas encore de foyer).
--
-- 3. Connecte-toi avec le PREMIER compte dans l'app → choisis "Rejoindre
--    un foyer existant" → entre le code de l'étape 1 → choisis ton profil
--    (Moi ou Madame).
--
-- 4. Connecte-toi avec le SECOND compte → même chose, avec l'AUTRE profil.
--
-- 5. Une fois les deux comptes rattachés, vérifie bien que chacun ne voit
--    QUE les données de ce foyer (et rien d'un autre foyer si tu en crées
--    un pour tester).
-- ============================================================================
