-- Phase 4 (prompt 4): evidence pipeline.
--  * evidence_jobs: persisted queue for provider retrievals, processed by a separate Node worker
--    (scripts/evidence-worker.mts). Users can only request and cancel; status changes are trusted-only.
--  * Retrievals record cache key, processing version and the observation period (distinct from retrieved_at).
--  * Aggregates can carry a MODIS pixel id for per-pixel values.
--  * Snapshots (input schema v2) pin evidence retrievals by id + hash instead of copying every value,
--    and a pinned retrieval cannot be deleted while the snapshot exists.

-- ------------------------------------------------------- retrieval metadata ---

alter table public.evidence_retrievals
  add column cache_key text check (cache_key is null or cache_key ~ '^[0-9a-f]{64}$'),
  add column processing_version text check (processing_version is null or char_length(processing_version) <= 40),
  add column observation_start date,
  add column observation_end date,
  add column job_id uuid,
  add constraint evidence_retrievals_observation check (observation_end is null or observation_start is null or observation_end >= observation_start);

alter table public.evidence_retrievals drop constraint evidence_retrievals_source_id_check;
alter table public.evidence_retrievals add constraint evidence_retrievals_source_id_check
  check (source_id in ('nasa-power-daily', 'modis-mod13q1-ornl', 'usda-ssurgo-sda'));

alter table public.evidence_aggregates add column pixel text not null default '' check (pixel = '' or pixel ~ '^r[0-9]{1,3}c[0-9]{1,3}$');
alter table public.evidence_aggregates drop constraint evidence_aggregates_retrieval_id_variable_aggregation_perio_key;
alter table public.evidence_aggregates add constraint evidence_aggregates_unique_value unique (retrieval_id, variable, aggregation, period_start, period_end, pixel);

-- ------------------------------------------------------------------ jobs ---

create table public.evidence_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  field_id uuid not null,
  source_id text not null check (source_id in ('nasa-power-daily', 'modis-mod13q1-ornl', 'usda-ssurgo-sda')),
  status text not null default 'queued' check (status in ('queued', 'running', 'complete', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object' and pg_column_size(progress) <= 2048),
  error_kind text check (error_kind is null or error_kind in ('unavailable', 'invalid', 'not_applicable', 'internal')),
  error_message text check (error_message is null or char_length(error_message) <= 1000),
  retrieval_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade,
  foreign key (retrieval_id, field_id, owner_id) references public.evidence_retrievals (id, field_id, owner_id) on delete set null (retrieval_id),
  constraint evidence_jobs_finished check ((status in ('complete', 'failed', 'cancelled')) = (finished_at is not null))
);
create index evidence_jobs_owner_idx on public.evidence_jobs (owner_id);
create index evidence_jobs_field_idx on public.evidence_jobs (field_id, source_id, created_at desc);
create index evidence_jobs_queue_idx on public.evidence_jobs (next_attempt_at) where status in ('queued', 'running');
-- At most one active job per field and source (deduplication of repeated clicks).
create unique index evidence_jobs_one_active on public.evidence_jobs (field_id, source_id) where status in ('queued', 'running');

create trigger evidence_jobs_updated_at before update on public.evidence_jobs for each row execute function private.set_updated_at();

-- Users may insert a queued job and cancel a queued/running one. Everything else is trusted-only.
create or replace function private.evidence_jobs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_trusted() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'queued' or new.attempts <> 0 or new.retrieval_id is not null or new.started_at is not null or new.finished_at is not null then
      raise exception 'New evidence jobs must start queued' using errcode = '42501';
    end if;
    new.max_attempts := 3;
    new.next_attempt_at := now();
    new.progress := '{}'::jsonb;
    return new;
  end if;
  if old.status in ('queued', 'running') and new.status = 'cancelled'
     and new.attempts = old.attempts and new.retrieval_id is not distinct from old.retrieval_id then
    new.finished_at := now();
    new.lease_until := null;
    return new;
  end if;
  raise exception 'Only the evidence worker may change job status' using errcode = '42501';
end;
$$;

create trigger evidence_jobs_guard before insert or update on public.evidence_jobs
  for each row execute function private.evidence_jobs_guard();

alter table public.evidence_jobs enable row level security;
create policy "evidence_jobs: read own" on public.evidence_jobs for select to authenticated using (owner_id = (select auth.uid()));
create policy "evidence_jobs: insert own" on public.evidence_jobs for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "evidence_jobs: update own" on public.evidence_jobs for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "evidence_jobs: delete own" on public.evidence_jobs for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.evidence_jobs from anon, authenticated;
grant select, delete on public.evidence_jobs to authenticated;
grant insert (field_id, source_id) on public.evidence_jobs to authenticated;
grant update (status) on public.evidence_jobs to authenticated;

-- Request a refresh: returns the active job for this field and source if one exists (deduplicated).
create or replace function public.request_evidence(p_field_id uuid, p_source_id text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  job uuid;
begin
  perform 1 from public.fields f where f.id = p_field_id and f.boundary is not null;
  if not found then
    raise exception 'Field not found or it has no boundary yet' using errcode = 'P0002';
  end if;
  select j.id into job from public.evidence_jobs j
   where j.field_id = p_field_id and j.source_id = p_source_id and j.status in ('queued', 'running');
  if job is not null then
    return job;
  end if;
  insert into public.evidence_jobs (field_id, source_id) values (p_field_id, p_source_id) returning id into job;
  return job;
end;
$$;
revoke execute on function public.request_evidence(uuid, text) from public, anon;
grant execute on function public.request_evidence(uuid, text) to authenticated;

-- ------------------------------------------------ snapshot evidence pins ---

create table public.snapshot_evidence_retrievals (
  snapshot_id uuid not null,
  retrieval_id uuid not null,
  owner_id uuid not null default auth.uid(),
  response_sha256 text not null check (response_sha256 ~ '^[0-9a-f]{64}$'),
  aggregates_sha256 text not null check (aggregates_sha256 ~ '^[0-9a-f]{64}$'),
  primary key (snapshot_id, retrieval_id),
  foreign key (snapshot_id, owner_id) references public.simulation_input_snapshots (id, owner_id) on delete cascade,
  -- NO ACTION: a pinned retrieval cannot be deleted on its own, only together with its snapshot/field.
  foreign key (retrieval_id, owner_id) references public.evidence_retrievals (id, owner_id)
);
create index snapshot_evidence_retrievals_owner_idx on public.snapshot_evidence_retrievals (owner_id);
create index snapshot_evidence_retrievals_retrieval_idx on public.snapshot_evidence_retrievals (retrieval_id);
create trigger snapshot_evidence_retrievals_immutable before update on public.snapshot_evidence_retrievals
  for each row execute function private.reject_update();
alter table public.snapshot_evidence_retrievals enable row level security;
create policy "snapshot_evidence_retrievals: read own" on public.snapshot_evidence_retrievals for select to authenticated using (owner_id = (select auth.uid()));
create policy "snapshot_evidence_retrievals: insert own" on public.snapshot_evidence_retrievals for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "snapshot_evidence_retrievals: update own" on public.snapshot_evidence_retrievals for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "snapshot_evidence_retrievals: delete own" on public.snapshot_evidence_retrievals for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.snapshot_evidence_retrievals from anon, authenticated;
grant select on public.snapshot_evidence_retrievals to authenticated;
-- Inserted only by create_input_snapshot (SECURITY INVOKER), so users need insert.
grant insert (snapshot_id, retrieval_id, owner_id, response_sha256, aggregates_sha256) on public.snapshot_evidence_retrievals to authenticated;

-- Deterministic digest of a retrieval's aggregates (order and formatting fixed).
create or replace function private.aggregates_sha256(p_retrieval_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(string_agg(
           concat_ws('|', a.variable, a.unit, a.aggregation, a.period_start, a.period_end, a.pixel, a.value::text, a.valid_count, a.expected_count),
           E'\n' order by a.variable, a.aggregation, a.period_start, a.period_end, a.pixel), ''), 'UTF8')), 'hex')
  from public.evidence_aggregates a where a.retrieval_id = p_retrieval_id;
$$;

-- ---------------------------------------- input assembly, schema version 2 ---
-- Evidence is pinned by reference: newest valid/partial retrieval per source, with its response hash and
-- an aggregates digest. The values live in immutable rows that the pin keeps from being deleted.

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
    'input_schema_version', 2,
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
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
               'retrieval_id', r.id, 'source_id', r.source_id, 'product_id', r.product_id,
               'product_version', r.product_version, 'processing_version', r.processing_version,
               'evidence_class', r.evidence_class, 'spatial_support', r.spatial_support,
               'outcome', r.outcome, 'retrieved_at', r.retrieved_at,
               'observation_start', r.observation_start, 'observation_end', r.observation_end,
               'response_sha256', r.response_sha256,
               'aggregate_count', (select count(*) from public.evidence_aggregates a where a.retrieval_id = r.id),
               'aggregates_sha256', private.aggregates_sha256(r.id))
               order by r.source_id)
      from public.evidence_retrievals r
      where r.field_id = f.id and r.outcome in ('valid', 'partial')
        and r.retrieved_at = (select max(r2.retrieved_at) from public.evidence_retrievals r2
                              where r2.field_id = f.id and r2.source_id = r.source_id and r2.outcome in ('valid', 'partial'))
        and r.created_at = (select max(r3.created_at) from public.evidence_retrievals r3
                            where r3.field_id = f.id and r3.source_id = r.source_id and r3.outcome in ('valid', 'partial')
                              and r3.retrieved_at = r.retrieved_at)
    ), '[]'::jsonb),
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
  values (sc.id, sc.field_id, (inputs->>'input_schema_version')::integer, p_engine_version, inputs)
  returning id into snap_id;

  insert into public.snapshot_reference_datasets (snapshot_id, dataset_id, dataset_sha256)
  select snap_id, (d->>'id')::uuid, d->>'content_sha256'
  from jsonb_array_elements(inputs->'reference_datasets') d;

  insert into public.snapshot_evidence_retrievals (snapshot_id, retrieval_id, response_sha256, aggregates_sha256)
  select snap_id, (e->>'retrieval_id')::uuid, e->>'response_sha256', e->>'aggregates_sha256'
  from jsonb_array_elements(inputs->'evidence') e;

  return snap_id;
end;
$$;

-- Lets the reopen check confirm a pinned retrieval's values are byte-for-byte what was pinned.
create or replace function public.evidence_aggregates_digest(p_retrieval_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case when exists (select 1 from public.evidence_retrievals r where r.id = p_retrieval_id)
              then private.aggregates_sha256(p_retrieval_id) end;
$$;
revoke execute on function public.evidence_aggregates_digest(uuid) from public, anon;
grant execute on function public.evidence_aggregates_digest(uuid) to authenticated;
