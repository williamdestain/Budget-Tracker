-- Données héritées (état de prod juste avant la 024)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a','moi@h1.test'),
  ('00000000-0000-0000-0000-00000000000b','madame@h1.test'),
  ('00000000-0000-0000-0000-00000000000c','moi@h2.test');

insert into households (id, name, join_code) values
  ('11111111-1111-1111-1111-111111111111','Foyer complet','AAAAAA'),
  ('22222222-2222-2222-2222-222222222222','Foyer avec fantôme','BBBBBB');

insert into household_members (household_id, user_id, owner_label) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','moi'),
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','madame'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000c','moi');

-- H2 : Madame n'a jamais eu de compte, mais a des données -> deviendra un membre "fantôme"
insert into expenses (household_id, amount, category, date, owner) values
  ('11111111-1111-1111-1111-111111111111', 50, 'Courses', '2026-09-01', 'moi'),
  ('11111111-1111-1111-1111-111111111111', 30, 'Essence', '2026-09-02', 'madame'),
  ('22222222-2222-2222-2222-222222222222', 20, 'Courses', '2026-09-03', 'moi'),
  ('22222222-2222-2222-2222-222222222222', 15, 'Sport',   '2026-09-04', 'madame');
insert into incomes (household_id, amount, type, date, owner) values
  ('11111111-1111-1111-1111-111111111111', 3000, 'Salaire', '2026-09-01', 'moi'),
  ('22222222-2222-2222-2222-222222222222', 1000, 'Salaire', '2026-09-01', 'madame');
