-- Astrapon Phase 10 · Water & Energy planner snapshots.
--
-- A water_energy_plan is an immutable, versioned snapshot of one Water & Energy calculation for
-- one field: the exact planner inputs (including any farmer-reported source, measured well depth,
-- route length and PV size), the provider evidence used (mapped water feature, groundwater
-- station observations, NASA POWER solar summary, each with provider/product/version, observation
-- and retrieval dates), the model version and the result. Reopening or exporting a plan reads
-- these rows only; refreshing data and saving creates a new version. Only the name can change.
--
-- Private farm coordinates and measurements live only here, under owner-only RLS; nothing is
-- written to a shared cache.

create table public.water_energy_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  field_id uuid not null,
  -- Optional link to the rotation comparison whose demand was used.
  run_id uuid,
  version integer not null check (version >= 1),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  model_version text not null check (model_version ~ '^\d+\.\d+\.\d+$'),
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  inputs_sha256 text not null check (inputs_sha256 ~ '^[0-9a-f]{64}$'),
  result_sha256 text not null check (result_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (field_id, version),
  check (octet_length(inputs::text) + octet_length(evidence::text) + octet_length(result::text) < 2000000),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade,
  foreign key (run_id, owner_id) references public.simulation_runs (id, owner_id) on delete set null (run_id)
);
create index water_energy_plans_owner_idx on public.water_energy_plans (owner_id);
create index water_energy_plans_field_idx on public.water_energy_plans (field_id, version desc);
create index water_energy_plans_run_idx on public.water_energy_plans (run_id);

create or replace function private.water_energy_plans_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- The run (if any) must be a finished run of the same field.
    if new.run_id is not null and not exists (
      select 1 from public.simulation_runs r
        join public.simulation_input_snapshots s on s.id = r.snapshot_id
       where r.id = new.run_id and r.status = 'succeeded' and s.field_id = new.field_id
    ) then
      raise exception 'The linked comparison must be a finished run of this field' using errcode = '23514';
    end if;
    return new;
  end if;
  -- run_id may only be cleared by the run's deletion (on delete set null).
  if (new.field_id, new.version, new.model_version, new.inputs, new.evidence, new.result, new.inputs_sha256, new.result_sha256, new.owner_id, new.created_at)
     is distinct from (old.field_id, old.version, old.model_version, old.inputs, old.evidence, old.result, old.inputs_sha256, old.result_sha256, old.owner_id, old.created_at)
     or (new.run_id is not null and new.run_id is distinct from old.run_id) then
    raise exception 'A saved water and energy plan cannot be changed; save a new version instead' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger water_energy_plans_guard before insert or update on public.water_energy_plans
  for each row execute function private.water_energy_plans_guard();

alter table public.water_energy_plans enable row level security;
revoke all on public.water_energy_plans from anon, authenticated;
create policy "water_energy_plans: read own" on public.water_energy_plans
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "water_energy_plans: insert own" on public.water_energy_plans
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "water_energy_plans: update own" on public.water_energy_plans
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "water_energy_plans: delete own" on public.water_energy_plans
  for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, delete on public.water_energy_plans to authenticated;
grant update (name) on public.water_energy_plans to authenticated;
