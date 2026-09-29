-- ============================================================================
-- TESTS SQL — create_household() / join_household() (migration 026)
-- ============================================================================
-- 37 vérifications sur un vrai Postgres, exécutées avec les rôles
-- `authenticated` / `anon` (donc avec les vraies règles d'accès), couvrant
-- CHAQUE chemin de code des deux fonctions : création, adhésion d'un nouveau
-- membre, réclamation d'un membre « fantôme » (migration 024 §7), palette de
-- couleurs, tous les messages d'erreur, atomicité (aucune ligne partielle
-- après un échec), signatures uniques (pas d'ambiguïté PostgREST) et droits.
--
-- Pourquoi ce fichier existe : le bug 42702 de la 026 (référence ambiguë à
-- `household_id`) était INVISIBLE à la création de la fonction et n'éclatait
-- qu'au premier appel — seule une exécution réelle de chaque chemin le voit.
--
-- Ne se lance pas seul : passer par `supabase/tests/run.sh`, qui prépare la
-- base (schema.sql → données héritées → 024 → 025 → 026).
-- ============================================================================
\set ON_ERROR_STOP off
create table test_log(n serial primary key, name text, ok boolean, detail text);
grant all on test_log to authenticated, anon; grant usage on all sequences in schema public to authenticated, anon;
insert into auth.users(id,email)
  select ('00000000-0000-0000-0000-0000000000' || lpad(g::text,2,'0'))::uuid, 'n'||g||'@test' from generate_series(1,20) g;

create or replace function public.as_user(p uuid) returns void language plpgsql as
$$ begin perform set_config('request.jwt.claim.sub', coalesce(p::text,''), false); end $$;

create or replace function public.expect_err(p_name text, p_sql text, p_expected text) returns void language plpgsql as $$
declare before_h int; before_m int; before_hm int; after_h int; after_m int; after_hm int;
begin
  reset role; select count(*) into before_h from households; select count(*) into before_m from members; select count(*) into before_hm from household_members; set role authenticated;
  begin
    execute p_sql;
    insert into test_log(name, ok, detail) values (p_name, false, 'AUCUNE erreur levée');
  exception when others then
    insert into test_log(name, ok, detail) values (p_name, sqlerrm like p_expected, sqlstate||' '||sqlerrm);
  end;
  reset role; select count(*) into after_h from households; select count(*) into after_m from members; select count(*) into after_hm from household_members; set role authenticated;
  insert into test_log(name, ok, detail) values (p_name||' → aucune ligne partielle', (before_h,before_m,before_hm)=(after_h,after_m,after_hm), before_h||'/'||before_m||'/'||before_hm||' -> '||after_h||'/'||after_m||'/'||after_hm);
end $$;
grant execute on function public.expect_err(text,text,text) to authenticated;

-- ===== T1 : create_household renvoie household_id + join_code + member_id, et le member_id est le VRAI =====
select as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ declare r record; begin
  select * into r from create_household('  Alice  ', 'Foyer Alice');
  insert into test_log(name, ok, detail) values
   ('T1a create_household : 3 colonnes non nulles', r.household_id is not null and r.join_code ~ '^[A-HJKMNP-Z2-9]{6}$' and r.member_id is not null, row_to_json(r)::text);
  insert into test_log(name, ok, detail)
   select 'T1b member_id renvoyé = membre "Alice" (owner, actif, nom nettoyé) de CE foyer',
          m.display_name = 'Alice' and m.role = 'owner' and m.active and m.household_id = r.household_id, row_to_json(m)::text
   from members m where m.id = r.member_id;
  insert into test_log(name, ok, detail)
   select 'T1c household_members relie le compte au member_id renvoyé', count(*) = 1, count(*)::text
   from household_members where user_id = '00000000-0000-0000-0000-000000000001' and member_id = r.member_id;
  insert into test_log(name, ok, detail)
   select 'T1d 32 catégories par défaut créées', count(*) = 32, count(*)::text from categories where household_id = r.household_id;
  perform set_config('t.h_alice', r.household_id::text, false);
  perform set_config('t.code_alice', r.join_code, false);
exception when others then insert into test_log(name, ok, detail) values ('T1 create_household', false, sqlstate||' '||sqlerrm); end $$;

-- ===== T2 : join_household (nouveau membre) sur le foyer d'Alice, avec code en minuscules + espaces =====
select as_user('00000000-0000-0000-0000-000000000002');
do $$ declare r record; begin
  select * into r from join_household('  ' || lower(current_setting('t.code_alice')) || ' ', ' Bob ');
  insert into test_log(name, ok, detail) values
   ('T2a join_household : renvoie household_id + member_id', r.household_id = current_setting('t.h_alice')::uuid and r.member_id is not null, row_to_json(r)::text);
  insert into test_log(name, ok, detail)
   select 'T2b member_id = nouveau membre "Bob", rôle member, couleur palette #1 libre', m.display_name='Bob' and m.role='member' and m.color <> '#4a6fa1', row_to_json(m)::text
   from members m where m.id = r.member_id;
  insert into test_log(name, ok, detail)
   select 'T2c compte relié au member_id renvoyé (plus le nom tapé !)', count(*)=1, count(*)::text
   from household_members where user_id='00000000-0000-0000-0000-000000000002' and member_id = r.member_id;
exception when others then insert into test_log(name, ok, detail) values ('T2 join nouveau membre', false, sqlstate||' '||sqlerrm); end $$;

-- ===== T3 : join_household RÉCLAME le membre fantôme (foyer BBBBBB, "madame" en minuscules) =====
select as_user('00000000-0000-0000-0000-000000000003');
do $$ declare r record; before_n int; after_n int; ghost uuid; begin
  reset role;
  select id into ghost from members where household_id='22222222-2222-2222-2222-222222222222' and display_name='Madame';
  select count(*) into before_n from members where household_id='22222222-2222-2222-2222-222222222222';
  set role authenticated;
  select * into r from join_household('BBBBBB', 'madame', '#123456');
  reset role;
  select count(*) into after_n from members where household_id='22222222-2222-2222-2222-222222222222';
  insert into test_log(name, ok, detail) values
   ('T3a fantôme réclamé : member_id renvoyé = id du fantôme existant', r.member_id = ghost, r.member_id||' vs '||ghost);
  insert into test_log(name, ok, detail) values
   ('T3b aucun doublon créé (nb membres inchangé)', before_n = after_n, before_n||' -> '||after_n);
  insert into test_log(name, ok, detail)
   select 'T3c couleur fournie appliquée au fantôme réclamé', color='#123456', color from members where id=ghost;
  insert into test_log(name, ok, detail)
   select 'T3d les données historiques de Madame restent rattachées au même member_id', count(*)=2, count(*)::text
   from (select member_id from expenses where household_id='22222222-2222-2222-2222-222222222222' and member_id=ghost
         union all select member_id from incomes where household_id='22222222-2222-2222-2222-222222222222' and member_id=ghost) x;
  set role authenticated;
exception when others then reset role; insert into test_log(name, ok, detail) values ('T3 fantôme', false, sqlstate||' '||sqlerrm); set role authenticated; end $$;

-- ===== T4 : palette de couleurs : 3e, 4e puis 5e membre (repli gris) =====
do $$ declare r record; c1 text; c2 text; c3 text; begin
  perform as_user('00000000-0000-0000-0000-000000000004'); select * into r from join_household(current_setting('t.code_alice'),'Carl');
  select color into c1 from members where id=r.member_id;
  perform as_user('00000000-0000-0000-0000-000000000005'); select * into r from join_household(current_setting('t.code_alice'),'Dina');
  select color into c2 from members where id=r.member_id;
  perform as_user('00000000-0000-0000-0000-000000000006'); select * into r from join_household(current_setting('t.code_alice'),'Emma');
  select color into c3 from members where id=r.member_id;
  insert into test_log(name, ok, detail) values ('T4 couleurs 3e/4e/5e membre : palette puis repli gris', c1||c2||c3 <> '' and c3='#5b665c' and c1<>c2, c1||' '||c2||' '||c3);
exception when others then insert into test_log(name, ok, detail) values ('T4 palette', false, sqlstate||' '||sqlerrm); end $$;

-- ===== T5 : chemins d'ERREUR : message exact + aucune ligne partielle =====


select as_user('00000000-0000-0000-0000-000000000007');
select expect_err('T5a code invalide',                  $$select * from join_household('ZZZZZZ','Zoé')$$,            'Code invalide.');
select expect_err('T5b nom vide (join)',                $$select * from join_household('AAAAAA','   ')$$,            'Le nom affiché est requis.');
select expect_err('T5c nom NULL (create)',              $$select * from create_household(null)$$,                    'Le nom affiché est requis.');
select expect_err('T5d nom > 100 car. (join)',          $$select * from join_household('AAAAAA', repeat('x',101))$$,  'Nom affiché trop long%');
select expect_err('T5e nom > 100 car. (create)',        $$select * from create_household(repeat('x',101))$$,          'Nom affiché trop long%');
select expect_err('T5f nom déjà pris par un membre relié à un compte (casse ignorée)', $$select * from join_household('AAAAAA','MOI')$$, 'Il y a déjà un membre nommé%');
select expect_err('T5i fantôme DÉJÀ réclamé : un 2e compte ne peut pas le reprendre', $$select * from join_household('BBBBBB','Madame')$$, 'Il y a déjà un membre nommé%');
select as_user('00000000-0000-0000-0000-000000000001');
select expect_err('T5g compte déjà dans un foyer (create)', $$select * from create_household('Autre')$$,             'Ce compte appartient déjà à un foyer.');
select expect_err('T5h compte déjà dans un foyer (join)',   $$select * from join_household('AAAAAA','Autre')$$,       'Ce compte appartient déjà à un foyer.');

-- ===== T6 : un utilisateur NON authentifié (anon, sans sub) ne peut rien créer =====
reset role; select as_user(null); set role anon;
do $$ declare n int; begin
  begin perform * from create_household('Intrus'); insert into test_log(name, ok, detail) values ('T6 anon create_household refusé', false, 'aucune erreur');
  exception when others then insert into test_log(name, ok, detail) values ('T6 anon create_household refusé', true, sqlstate||' '||sqlerrm); end;
end $$;
reset role;
insert into test_log(name, ok, detail) select 'T6b aucun foyer "Intrus" persisté', count(*)=0, count(*)::text from households where name='Mon foyer' and id not in (select household_id from members);

-- ===== T7 : signatures : UNE seule surcharge par fonction (sinon ambiguïté PostgREST PGRST203) =====
insert into test_log(name, ok, detail) select 'T7a une seule surcharge create_household/join_household', count(*)=2, string_agg(proname||'('||pg_get_function_arguments(oid)||')', ' | ') from pg_proc where proname in ('create_household','join_household');
insert into test_log(name, ok, detail) select 'T7b requête de contrôle du fichier : types de retour = record (pas uuid)', bool_and(prorettype::regtype::text='record'), string_agg(proname||'→'||prorettype::regtype, ', ') from pg_proc where proname in ('create_household','join_household');
insert into test_log(name, ok, detail) select 'T7c EXECUTE accordé à authenticated', has_function_privilege('authenticated','create_household(text,text,text)','execute') and has_function_privilege('authenticated','join_household(text,text,text)','execute'), '';

-- ===== T8 : isolation RLS : Bob ne voit QUE son foyer =====
select as_user('00000000-0000-0000-0000-000000000002'); set role authenticated;
do $$ declare n_h int; n_m int; begin
  select count(*) into n_h from households; select count(*) into n_m from members;
  insert into test_log(name, ok, detail) values ('T8 RLS : Bob ne voit que son foyer (1 foyer)', n_h = 1, 'foyers='||n_h||' membres='||n_m);
end $$;
reset role;

-- ===== T9 : 025 toujours fonctionnelle après 026 =====
select as_user('00000000-0000-0000-0000-000000000001'); set role authenticated;
do $$ declare bob uuid; begin
  select id into bob from members where display_name='Bob';
  perform set_household_member_active(bob, false);
  insert into test_log(name, ok, detail) select 'T9 set_household_member_active (025) marche toujours', not active, active::text from members where id=bob;
exception when others then insert into test_log(name, ok, detail) values ('T9 025', false, sqlstate||' '||sqlerrm); end $$;
reset role;


-- ===== GARDE : un rapport incomplet doit être ROUGE, jamais silencieusement vert =====
reset role;
insert into test_log(name, ok, detail)
  select 'T0 rapport complet (37 vérifications attendues)', count(*) = 37, count(*)||' vérifications enregistrées' from test_log where name not like 'T0%';

\echo
\echo '================ RÉSULTATS ================'
select case when ok then '✅' else '❌' end as " ", name, detail from test_log order by n;
select count(*) filter (where ok) as reussis, count(*) filter (where not ok) as echoues, count(*) as total from test_log;

-- Sortie en erreur (code de retour ≠ 0) si UNE vérification échoue : c'est ce
-- qui permet à run.sh / une CI de le détecter.
\set ON_ERROR_STOP on
do $$ begin
  if exists (select 1 from test_log where not ok) then
    raise exception 'TESTS SQL EN ÉCHEC : % vérification(s) rouge(s)', (select count(*) from test_log where not ok);
  end if;
end $$;
