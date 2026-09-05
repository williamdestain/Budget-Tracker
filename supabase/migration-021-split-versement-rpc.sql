-- Transactions RPC pour la répartition de versement (plan d'action #7,
-- 1/2 — voir migration-022 pour l'import complet).
--
-- splitVersementIntoProvisions() faisait jusqu'ici 1 + N écritures HTTP
-- indépendantes (1 dépense "Versement", puis N ajustements de provision),
-- avec une compensation applicative côté client en cas d'échec partiel
-- (voir BUG-010, AUDIT_PRODUCTION_FUSION.md) : si le réseau coupait entre
-- deux appels, le rollback lui-même pouvait échouer, laissant l'état
-- réellement incohérent — le message d'erreur le disait déjà à
-- l'utilisateur, mais ne l'empêchait pas d'arriver. Cette RPC fait tout
-- dans une seule transaction Postgres : soit tout est écrit, soit rien ne
-- l'est, plus de fenêtre où un échec partiel est possible.
--
-- p_allocations : jsonb, tableau d'objets {"provision_id": uuid,
-- "amount": numeric, "note": text}. Les allocations à 0 $ ou négatives
-- sont silencieusement ignorées (même comportement que l'ancien code
-- client : `if (a.amount > 0)`).
--
-- security invoker (pas definer) : s'exécute avec les droits de
-- l'utilisateur connecté, donc les policies RLS déjà en place sur
-- `expenses` et `provision_adjustments` s'appliquent normalement — cette
-- fonction n'a pas besoin de contourner RLS, juste de grouper plusieurs
-- écritures dans une seule transaction.
--
-- NE remplace PAS la vérification "mois clôturé" (assertMonthOpen), qui
-- reste uniquement côté client comme pour toutes les autres écritures de
-- l'app (aucune table n'a aujourd'hui d'enforcement SQL de cette règle
-- métier — hors scope de #7, qui porte sur l'atomicité, pas sur ce
-- contrôle-là).
--
-- À exécuter une fois dans Supabase > SQL Editor, APRÈS migration-020.

create or replace function split_versement_into_provisions(
  p_sender text,
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
begin
  if v_household_id is null then
    raise exception 'Foyer introuvable pour cet utilisateur.';
  end if;
  if p_sender not in ('moi', 'madame') then
    raise exception 'Owner invalide : %', p_sender;
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Montant de versement invalide : %', p_total_amount;
  end if;

  if p_existing_expense_id is not null then
    -- Versement déjà enregistré indépendamment (voir
    -- splitVersementIntoProvisions côté TS) : on répartit sur une dépense
    -- existante plutôt que d'en créer une nouvelle.
    select id into v_expense_id
      from expenses
      where id = p_existing_expense_id and household_id = v_household_id;
    if v_expense_id is null then
      raise exception 'Versement introuvable.';
    end if;
  else
    insert into expenses (household_id, amount, category, date, owner, cc)
    values (v_household_id, p_total_amount, 'Versement', p_date, p_sender, false)
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

grant execute on function split_versement_into_provisions(text, numeric, date, uuid, jsonb) to authenticated;
