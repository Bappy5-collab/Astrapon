-- Astrapon Phase 6 · saved plans.
--
-- A saved plan is the farmer's explicit choice of one option from one finished run ("Save as my
-- plan"). It is tied to the exact stored result: the result hash is copied at save time and must
-- match simulation_results, so a plan always reopens and exports the version it was saved from,
-- never a later recalculation. Only the name and note can change afterwards.

create table public.saved_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  run_id uuid not null,
  run_kind text not null check (run_kind in ('historical_replay', 'scenario')),
  strategy_id text not null check (strategy_id ~ '^(baseline|alternative-[1-9])$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  note text not null default '' check (char_length(note) <= 2000),
  result_sha256 text not null check (result_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (run_id, owner_id) references public.simulation_runs (id, owner_id) on delete cascade
);
create index saved_plans_owner_idx on public.saved_plans (owner_id);
create index saved_plans_run_idx on public.saved_plans (run_id);

create or replace function private.saved_plans_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stored text;
  res jsonb;
begin
  if tg_op = 'INSERT' then
    select r.result_sha256, r.result into stored, res from public.simulation_results r where r.run_id = new.run_id;
    if stored is null then
      raise exception 'Only a finished run with a stored result can be saved as a plan' using errcode = '23514';
    end if;
    if stored <> new.result_sha256 then
      raise exception 'The plan must reference the stored result it was chosen from' using errcode = '23514';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(res -> 'runs') v
       where v ->> 'kind' = new.run_kind
         and (v -> 'baseline' ->> 'id' = new.strategy_id
              or exists (select 1 from jsonb_array_elements(v -> 'alternatives') a where a ->> 'id' = new.strategy_id))
    ) then
      raise exception 'That option is not part of the run' using errcode = '23514';
    end if;
    return new;
  end if;
  if (new.run_id, new.run_kind, new.strategy_id, new.result_sha256, new.owner_id, new.created_at)
     is distinct from (old.run_id, old.run_kind, old.strategy_id, old.result_sha256, old.owner_id, old.created_at) then
    raise exception 'A saved plan keeps the option it was saved with; save a new plan instead' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger saved_plans_guard before insert or update on public.saved_plans
  for each row execute function private.saved_plans_guard();

alter table public.saved_plans enable row level security;
revoke all on public.saved_plans from anon, authenticated;
create policy "saved_plans: read own" on public.saved_plans
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "saved_plans: insert own" on public.saved_plans
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "saved_plans: update own" on public.saved_plans
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "saved_plans: delete own" on public.saved_plans
  for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, delete on public.saved_plans to authenticated;
grant update (name, note) on public.saved_plans to authenticated;
