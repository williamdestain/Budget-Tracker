-- Revenus récurrents "façon dépenses récurrentes" : remplace l'ancien
-- système (Income.recurring compté en MOYENNE MENSUELLE dans chaque mois,
-- voir l'ancien incomeForMonth()) par un vrai modèle + occurrences
-- générées automatiquement, exactement comme recurring_expenses/expenses.
--
-- Avantages : chaque paie est une vraie ligne datée, modifiable
-- individuellement, et supprimer le modèle n'efface plus l'historique
-- déjà généré — seules les prochaines paies s'arrêtent.
--
-- À exécuter une fois dans Supabase > SQL Editor si ta base existe déjà.

create table if not exists recurring_incomes (
  id uuid primary key default uuid_generate_v4(),
  amount numeric(12,2) not null,
  type text not null,
  owner text not null check (owner in ('moi','madame')),
  note text not null default '',
  interval text not null default 'monthly'
    check (interval in ('monthly', 'weekly', 'biweekly', 'semimonthly')),
  day_of_month integer not null check (day_of_month between 1 and 31),
  second_day_of_month integer
    check (second_day_of_month is null or second_day_of_month between 1 and 31),
  start_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table incomes
  add column if not exists recurring_source_id uuid references recurring_incomes(id) on delete set null;

alter table recurring_incomes enable row level security;

create policy "authenticated_all_recurring_incomes" on recurring_incomes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Migration des données existantes : chaque revenu marqué recurring=true
-- devient un modèle, et la ligne d'origine devient sa première occurrence
-- (recurring_source_id pointant vers le nouveau modèle). Le montant stocké
-- sur l'ancienne ligne était déjà le montant PAR PAIE (l'ancienne moyenne
-- n'était calculée qu'à l'affichage), donc aucune conversion de montant
-- n'est nécessaire.
--
-- ATTENTION cas 'semimonthly' : l'ancien système ne connaissait aucun 2e
-- jour calendaire précis (juste "montant x2" dans la moyenne). Cette
-- migration met provisoirement second_day_of_month = day_of_month + 15
-- (borné à 28) à titre de valeur de départ — va corriger le 2e jour exact
-- dans l'app, section "Revenus récurrents", si ce n'est pas le bon jour.
do $$
declare
  r record;
  new_id uuid;
  d1 integer;
  d2 integer;
begin
  for r in select * from incomes where recurring = true and recurring_source_id is null loop
    d1 := extract(day from r.date)::integer;
    d2 := least(d1 + 15, 28);
    insert into recurring_incomes (
      amount, type, owner, note, interval, day_of_month, second_day_of_month, start_date, active
    )
    values (
      r.amount,
      r.type,
      r.owner,
      coalesce(r.note, ''),
      coalesce(r.recurring_interval, 'monthly'),
      d1,
      case when r.recurring_interval = 'semimonthly' then d2 else null end,
      r.date,
      true
    )
    returning id into new_id;

    update incomes set recurring_source_id = new_id where id = r.id;
  end loop;
end $$;
