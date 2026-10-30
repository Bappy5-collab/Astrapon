-- FieldShift Phase 2 · environmental evidence metadata, cached aggregates, scenarios,
-- immutable simulation input snapshots, runs (job status) and results.
--
-- Raw satellite/model responses are NOT stored in PostgreSQL. A retrieval keeps its request,
-- content hash, size and validation checks; only small per-field aggregates are cached.

-- ------------------------------------------------------ evidence metadata ---

create table public.evidence_retrievals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  field_id uuid not null,
  source_id text not null check (source_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  product_id text not null check (char_length(product_id) between 1 and 120),
  product_version text check (product_version is null or char_length(product_version) <= 40),
  evidence_class text not null check (evidence_class in ('satellite_observation', 'assimilated_model_product', 'ground_measurement')),
  spatial_support text not null check (char_length(spatial_support) between 1 and 200),
  -- Request parameters without credentials. Size-capped so raw data cannot be smuggled in.
  request jsonb not null check (jsonb_typeof(request) = 'object' and pg_column_size(request) <= 8192),
  retrieved_at timestamptz not null,
  response_sha256 text not null check (response_sha256 ~ '^[0-9a-f]{64}$'),
  response_bytes bigint not null check (response_bytes >= 0),
  outcome text not null check (outcome in ('valid', 'partial', 'invalid', 'unavailable')),
  checks jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array' and pg_column_size(checks) <= 32768),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object' and pg_column_size(provenance) <= 16384),
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, field_id, owner_id),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade
);
create index evidence_retrievals_owner_idx on public.evidence_retrievals (owner_id);
create index evidence_retrievals_field_idx on public.evidence_retrievals (field_id, source_id, retrieved_at desc);

create table public.evidence_aggregates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  field_id uuid not null,
  retrieval_id uuid not null,
  variable text not null check (char_length(variable) between 1 and 60),
  unit text not null check (char_length(unit) between 1 and 30),
  aggregation text not null check (aggregation in ('sum', 'mean', 'min', 'max', 'p10', 'p50', 'p90', 'count')),
  period_start date not null,
  period_end date not null,
  -- Null means no valid data in the period. It is never coerced to zero.
  value numeric,
  valid_count integer not null check (valid_count >= 0),
  expected_count integer not null check (expected_count >= valid_count),
  computed_at timestamptz not null default now(),
  unique (retrieval_id, variable, aggregation, period_start, period_end),
  foreign key (retrieval_id, field_id, owner_id) references public.evidence_retrievals (id, field_id, owner_id) on delete cascade,
  constraint evidence_aggregates_period check (period_end >= period_start),
  constraint evidence_aggregates_null_when_empty check (valid_count > 0 or value is null)
);
create index evidence_aggregates_owner_idx on public.evidence_aggregates (owner_id);
create index evidence_aggregates_field_idx on public.evidence_aggregates (field_id, variable, period_start);

-- A cached value is tied to the retrieval that produced it; refreshing means a new retrieval.
create trigger evidence_retrievals_immutable before update on public.evidence_retrievals
  for each row execute function private.reject_update();
create trigger evidence_aggregates_immutable before update on public.evidence_aggregates
  for each row execute function private.reject_update();

-- ------------------------------------------------------------- scenarios ---

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  field_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  settings_schema_version integer not null default 1 check (settings_schema_version >= 1),
  -- Validated by src/domain/scenario/settings.ts before write.
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, field_id, owner_id),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade
);
create index scenarios_owner_idx on public.scenarios (owner_id);
create index scenarios_field_idx on public.scenarios (field_id);

-- ------------------------------------------------ input snapshots (frozen) ---

create table public.simulation_input_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  scenario_id uuid not null,
  field_id uuid not null,
  input_schema_version integer not null check (input_schema_version >= 1),
  engine_version text not null check (engine_version ~ '^[0-9A-Za-z.+_-]{1,40}$'),
  -- Full copy of every input (field geometry, zones, history, soil, constraints, priorities,
  -- markets, scenario settings, cached evidence values, pinned reference dataset versions).
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) <= 1048576),
  -- Computed by trigger from inputs; any client-supplied value is overwritten.
  inputs_sha256 text not null default '' ,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (scenario_id, field_id, owner_id) references public.scenarios (id, field_id, owner_id) on delete cascade
);
create index simulation_input_snapshots_owner_idx on public.simulation_input_snapshots (owner_id);
create index simulation_input_snapshots_scenario_idx on public.simulation_input_snapshots (scenario_id, created_at desc);

create or replace function private.snapshot_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.inputs_sha256 := encode(sha256(convert_to(new.inputs::text, 'UTF8')), 'hex');
  new.created_at := now();
  return new;
end;
$$;

create trigger simulation_input_snapshots_hash before insert on public.simulation_input_snapshots
  for each row execute function private.snapshot_hash();
create trigger simulation_input_snapshots_immutable before update on public.simulation_input_snapshots
  for each row execute function private.reject_update();

-- Reference dataset versions a snapshot was built against. Foreign keys make the pin real.
create table public.snapshot_reference_datasets (
  snapshot_id uuid not null,
  owner_id uuid not null default auth.uid(),
  dataset_id uuid not null references public.reference_datasets (id) on delete restrict,
  dataset_sha256 text not null check (dataset_sha256 ~ '^[0-9a-f]{64}$'),
  primary key (snapshot_id, dataset_id),
  foreign key (snapshot_id, owner_id) references public.simulation_input_snapshots (id, owner_id) on delete cascade
);
create index snapshot_reference_datasets_owner_idx on public.snapshot_reference_datasets (owner_id);
create index snapshot_reference_datasets_dataset_idx on public.snapshot_reference_datasets (dataset_id);

create or replace function private.snapshot_reference_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ds record;
begin
  select status, content_sha256 into ds from public.reference_datasets where id = new.dataset_id;
  if ds.status is distinct from 'published' then
    raise exception 'Snapshots may only pin published reference datasets' using errcode = '23514';
  end if;
  if ds.content_sha256 <> new.dataset_sha256 then
    raise exception 'Pinned reference hash does not match the dataset' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger snapshot_reference_datasets_check before insert on public.snapshot_reference_datasets
  for each row execute function private.snapshot_reference_check();
create trigger snapshot_reference_datasets_immutable before update on public.snapshot_reference_datasets
  for each row execute function private.reject_update();

-- --------------------------------------------------------- runs & results ---

create table public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  snapshot_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  engine_version text not null,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text check (error_message is null or char_length(error_message) <= 2000),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (snapshot_id, owner_id) references public.simulation_input_snapshots (id, owner_id) on delete cascade,
  constraint simulation_runs_finished check ((status in ('succeeded', 'failed', 'cancelled')) = (finished_at is not null))
);
create index simulation_runs_owner_idx on public.simulation_runs (owner_id);
create index simulation_runs_snapshot_idx on public.simulation_runs (snapshot_id);
create index simulation_runs_queue_idx on public.simulation_runs (queued_at) where status = 'queued';

-- Users may queue and cancel. Only trusted workers may start, finish or fail a run.
create or replace function private.simulation_runs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  snap_engine text;
begin
  if tg_op = 'INSERT' then
    select s.engine_version into snap_engine from public.simulation_input_snapshots s where s.id = new.snapshot_id;
    if snap_engine is distinct from new.engine_version then
      raise exception 'Run engine version must match its snapshot' using errcode = '23514';
    end if;
    if not private.is_trusted() and (new.status <> 'queued' or new.started_at is not null or new.finished_at is not null) then
      raise exception 'Runs are created in the queued state' using errcode = '42501';
    end if;
    new.queued_at := now();
    return new;
  end if;

  if (new.snapshot_id, new.engine_version, new.owner_id, new.queued_at)
     is distinct from (old.snapshot_id, old.engine_version, old.owner_id, old.queued_at) then
    raise exception 'A run cannot be re-pointed to other inputs' using errcode = '42501';
  end if;
  if old.status in ('succeeded', 'failed', 'cancelled') then
    raise exception 'Finished runs are immutable' using errcode = 'P0001';
  end if;
  if not private.is_trusted() then
    if new.status <> 'cancelled' then
      raise exception 'Only the simulation worker can change run status to %', new.status using errcode = '42501';
    end if;
    new.finished_at := now();
    new.error_message := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger simulation_runs_guard before insert or update on public.simulation_runs
  for each row execute function private.simulation_runs_guard();

create table public.simulation_results (
  run_id uuid primary key,
  owner_id uuid not null,
  engine_version text not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  result_sha256 text not null default '',
  created_at timestamptz not null default now(),
  foreign key (run_id, owner_id) references public.simulation_runs (id, owner_id) on delete cascade
);
create index simulation_results_owner_idx on public.simulation_results (owner_id);

create or replace function private.simulation_results_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.result_sha256 := encode(sha256(convert_to(new.result::text, 'UTF8')), 'hex');
  return new;
end;
$$;

create trigger simulation_results_hash before insert on public.simulation_results
  for each row execute function private.simulation_results_hash();
create trigger simulation_results_immutable before update on public.simulation_results
  for each row execute function private.reject_update();

-- ------------------------------------------------------- RLS & privileges ---

alter table public.evidence_retrievals enable row level security;
alter table public.evidence_aggregates enable row level security;
alter table public.scenarios enable row level security;
alter table public.simulation_input_snapshots enable row level security;
alter table public.snapshot_reference_datasets enable row level security;
alter table public.simulation_runs enable row level security;
alter table public.simulation_results enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['evidence_retrievals', 'evidence_aggregates', 'scenarios', 'simulation_input_snapshots',
                           'snapshot_reference_datasets', 'simulation_runs', 'simulation_results']
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))',
                   t || ': read own', t);
  end loop;

  -- Owner may delete their own data (privacy). Immutability is about content, not retention.
  foreach t in array array['evidence_retrievals', 'scenarios', 'simulation_input_snapshots', 'simulation_runs']
  loop
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))',
                   t || ': delete own', t);
  end loop;

  -- User-writable rows.
  foreach t in array array['scenarios', 'simulation_input_snapshots', 'snapshot_reference_datasets', 'simulation_runs']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))',
                   t || ': insert own', t);
  end loop;
end;
$$;

create policy "scenarios: update own" on public.scenarios
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "simulation_runs: cancel own" on public.simulation_runs
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create trigger scenarios_updated_at before update on public.scenarios
  for each row execute function private.set_updated_at();

grant select, delete on public.evidence_retrievals to authenticated;
grant select on public.evidence_aggregates to authenticated;
grant select, insert, delete on public.scenarios to authenticated;
grant update (name, description, settings, settings_schema_version, archived) on public.scenarios to authenticated;
grant select, insert, delete on public.simulation_input_snapshots to authenticated;
grant select, insert on public.snapshot_reference_datasets to authenticated;
grant select, insert, delete on public.simulation_runs to authenticated;
grant update (status) on public.simulation_runs to authenticated;
grant select on public.simulation_results to authenticated;
-- Evidence rows and results are written by trusted server code only (no insert policy/grant for users).

-- ---------------------------------------------------- snapshot assembly ---
-- SECURITY INVOKER: reads go through RLS, so a caller can only snapshot their own data.

create or replace function public.assemble_scenario_inputs(p_scenario_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  sc public.scenarios;
  f public.fields;
begin
  select * into sc from public.scenarios where id = p_scenario_id;
  if not found then
    raise exception 'Scenario not found' using errcode = 'P0002';
  end if;
  select * into f from public.fields where id = sc.field_id;

  return jsonb_build_object(
    'input_schema_version', 1,
    'scenario', jsonb_build_object(
      'id', sc.id, 'name', sc.name, 'settings_schema_version', sc.settings_schema_version, 'settings', sc.settings),
    'field', jsonb_build_object(
      'id', f.id, 'farm_id', f.farm_id, 'name', f.name,
      'boundary', extensions.st_asgeojson(f.boundary, 7)::jsonb,
      'boundary_source', f.boundary_source, 'area_ha', f.area_ha,
      'centroid', extensions.st_asgeojson(f.centroid, 7)::jsonb,
      'evidence_class', 'farmer_report'),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', z.id, 'name', z.name, 'basis', z.basis, 'area_ha', z.area_ha,
               'boundary', extensions.st_asgeojson(z.boundary, 7)::jsonb) order by z.name, z.id)
      from public.planting_zones z where z.field_id = f.id), '[]'::jsonb),
    'crop_history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id, 'zone_id', h.zone_id, 'season_year', h.season_year, 'season', h.season,
               'crop_name', h.crop_name, 'planted_on', h.planted_on, 'harvested_on', h.harvested_on,
               'tillage', h.tillage, 'reported_yield', h.reported_yield, 'reported_yield_unit', h.reported_yield_unit,
               'evidence_class', 'farmer_report') order by h.season_year, h.season, h.id)
      from public.crop_history h where h.field_id = f.id), '[]'::jsonb),
    'soil_observations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'zone_id', s.zone_id, 'observed_on', s.observed_on,
               'depth_top_cm', s.depth_top_cm, 'depth_bottom_cm', s.depth_bottom_cm,
               'property', s.property, 'value_numeric', s.value_numeric, 'value_text', s.value_text,
               'unit', s.unit, 'method', s.method, 'source', s.source, 'evidence_class', s.evidence_class)
               order by s.observed_on, s.property, s.depth_top_cm, s.id)
      from public.soil_observations s where s.field_id = f.id), '[]'::jsonb),
    'constraints', (
      select jsonb_build_object(
               'irrigation', c.irrigation, 'irrigation_method', c.irrigation_method,
               'seasonal_water_allocation_mm', c.seasonal_water_allocation_mm, 'water_source', c.water_source,
               'equipment', to_jsonb(array(select unnest(c.equipment) order by 1)), 'evidence_class', 'farmer_report')
      from public.field_constraints c where c.field_id = f.id),
    'priorities', (
      select jsonb_build_object(
               'water_use', p.water_use, 'soil_health', p.soil_health, 'income_stability', p.income_stability,
               'workload', p.workload, 'weather_risk', p.weather_risk, 'diversification', p.diversification,
               'excluded_crops', to_jsonb(array(select unnest(p.excluded_crops) order by 1)),
               'evidence_class', 'farmer_report')
      from public.farmer_priorities p where p.field_id = f.id),
    'market_preferences', coalesce((
      select jsonb_agg(jsonb_build_object(
               'crop_name', m.crop_name, 'preference', m.preference, 'has_contract', m.has_contract,
               'evidence_class', 'farmer_report') order by m.crop_name)
      from public.market_preferences m where m.farm_id = f.farm_id), '[]'::jsonb),
    -- Copies of cached values, tied to the retrieval that produced them.
    'evidence_aggregates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'retrieval_id', r.id, 'source_id', r.source_id, 'product_id', r.product_id,
               'product_version', r.product_version, 'evidence_class', r.evidence_class,
               'spatial_support', r.spatial_support, 'response_sha256', r.response_sha256,
               'variable', a.variable, 'unit', a.unit, 'aggregation', a.aggregation,
               'period_start', a.period_start, 'period_end', a.period_end, 'value', a.value,
               'valid_count', a.valid_count, 'expected_count', a.expected_count)
               order by r.source_id, a.variable, a.aggregation, a.period_start, r.retrieved_at, a.id)
      from public.evidence_aggregates a join public.evidence_retrievals r on r.id = a.retrieval_id
      where a.field_id = f.id
        and r.outcome in ('valid', 'partial')
        -- Only the newest retrieval per source is used.
        and r.retrieved_at = (select max(r2.retrieved_at) from public.evidence_retrievals r2
                              where r2.field_id = f.id and r2.source_id = r.source_id and r2.outcome in ('valid', 'partial'))
    ), '[]'::jsonb),
    -- Newest published version of every reference dataset, pinned by id and content hash.
    'reference_datasets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'kind', d.kind, 'name', d.name, 'version', d.version, 'content_sha256', d.content_sha256)
               order by d.kind, d.name)
      from (select distinct on (kind, name) * from public.reference_datasets
            where status = 'published' order by kind, name, version desc) d), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_input_snapshot(p_scenario_id uuid, p_engine_version text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  inputs jsonb;
  sc public.scenarios;
  snap_id uuid;
begin
  select * into sc from public.scenarios where id = p_scenario_id;
  if not found then
    raise exception 'Scenario not found' using errcode = 'P0002';
  end if;
  inputs := public.assemble_scenario_inputs(p_scenario_id);

  insert into public.simulation_input_snapshots (scenario_id, field_id, input_schema_version, engine_version, inputs)
  values (sc.id, sc.field_id, 1, p_engine_version, inputs)
  returning id into snap_id;

  insert into public.snapshot_reference_datasets (snapshot_id, dataset_id, dataset_sha256)
  select snap_id, (d->>'id')::uuid, d->>'content_sha256'
  from jsonb_array_elements(inputs->'reference_datasets') d;

  return snap_id;
end;
$$;

revoke execute on function public.assemble_scenario_inputs(uuid) from public, anon;
revoke execute on function public.create_input_snapshot(uuid, text) from public, anon;
grant execute on function public.assemble_scenario_inputs(uuid) to authenticated;
grant execute on function public.create_input_snapshot(uuid, text) to authenticated;
