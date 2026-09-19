-- ============================================================================
-- MIGRATION 025 — Gestion des membres (Paramètres)
-- ============================================================================
-- Prépare le terrain pour un futur écran Paramètres : renommer un membre,
-- changer sa couleur, le désactiver.
--
-- Découverte en préparant cette migration, vérifiée avec un rôle Postgres à
-- privilèges limités (pas en superutilisateur, pour que le RLS s'applique
-- vraiment) : les policies `household_scoped_members` et
-- `household_scoped_invitations` créées par migration-024 sont des policies
-- `FOR ALL`, donc renommer un membre ou changer sa couleur fonctionne DÉJÀ
-- aujourd'hui par une simple écriture directe :
--
--   supabase.from('members').update({ display_name, color }).eq('id', memberId)
--
-- Testé : un utilisateur peut modifier un membre de SON foyer, et se fait
-- bloquer silencieusement (0 ligne affectée) s'il tente de modifier un
-- membre d'un AUTRE foyer. Aucune RPC n'est donc nécessaire pour renommer
-- ou changer la couleur — voir MODELE.md section 9 pour ne pas dupliquer ce
-- travail plus tard en écrivant des RPC inutiles.
--
-- Ce qui a vraiment besoin d'une RPC, c'est la SEULE opération qui touche à
-- plusieurs lignes à la fois et qui a une règle métier à faire respecter :
-- désactiver un membre ne doit jamais laisser un foyer sans aucun membre
-- actif (le tableau de bord, le sélecteur de membre, etc. supposent tous
-- qu'il en existe au moins un). Une policy RLS ne peut pas exprimer cette
-- règle (elle ne voit qu'une ligne à la fois) — d'où la fonction ci-dessous.
--
-- Les invitations ne sont pas traitées ici : la table existe (migration-024)
-- et ses policies permettent déjà l'écriture directe, mais l'appli n'a
-- aujourd'hui aucun mécanisme d'envoi d'email — construire les RPC
-- correspondantes maintenant créerait de la plomberie inutilisée. Le rejoint
-- de foyer actuel (code à partager manuellement) reste la seule voie
-- d'entrée tant que ce besoin ne se confirme pas.
--
-- À exécuter après migration-024-owner-to-member.sql.

-- --- Préconditions -----------------------------------------------------

do $$
begin
  if to_regclass('public.members') is null then
    raise exception 'Migration 025 : table public.members absente (exécutez migration-024 d''abord).';
  end if;
end;
$$;

-- --- 1. Durcir les policies existantes : restreintes à "authenticated" -----
--
-- Comportement inchangé (auth_household_id() renvoie déjà NULL pour un
-- appelant anonyme, donc `household_id = NULL` ne matche jamais) — ceci
-- documente l'intention explicitement plutôt que de compter sur cet effet
-- de bord, et aligne members/invitations sur la convention du reste du
-- schéma (households, expenses, etc., toutes restreintes à authenticated).

drop policy if exists "household_scoped_members" on members;
create policy "household_scoped_members" on members
  for all
  to authenticated
  using (household_id = auth_household_id())
  with check (household_id = auth_household_id());

drop policy if exists "household_scoped_invitations" on invitations;
create policy "household_scoped_invitations" on invitations
  for all
  to authenticated
  using (household_id = auth_household_id())
  with check (household_id = auth_household_id());

-- --- 2. La seule RPC nécessaire : désactivation protégée --------------------

create or replace function set_household_member_active(
  p_member_id uuid,
  p_active boolean
)
returns void
language plpgsql
security invoker
as $$
declare
  v_household_id uuid := auth_household_id();
  v_other_active_count int;
begin
  if v_household_id is null then
    raise exception 'Foyer introuvable pour cet utilisateur.';
  end if;
  if not exists (
    select 1 from members where id = p_member_id and household_id = v_household_id
  ) then
    raise exception 'Membre introuvable dans ce foyer.';
  end if;

  if not p_active then
    select count(*) into v_other_active_count
      from members
      where household_id = v_household_id and active and id <> p_member_id;
    if v_other_active_count = 0 then
      raise exception 'Impossible de désactiver le dernier membre actif du foyer.';
    end if;
  end if;

  update members set active = p_active where id = p_member_id;
end;
$$;

grant execute on function set_household_member_active(uuid, boolean) to authenticated;

-- `security invoker` (pas `security definer`, contrairement à
-- create_household/join_household) : la policy `household_scoped_members`
-- ci-dessus fait déjà tout le travail de filtrage nécessaire pour l'UPDATE
-- final, la fonction n'a besoin d'élever ses privilèges que pour la garde
-- métier (compter les membres actifs) — pas de raison de lui donner plus.
