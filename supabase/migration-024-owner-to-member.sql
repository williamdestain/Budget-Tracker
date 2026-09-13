-- ============================================================================
-- MIGRATION 024 — Owner -> Member
-- ============================================================================
-- Cette migration applique MODELE.md §6.2/6.3 :
--   * crée les membres configurables et les invitations ;
--   * crée un membre "Moi" et un membre "Madame" par foyer existant ;
--   * remplace les colonnes owner par member_id dans toutes les tables
--     concernées ;
--   * ajoute la destination explicite des versements historiques ;
--   * conserve toutes les lignes et tous les montants ;
--   * généralise household_members (retire la limite figée à 2 profils) ;
--   * réécrit create_household/join_household/split_versement_into_provisions/
--     import_household_data pour qu'ils continuent de fonctionner ;
--   * repointe accounts.member_id (migration-023) vers members(id).
--
-- Version complétée après relecture : la version précédente créait
-- members/invitations et migrait les 10 tables de données correctement,
-- mais laissait 4 fonctions RPC inchangées alors qu'elles écrivent dans
-- les colonnes que cette migration supprime — testé, elles cassaient
-- immédiatement (create_household/join_household : violation NOT NULL sur
-- household_members.member_id ; split_versement_into_provisions/
-- import_household_data : colonne "owner" inexistante). Ce fichier ajoute
-- les 4 sections manquantes (6 à 9) sans rien changer aux sections 1 à 5
-- déjà validées.
--
-- IMPORTANT :
--   1. Faire une sauvegarde/export avant exécution.
--   2. Exécuter après migration-017-households.sql et migration-023-accounts.sql.
--   3. Cette migration change le contrat SQL de l'application. Le code
--      utilisant Owner doit être déployé avec son équivalent memberId dans
--      la même fenêtre de livraison.
--   4. Le script est volontairement séparé de schema.sql et n'est pas exécuté
--      par ce fichier.
--
-- Couleurs conservées depuis les tokens actuels :
--   Moi    = --owner-moi = #4a6fa1
--   Madame = --pink      = #a15385
--
-- La migration est atomique : toute erreur annule l'ensemble des changements.

begin;

-- --- Préconditions ---------------------------------------------------------

do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'households',
    'household_members',
    'expenses',
    'incomes',
    'provisions',
    'recurring_expenses',
    'recurring_incomes',
    'savings_goals',
    'credit_card_payments',
    'budgets',
    'category_budgets',
    'rollovers'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'Migration 024 : table public.% absente.', required_table;
    end if;
  end loop;
end;
$$;

-- --- 1. Membres configurables et invitations -------------------------------

create table if not exists members (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  role text not null check (role in ('owner', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (household_id, display_name)
);

create table if not exists invitations (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  proposed_role text not null check (proposed_role in ('owner', 'member')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now()
);

-- Lien entre l'authentification existante et le nouveau membre configurable.
alter table household_members
  add column if not exists member_id uuid;

-- Création idempotente des deux membres historiques par foyer. Même un foyer
-- qui n'a encore qu'un seul compte reçoit bien les deux membres historiques :
-- cela préserve la vue "Moi + Madame" pendant la transition du code client.
insert into members (household_id, display_name, color, role)
select h.id, 'Moi', '#4a6fa1',
       case when first_join.first_label = 'moi' then 'owner' else 'member' end
from households h
join (
  select distinct on (household_id)
    household_id, owner_label as first_label
  from household_members
  order by household_id, joined_at, id
) first_join on first_join.household_id = h.id
on conflict (household_id, display_name) do nothing;

insert into members (household_id, display_name, color, role)
select h.id, 'Madame', '#a15385',
       case when first_join.first_label = 'madame' then 'owner' else 'member' end
from households h
join (
  select distinct on (household_id)
    household_id, owner_label as first_label
  from household_members
  order by household_id, joined_at, id
) first_join on first_join.household_id = h.id
on conflict (household_id, display_name) do nothing;

update household_members hm
set member_id = m.id
from members m
where m.household_id = hm.household_id
  and m.display_name = case hm.owner_label
    when 'moi' then 'Moi'
    when 'madame' then 'Madame'
  end;

alter table household_members
  alter column member_id set not null;

alter table household_members
  add constraint household_members_member_id_fk
  foreign key (member_id) references members(id) on delete restrict;

-- --- 2. Ajouter les nouvelles références avant de supprimer Owner ----------

alter table expenses
  add column member_id uuid,
  add column versement_to_member_id uuid;
alter table incomes add column member_id uuid;
alter table provisions add column member_id uuid;
alter table recurring_expenses add column member_id uuid;
alter table recurring_incomes add column member_id uuid;
alter table savings_goals add column member_id uuid;
alter table credit_card_payments add column member_id uuid;
alter table budgets add column member_id uuid;
alter table category_budgets add column member_id uuid;
alter table rollovers add column member_id uuid;

-- Le mapping reste dans le foyer : aucune valeur Owner d'un foyer ne peut
-- pointer vers le membre d'un autre foyer.
update expenses e
set member_id = m.id
from members m
where m.household_id = e.household_id
  and m.display_name = case e.owner when 'moi' then 'Moi' else 'Madame' end;

update incomes i
set member_id = m.id
from members m
where m.household_id = i.household_id
  and m.display_name = case i.owner when 'moi' then 'Moi' else 'Madame' end;

update provisions p
set member_id = m.id
from members m
where m.household_id = p.household_id
  and m.display_name = case p.owner when 'moi' then 'Moi' else 'Madame' end;

update recurring_expenses r
set member_id = m.id
from members m
where m.household_id = r.household_id
  and m.display_name = case r.owner when 'moi' then 'Moi' else 'Madame' end;

update recurring_incomes r
set member_id = m.id
from members m
where m.household_id = r.household_id
  and m.display_name = case r.owner when 'moi' then 'Moi' else 'Madame' end;

update savings_goals g
set member_id = m.id
from members m
where m.household_id = g.household_id
  and m.display_name = case g.owner when 'moi' then 'Moi' else 'Madame' end;

update credit_card_payments p
set member_id = m.id
from members m
where m.household_id = p.household_id
  and m.display_name = case p.owner when 'moi' then 'Moi' else 'Madame' end;

update budgets b
set member_id = m.id
from members m
where m.household_id = b.household_id
  and m.display_name = case b.owner when 'moi' then 'Moi' else 'Madame' end;

update category_budgets b
set member_id = m.id
from members m
where m.household_id = b.household_id
  and m.display_name = case b.owner when 'moi' then 'Moi' else 'Madame' end;

update rollovers r
set member_id = m.id
from members m
where m.household_id = r.household_id
  and m.display_name = case r.owner when 'moi' then 'Moi' else 'Madame' end;

-- Un versement historique allait implicitement à l'autre profil.
update expenses e
set versement_to_member_id = recipient.id
from members sender, members recipient
where e.category = 'Versement'
  and sender.id = e.member_id
  and recipient.household_id = e.household_id
  and recipient.id <> sender.id
  and recipient.active;

-- Aucun Owner ne doit rester sans membre avant la conversion de structure.
do $$
declare
  table_name text;
  missing_count bigint;
begin
  foreach table_name in array array[
    'expenses', 'incomes', 'provisions', 'recurring_expenses',
    'recurring_incomes', 'savings_goals', 'credit_card_payments',
    'budgets', 'category_budgets', 'rollovers'
  ] loop
    execute format('select count(*) from %I where member_id is null', table_name)
      into missing_count;
    if missing_count > 0 then
      raise exception 'Migration 024 : % lignes sans member_id dans %.', missing_count, table_name;
    end if;
  end loop;
end;
$$;

-- --- 3. Remplacer les contraintes Owner par des références Member ---------

alter table expenses
  alter column member_id set not null,
  add constraint expenses_member_id_fk foreign key (member_id) references members(id),
  add constraint expenses_versement_to_member_id_fk
    foreign key (versement_to_member_id) references members(id);
alter table incomes
  alter column member_id set not null,
  add constraint incomes_member_id_fk foreign key (member_id) references members(id);
alter table provisions
  alter column member_id set not null,
  add constraint provisions_member_id_fk foreign key (member_id) references members(id);
alter table recurring_expenses
  alter column member_id set not null,
  add constraint recurring_expenses_member_id_fk foreign key (member_id) references members(id);
alter table recurring_incomes
  alter column member_id set not null,
  add constraint recurring_incomes_member_id_fk foreign key (member_id) references members(id);
alter table savings_goals
  alter column member_id set not null,
  add constraint savings_goals_member_id_fk foreign key (member_id) references members(id);
alter table credit_card_payments
  alter column member_id set not null,
  add constraint credit_card_payments_member_id_fk foreign key (member_id) references members(id);

-- Les clés de budgets incluent désormais le membre dynamique.
alter table budgets
  drop constraint budgets_pkey,
  alter column member_id set not null,
  add constraint budgets_member_id_fk foreign key (member_id) references members(id),
  add primary key (household_id, member_id, ym);

alter table category_budgets
  drop constraint category_budgets_pkey,
  alter column member_id set not null,
  add constraint category_budgets_member_id_fk foreign key (member_id) references members(id),
  add primary key (household_id, member_id, ym, category);

alter table rollovers
  drop constraint rollovers_pkey,
  alter column member_id set not null,
  add constraint rollovers_member_id_fk foreign key (member_id) references members(id),
  add primary key (household_id, member_id, ym);

-- Les anciennes colonnes et leur contrainte Owner disparaissent uniquement
-- après que toutes les valeurs ont été converties et protégées par FK.
alter table expenses drop column owner;
alter table incomes drop column owner;
alter table provisions drop column owner;
alter table recurring_expenses drop column owner;
alter table recurring_incomes drop column owner;
alter table savings_goals drop column owner;
alter table credit_card_payments drop column owner;
alter table budgets drop column owner;
alter table category_budgets drop column owner;
alter table rollovers drop column owner;

-- --- 4. RLS des nouvelles tables -------------------------------------------

alter table members enable row level security;
alter table invitations enable row level security;

create policy "household_scoped_members" on members
  for all using (household_id = auth_household_id())
  with check (household_id = auth_household_id());

create policy "household_scoped_invitations" on invitations
  for all using (household_id = auth_household_id())
  with check (household_id = auth_household_id());

create index if not exists members_household_id_idx on members (household_id);
create index if not exists members_active_idx on members (household_id, active);
create index if not exists invitations_household_status_idx
  on invitations (household_id, status);

-- ============================================================================
-- --- 5. Généraliser household_members : retirer la limite figée à 2 profils
-- ============================================================================
--
-- Jusqu'ici, cette table (qui relie un compte connecté à un foyer) exigeait
-- owner_label in ('moi','madame') et un seul de chaque par foyer. Sans cette
-- étape, un vrai 3e/4e membre ne pourrait JAMAIS rejoindre l'appli, même
-- après avoir réparé les fonctions RPC plus bas : la table members serait
-- généralisée, mais la porte d'entrée (household_members) resterait figée.
--
-- owner_label est conservée (historique uniquement) mais devient facultative
-- et n'est plus contrainte : aucune ligne existante n'est perdue, et rien
-- n'oblige les nouvelles lignes à la renseigner.

alter table household_members drop constraint if exists household_members_owner_label_check;
alter table household_members drop constraint if exists household_members_household_id_owner_label_key;
alter table household_members alter column owner_label drop not null;

comment on column household_members.owner_label is
  'Historique uniquement (pré-généralisation des membres, MODELE.md section 6). Ne plus lire ni écrire cette colonne — utiliser members via household_members.member_id.';

-- ============================================================================
-- --- 6. Repointer accounts.member_id (migration-023) vers members(id) -----
-- ============================================================================
--
-- accounts.member_id référençait household_members(id) (le compte connecté)
-- plutôt que members(id) (le profil généralisé) : cohérent avant cette
-- migration, incohérent après (2 notions différentes de "membre" auraient
-- coexisté). Aucune ligne n'est perdue : chaque valeur existante est
-- traduite via le lien household_members.member_id déjà établi en section 1.

do $$
begin
  if to_regclass('public.accounts') is not null then
    -- L'ancienne contrainte (-> household_members) doit être retirée AVANT
    -- la mise à jour des valeurs : tant qu'elle est active, Postgres refuse
    -- d'écrire un id de `members` dans une colonne encore contrainte à
    -- pointer vers `household_members`.
    alter table accounts drop constraint if exists accounts_member_id_fkey;

    update accounts a
    set member_id = hm.member_id
    from household_members hm
    where a.member_id = hm.id;

    alter table accounts
      add constraint accounts_member_id_fkey
      foreign key (member_id) references members(id) on delete set null;
  else
    raise notice 'Table accounts absente (migration-023 pas encore exécutée dans ce projet) — étape 6 ignorée, rien à repointer.';
  end if;
end;
$$;

-- ============================================================================
-- --- 7. create_household / join_household : nom affiché + members ---------
-- ============================================================================
--
-- join_household() gère un cas particulier : la section 1 a pu créer un
-- membre "fantôme" (ex. "Madame") pour un foyer qui n'avait encore qu'un
-- seul compte connecté. Quand cette personne rejoint réellement le foyer,
-- on la relie à CE membre existant plutôt que d'en créer un second — sans
-- quoi la contrainte unique(household_id, display_name) refuserait la
-- création et bloquerait l'arrivée du 2e compte.

drop function if exists create_household(text, text);
drop function if exists join_household(text, text);

create or replace function create_household(
  p_display_name text,
  p_household_name text default 'Mon foyer',
  p_color text default null
)
returns table (household_id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_color text;
  v_member_id uuid;
begin
  if p_display_name is null or char_length(trim(p_display_name)) = 0 then
    raise exception 'Le nom affiché est requis.';
  end if;
  if char_length(p_display_name) > 100 then
    raise exception 'Nom affiché trop long (100 caractères maximum).';
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Ce compte appartient déjà à un foyer.';
  end if;

  -- Même bleu que --owner-moi (styles.scss) : le créateur d'un nouveau
  -- foyer garde la couleur qu'avait le profil "Moi" avant la généralisation.
  v_color := coalesce(nullif(trim(p_color), ''), '#4a6fa1');

  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (random() * 31)::int + 1, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from households where households.join_code = v_code);
  end loop;

  insert into households (name, join_code) values (p_household_name, v_code) returning id into v_id;

  insert into members (household_id, display_name, color, role, active)
    values (v_id, trim(p_display_name), v_color, 'owner', true)
    returning id into v_member_id;

  insert into household_members (household_id, user_id, member_id)
    values (v_id, auth.uid(), v_member_id);

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

create or replace function join_household(
  p_code text,
  p_display_name text,
  p_color text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_member_id uuid;
  v_color text;
  v_used_colors text[];
  -- Palette de repli quand aucune couleur n'est fournie : mêmes 2 premières
  -- valeurs que --owner-moi/--pink pour rester cohérent avec les foyers déjà
  -- migrés, puis --amber/--teal (déjà définies dans styles.scss, --teal
  -- étant inutilisée jusqu'ici) pour un 3e/4e membre.
  v_palette text[] := array['#4a6fa1', '#a15385', '#bf8f2e', '#0f9d8f'];
  v_c text;
begin
  if p_display_name is null or char_length(trim(p_display_name)) = 0 then
    raise exception 'Le nom affiché est requis.';
  end if;
  if char_length(p_display_name) > 100 then
    raise exception 'Nom affiché trop long (100 caractères maximum).';
  end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Ce compte appartient déjà à un foyer.';
  end if;

  select id into v_household_id from households where households.join_code = upper(trim(p_code));
  if v_household_id is null then
    raise exception 'Code invalide.';
  end if;

  -- Cas "membre fantôme" (voir section 1) : un membre de ce nom existe déjà
  -- dans ce foyer mais n'est encore relié à AUCUN compte connecté -> on le
  -- réclame au lieu d'en créer un second.
  select id into v_member_id from members
    where household_id = v_household_id
      and lower(display_name) = lower(trim(p_display_name))
      and not exists (
        select 1 from household_members hm where hm.member_id = members.id
      );

  if v_member_id is not null then
    if p_color is not null and trim(p_color) <> '' then
      update members set color = trim(p_color) where id = v_member_id;
    end if;
  else
    if exists (
      select 1 from members
      where household_id = v_household_id and lower(display_name) = lower(trim(p_display_name))
    ) then
      raise exception 'Il y a déjà un membre nommé "%" dans ce foyer.', p_display_name;
    end if;

    if p_color is not null and trim(p_color) <> '' then
      v_color := trim(p_color);
    else
      select array_agg(color) into v_used_colors from members where household_id = v_household_id;
      v_color := null;
      foreach v_c in array v_palette loop
        if v_used_colors is null or not (v_c = any(v_used_colors)) then
          v_color := v_c;
          exit;
        end if;
      end loop;
      -- Repli si la palette de 4 est épuisée (5e membre ou plus) : gris
      -- neutre plutôt qu'une collision silencieuse de couleur.
      v_color := coalesce(v_color, '#5b665c');
    end if;

    insert into members (household_id, display_name, color, role, active)
      values (v_household_id, trim(p_display_name), v_color, 'member', true)
      returning id into v_member_id;
  end if;

  insert into household_members (household_id, user_id, member_id)
    values (v_household_id, auth.uid(), v_member_id);

  return v_household_id;
end;
$$;

grant execute on function create_household(text, text, text) to authenticated;
grant execute on function join_household(text, text, text) to authenticated;

-- ============================================================================
-- --- 8. split_versement_into_provisions : memberId au lieu d'un owner texte
-- ============================================================================

drop function if exists split_versement_into_provisions(text, numeric, date, uuid, jsonb);

create or replace function split_versement_into_provisions(
  p_sender_member_id uuid,
  p_total_amount numeric,
  p_date date,
  p_existing_expense_id uuid,
  p_allocations jsonb
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_household_id uuid := auth_household_id();
  v_expense_id uuid;
  v_alloc jsonb;
  v_amount numeric;
  v_adjustment_id uuid;
  v_adjustment_ids uuid[] := '{}';
  v_recipient_id uuid;
begin
  if v_household_id is null then
    raise exception 'Foyer introuvable pour cet utilisateur.';
  end if;
  if not exists (
    select 1 from members
    where id = p_sender_member_id and household_id = v_household_id
  ) then
    raise exception 'Membre émetteur invalide : %', p_sender_member_id;
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Montant de versement invalide : %', p_total_amount;
  end if;

  if p_existing_expense_id is not null then
    select id into v_expense_id
      from expenses
      where id = p_existing_expense_id and household_id = v_household_id;
    if v_expense_id is null then
      raise exception 'Versement introuvable.';
    end if;
  else
    -- Même règle qu'avant la généralisation (versement destiné à "l'autre"
    -- membre) tant que le foyer a exactement 2 membres actifs ; au-delà, le
    -- destinataire devra être précisé côté appelant (évolution future de
    -- l'UI de répartition, hors scope de cette migration).
    select id into v_recipient_id from members
      where household_id = v_household_id and active and id <> p_sender_member_id
      limit 1;

    insert into expenses (household_id, amount, category, date, member_id, versement_to_member_id, cc)
    values (v_household_id, p_total_amount, 'Versement', p_date, p_sender_member_id, v_recipient_id, false)
    returning id into v_expense_id;
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_amount := (v_alloc->>'amount')::numeric;
    if v_amount is not null and v_amount > 0 then
      insert into provision_adjustments (household_id, provision_id, amount, date, note, versement_expense_id)
      values (
        v_household_id,
        (v_alloc->>'provision_id')::uuid,
        v_amount,
        p_date,
        coalesce(v_alloc->>'note', ''),
        v_expense_id
      )
      returning id into v_adjustment_id;
      v_adjustment_ids := array_append(v_adjustment_ids, v_adjustment_id);
    end if;
  end loop;

  return jsonb_build_object('expense_id', v_expense_id, 'adjustment_ids', v_adjustment_ids);
end;
$$;

grant execute on function split_versement_into_provisions(uuid, numeric, date, uuid, jsonb) to authenticated;

-- ============================================================================
-- --- 9. import_household_data : member_id au lieu de owner dans chaque jeu
-- ============================================================================
--
-- Même signature qu'avant (tous les paramètres restent jsonb) : pas besoin
-- de drop, `create or replace` suffit. Seuls les noms de colonnes attendus
-- dans chaque jsonb_to_recordset changent (owner text -> member_id uuid), et
-- expenses gagne versement_to_member_id.

create or replace function import_household_data(
  p_provisions jsonb default '[]'::jsonb,
  p_provision_adjustments jsonb default '[]'::jsonb,
  p_savings_goals jsonb default '[]'::jsonb,
  p_savings_goal_contributions jsonb default '[]'::jsonb,
  p_recurring_expenses jsonb default '[]'::jsonb,
  p_recurring_incomes jsonb default '[]'::jsonb,
  p_categories jsonb default '[]'::jsonb,
  p_credit_card_payments jsonb default '[]'::jsonb,
  p_expenses jsonb default '[]'::jsonb,
  p_incomes jsonb default '[]'::jsonb,
  p_budgets jsonb default '[]'::jsonb,
  p_rollovers jsonb default '[]'::jsonb,
  p_category_budgets jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
as $$
begin
  perform reset_everything();

  insert into provisions (
    id, household_id, name, amount, every_n, interval_unit, start_ym, start_date,
    category, member_id, auto_recalibrate, allocation_percent, rolling_count, monthly_reminder
  )
  select id, household_id, name, amount, every_n, interval_unit, start_ym, start_date,
         category, member_id, auto_recalibrate, allocation_percent, rolling_count, monthly_reminder
  from jsonb_to_recordset(p_provisions) as x(
    id uuid, household_id uuid, name text, amount numeric, every_n integer,
    interval_unit text, start_ym text, start_date date, category text, member_id uuid,
    auto_recalibrate boolean, allocation_percent numeric, rolling_count integer,
    monthly_reminder numeric
  );

  insert into provision_adjustments (id, household_id, provision_id, amount, date, note)
  select id, household_id, provision_id, amount, date, note
  from jsonb_to_recordset(p_provision_adjustments) as x(
    id uuid, household_id uuid, provision_id uuid, amount numeric, date date, note text
  );

  insert into savings_goals (id, household_id, name, target_amount, target_date, member_id)
  select id, household_id, name, target_amount, target_date, member_id
  from jsonb_to_recordset(p_savings_goals) as x(
    id uuid, household_id uuid, name text, target_amount numeric, target_date date, member_id uuid
  );

  insert into savings_goal_contributions (id, household_id, savings_goal_id, amount, date, note)
  select id, household_id, savings_goal_id, amount, date, note
  from jsonb_to_recordset(p_savings_goal_contributions) as x(
    id uuid, household_id uuid, savings_goal_id uuid, amount numeric, date date, note text
  );

  insert into recurring_expenses (
    id, household_id, name, amount, category, member_id, day_of_month, cc, active
  )
  select id, household_id, name, amount, category, member_id, day_of_month, cc, active
  from jsonb_to_recordset(p_recurring_expenses) as x(
    id uuid, household_id uuid, name text, amount numeric, category text, member_id uuid,
    day_of_month integer, cc boolean, active boolean
  );

  -- Doit venir AVANT incomes (incomes.recurring_source_id référence
  -- recurring_incomes(id)).
  insert into recurring_incomes (
    id, household_id, amount, type, member_id, note, interval, day_of_month,
    second_day_of_month, start_date, active
  )
  select id, household_id, amount, type, member_id, note, interval, day_of_month,
         second_day_of_month, start_date, active
  from jsonb_to_recordset(p_recurring_incomes) as x(
    id uuid, household_id uuid, amount numeric, type text, member_id uuid, note text,
    interval text, day_of_month integer, second_day_of_month integer, start_date date,
    active boolean
  );

  insert into categories (id, household_id, name, color, archived, sort_order)
  select id, household_id, name, color, archived, sort_order
  from jsonb_to_recordset(p_categories) as x(
    id uuid, household_id uuid, name text, color text, archived boolean, sort_order integer
  );

  insert into credit_card_payments (id, household_id, member_id, amount, date, note)
  select id, household_id, member_id, amount, date, note
  from jsonb_to_recordset(p_credit_card_payments) as x(
    id uuid, household_id uuid, member_id uuid, amount numeric, date date, note text
  );

  -- Doit venir APRÈS recurring_expenses (recurring_source_id).
  insert into expenses (id, household_id, amount, category, date, member_id, versement_to_member_id, cc, recurring_source_id)
  select id, household_id, amount, category, date, member_id, versement_to_member_id, cc, recurring_source_id
  from jsonb_to_recordset(p_expenses) as x(
    id uuid, household_id uuid, amount numeric, category text, date date, member_id uuid,
    versement_to_member_id uuid, cc boolean, recurring_source_id uuid
  );

  -- Doit venir APRÈS recurring_incomes (recurring_source_id).
  insert into incomes (
    id, household_id, amount, type, date, member_id, note, recurring,
    recurring_interval, recurring_start_month, recurring_source_id
  )
  select id, household_id, amount, type, date, member_id, note, recurring,
         recurring_interval, recurring_start_month, recurring_source_id
  from jsonb_to_recordset(p_incomes) as x(
    id uuid, household_id uuid, amount numeric, type text, date date, member_id uuid,
    note text, recurring boolean, recurring_interval text, recurring_start_month text,
    recurring_source_id uuid
  );

  insert into budgets (household_id, member_id, ym, amount)
  select household_id, member_id, ym, amount
  from jsonb_to_recordset(p_budgets) as x(household_id uuid, member_id uuid, ym text, amount numeric);

  insert into rollovers (household_id, member_id, ym, amount)
  select household_id, member_id, ym, amount
  from jsonb_to_recordset(p_rollovers) as x(household_id uuid, member_id uuid, ym text, amount numeric);

  insert into category_budgets (household_id, member_id, ym, category, amount)
  select household_id, member_id, ym, category, amount
  from jsonb_to_recordset(p_category_budgets) as x(
    household_id uuid, member_id uuid, ym text, category text, amount numeric
  );
end;
$$;

commit;

-- Contrôles de lecture à exécuter séparément après la migration :
--
-- select household_id, count(*) from members group by household_id;
-- select table_name, column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and column_name in ('owner', 'member_id', 'versement_to_member_id')
-- order by table_name, column_name;
-- select count(*) from expenses
-- where category = 'Versement' and versement_to_member_id is null;
-- select id, name, member_id from accounts;  -- doit référencer members(id) désormais
