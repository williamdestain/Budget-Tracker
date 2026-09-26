-- ============================================================================
-- MIGRATION 026 — create_household()/join_household() renvoient member_id
-- ============================================================================
-- Bug trouvé en nettoyant le repli transitoire owner/memberId côté
-- TypeScript (voir MODELE.md §9.5.2) : les deux fonctions calculent bien un
-- v_member_id en interne (insert into members ... returning id into
-- v_member_id) mais migration-024 ne l'a jamais ajouté à leur valeur de
-- retour. Conséquence concrète :
--   * create_household() : le code appelant lit row.member_id, qui vaut donc
--     toujours undefined → myMemberId se retrouve à null juste après la
--     création d'un foyer (masqué ensuite par loadAll(), qui le corrige au
--     premier chargement des membres).
--   * join_household() : même lacune, mais le bug côté TypeScript était pire
--     — faute d'un member_id à lire, le code stockait le nom affiché tapé
--     par la personne (ownerLabel) dans myMemberId. Ça ne cassait rien par
--     coïncidence fragile (un filet de rattrapage compare aussi par
--     displayName ailleurs dans le store), mais ce n'est pas un vrai id.
--
-- Cette migration ne change aucune règle métier ni aucune colonne de table :
-- seule la valeur RETOURNÉE par les deux fonctions change. join_household()
-- passe de `returns uuid` à `returns table(household_id uuid, member_id
-- uuid)` pour rester symétrique avec create_household() — le code
-- TypeScript est mis à jour dans le même changement pour lire ce nouveau
-- format (voir budget-store.service.ts).
--
-- À exécuter après migration-025-member-management.sql.
--
-- Corrigé le 25 septembre 2026, trouvé en testant join_household() : passer
-- son type de retour à `table (household_id uuid, member_id uuid)` fait de
-- `household_id` une variable de sortie implicite dans tout le corps de la
-- fonction, en plus d'être une colonne de `members`. Les références non
-- qualifiées à `household_id` dans ses clauses WHERE devenaient donc
-- ambiguës (erreur Postgres 42702) — invisible à la création de la
-- fonction, seulement au premier appel. Qualifiées en `members.household_id`
-- ci-dessous. create_household() n'a pas ce problème : aucune de ses
-- requêtes ne référence `household_id` autrement que dans une liste de
-- colonnes cible d'un insert (jamais ambigu).

begin;

drop function if exists create_household(text, text, text);
drop function if exists join_household(text, text, text);

create or replace function create_household(
  p_display_name text,
  p_household_name text default 'Mon foyer',
  p_color text default null
)
returns table (household_id uuid, join_code text, member_id uuid)
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

  return query select v_id, v_code, v_member_id;
end;
$$;

create or replace function join_household(
  p_code text,
  p_display_name text,
  p_color text default null
)
returns table (household_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_member_id uuid;
  v_color text;
  v_used_colors text[];
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

  -- Cas "membre fantôme" (voir migration-024 section 7) : un membre de ce
  -- nom existe déjà dans ce foyer mais n'est encore relié à AUCUN compte
  -- connecté -> on le réclame au lieu d'en créer un second.
  select id into v_member_id from members
    where members.household_id = v_household_id
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
      where members.household_id = v_household_id and lower(display_name) = lower(trim(p_display_name))
    ) then
      raise exception 'Il y a déjà un membre nommé "%" dans ce foyer.', p_display_name;
    end if;

    if p_color is not null and trim(p_color) <> '' then
      v_color := trim(p_color);
    else
      select array_agg(color) into v_used_colors from members where members.household_id = v_household_id;
      v_color := null;
      foreach v_c in array v_palette loop
        if v_used_colors is null or not (v_c = any(v_used_colors)) then
          v_color := v_c;
          exit;
        end if;
      end loop;
      v_color := coalesce(v_color, '#5b665c');
    end if;

    insert into members (household_id, display_name, color, role, active)
      values (v_household_id, trim(p_display_name), v_color, 'member', true)
      returning id into v_member_id;
  end if;

  insert into household_members (household_id, user_id, member_id)
    values (v_household_id, auth.uid(), v_member_id);

  return query select v_household_id, v_member_id;
end;
$$;

grant execute on function create_household(text, text, text) to authenticated;
grant execute on function join_household(text, text, text) to authenticated;

commit;

-- Le cache de schéma PostgREST ne se rafraîchit pas tout seul après un
-- changement de signature de fonction (même leçon que migration-024/§6.4.2
-- pour les tables) : sans ce reload, les appels rpc('join_household', ...)
-- depuis l'appli peuvent continuer à recevoir l'ancienne forme (un uuid nu)
-- jusqu'au prochain redémarrage du pooler PostgREST.
notify pgrst, 'reload schema';

-- Contrôle à exécuter séparément après la migration :
--
-- select proname, prorettype::regtype from pg_proc
-- where proname in ('create_household', 'join_household');
-- -- doit afficher un type "record"/table à 2-3 colonnes pour les deux, pas uuid.
