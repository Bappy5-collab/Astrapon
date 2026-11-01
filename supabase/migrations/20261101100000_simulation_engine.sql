-- Astrapon Phase 5 · simulation and rotation engine.
--
-- 1. evidence_daily_series: normalised daily values (not raw responses) of the POWER variables the
--    engine needs, one row per retrieval and variable. Written by the trusted worker, immutable,
--    owner-readable. Pinning a retrieval in a snapshot therefore pins these values too.
-- 2. simulation_runs: one active (queued/running) run per snapshot; compute time and input digest.
-- 3. request_simulation(): snapshot the scenario (reusing the newest snapshot when nothing changed)
--    and queue a run, in one transaction. SECURITY INVOKER, so RLS applies.

create table public.evidence_daily_series (
  retrieval_id uuid not null,
  owner_id uuid not null,
  variable text not null check (variable in ('T2M_MAX', 'T2M_MIN', 'PRECTOTCORR')),
  unit text not null check (unit in ('°C', 'mm/day')),
  start_date date not null,
  -- One value per consecutive day from start_date; NULL where the provider had no valid value.
  "values" double precision[] not null check (cardinality("values") between 1 and 40000),
  values_sha256 text not null default '',
  created_at timestamptz not null default now(),
  primary key (retrieval_id, variable),
  foreign key (retrieval_id, owner_id) references public.evidence_retrievals (id, owner_id) on delete cascade
);
create index evidence_daily_series_owner_idx on public.evidence_daily_series (owner_id);

create or replace function private.daily_series_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.values_sha256 := encode(sha256(convert_to(new.start_date::text || ':' || array_to_string(new."values", ',', 'null'), 'UTF8')), 'hex');
  return new;
end;
$$;

create trigger evidence_daily_series_hash before insert on public.evidence_daily_series
  for each row execute function private.daily_series_hash();
create trigger evidence_daily_series_immutable before update on public.evidence_daily_series
  for each row execute function private.reject_update();

alter table public.evidence_daily_series enable row level security;
revoke all on public.evidence_daily_series from anon, authenticated;
create policy "evidence_daily_series: read own" on public.evidence_daily_series
  for select to authenticated using (owner_id = (select auth.uid()));
grant select on public.evidence_daily_series to authenticated;

-- ------------------------------------------------------------- runs ---

alter table public.simulation_runs add column compute_ms integer check (compute_ms is null or compute_ms >= 0);
alter table public.simulation_runs add column input_digest text check (input_digest is null or input_digest ~ '^[0-9a-f]{64}$');

create unique index simulation_runs_one_active_per_snapshot on public.simulation_runs (snapshot_id)
  where status in ('queued', 'running');

-- --------------------------------------------------- request a run ---

create or replace function public.request_simulation(p_scenario_id uuid, p_engine_version text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  current_inputs jsonb;
  snap public.simulation_input_snapshots;
  snap_id uuid;
  run_id uuid;
begin
  if p_engine_version is null or p_engine_version = '0.0.0-pre-engine' then
    raise exception 'A real engine version is required' using errcode = '22023';
  end if;
  current_inputs := public.assemble_scenario_inputs(p_scenario_id);

  select * into snap from public.simulation_input_snapshots s
   where s.scenario_id = p_scenario_id and s.engine_version = p_engine_version
   order by s.created_at desc limit 1;

  if found and snap.inputs = current_inputs then
    snap_id := snap.id;
  else
    snap_id := public.create_input_snapshot(p_scenario_id, p_engine_version);
  end if;

  select r.id into run_id from public.simulation_runs r
   where r.snapshot_id = snap_id and r.status in ('queued', 'running') limit 1;
  if run_id is not null then
    return run_id;
  end if;

  insert into public.simulation_runs (snapshot_id, engine_version) values (snap_id, p_engine_version)
  returning id into run_id;
  return run_id;
end;
$$;

revoke all on function public.request_simulation(uuid, text) from public, anon;
grant execute on function public.request_simulation(uuid, text) to authenticated;
