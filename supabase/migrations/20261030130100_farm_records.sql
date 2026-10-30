-- FieldShift Phase 2 · farmer-owned records.
--
-- Ownership model: every row carries owner_id = auth.uid(). Children reference their
-- parent with a composite foreign key (parent_id, owner_id) -> parent(id, owner_id), so a
-- row can only attach to a parent with the same owner. RLS then limits every
-- statement to the caller's own rows. Both layers must agree for a write to succeed.
--
-- Geography (WGS84 boundaries) is stored in PostGIS columns. Illustrative 3D scene
-- settings live in their own table and never share columns with real coordinates.

-- ---------------------------------------------------------------- farms ---

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index farms_owner_idx on public.farms (owner_id);

-- --------------------------------------------------------------- fields ---

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  farm_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Real-world boundary, WGS84 lon/lat. Null until the farmer provides one.
  boundary extensions.geometry(MultiPolygon, 4326),
  boundary_source text check (boundary_source in ('farmer_drawn', 'farmer_uploaded', 'farmer_entered_coordinates')),
  -- Derived from boundary by trigger (geodesic area, interior point). Never user-supplied.
  area_ha numeric(12, 4),
  centroid extensions.geometry(Point, 4326),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (farm_id, owner_id) references public.farms (id, owner_id) on delete cascade,
  constraint fields_boundary_valid check (
    boundary is null or (extensions.st_isvalid(boundary) and not extensions.st_isempty(boundary))
  ),
  constraint fields_boundary_source_present check ((boundary is null) = (boundary_source is null)),
  constraint fields_area_range check (area_ha is null or area_ha between 0.01 and 20000)
);
create index fields_owner_idx on public.fields (owner_id);
create index fields_farm_idx on public.fields (farm_id);
create index fields_boundary_gix on public.fields using gist (boundary);

create or replace function private.fields_derive_geometry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.boundary is null then
    new.area_ha := null;
    new.centroid := null;
  else
    new.area_ha := round((extensions.st_area(new.boundary::extensions.geography) / 10000.0)::numeric, 4);
    new.centroid := extensions.st_pointonsurface(new.boundary);
  end if;
  return new;
end;
$$;

create trigger fields_derive_geometry before insert or update of boundary on public.fields
  for each row execute function private.fields_derive_geometry();

-- Illustrative-only 3D presentation settings. Not geography; never used as evidence.
create table public.field_scene_settings (
  field_id uuid primary key,
  owner_id uuid not null default auth.uid(),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now(),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade
);
comment on table public.field_scene_settings is
  'Illustrative 3D scene preferences (camera, exaggeration, palette). Evidence class: illustrative. Not coordinates.';
create index field_scene_settings_owner_idx on public.field_scene_settings (owner_id);

-- -------------------------------------------------------- planting zones ---

create table public.planting_zones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  field_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  boundary extensions.geometry(MultiPolygon, 4326) not null,
  -- Zone differences must come from the farmer or data that resolves them (contract §Scientific).
  basis text not null check (basis in ('farmer_knowledge', 'soil_survey', 'yield_map', 'other_farmer_record')),
  area_ha numeric(12, 4),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (id, field_id, owner_id),
  unique (field_id, name),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade,
  constraint planting_zones_boundary_valid check (extensions.st_isvalid(boundary) and not extensions.st_isempty(boundary))
);
create index planting_zones_owner_idx on public.planting_zones (owner_id);
create index planting_zones_field_idx on public.planting_zones (field_id);
create index planting_zones_boundary_gix on public.planting_zones using gist (boundary);

-- A zone must lie inside its field's boundary (1 m tolerance for digitising error).
create or replace function private.planting_zones_check_geometry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  field_boundary extensions.geometry;
begin
  select f.boundary into field_boundary from public.fields f where f.id = new.field_id;
  if field_boundary is null then
    raise exception 'Set the field boundary before adding planting zones' using errcode = '23514';
  end if;
  if not extensions.st_coveredby(
       new.boundary::extensions.geography,
       extensions.st_buffer(field_boundary::extensions.geography, 1.0)
     ) then
    raise exception 'Planting zone must lie within the field boundary' using errcode = '23514';
  end if;
  new.area_ha := round((extensions.st_area(new.boundary::extensions.geography) / 10000.0)::numeric, 4);
  return new;
end;
$$;

create trigger planting_zones_check_geometry before insert or update of boundary, field_id on public.planting_zones
  for each row execute function private.planting_zones_check_geometry();

-- --------------------------------------------------------- crop history ---

create table public.crop_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  field_id uuid not null,
  zone_id uuid,
  season_year integer not null check (season_year between 1950 and 2100),
  season text not null default 'main' check (season in ('main', 'winter', 'spring', 'summer', 'double_crop', 'cover')),
  crop_name text not null check (char_length(btrim(crop_name)) between 1 and 80),
  planted_on date,
  harvested_on date,
  tillage text check (tillage in ('conventional', 'reduced', 'no_till', 'strip_till', 'unknown')),
  -- Farmer-reported yield; stored with its unit, never converted or estimated.
  reported_yield numeric check (reported_yield is null or reported_yield >= 0),
  reported_yield_unit text check (reported_yield_unit is null or char_length(reported_yield_unit) between 1 and 24),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade,
  -- MATCH SIMPLE: skipped when zone_id is null; otherwise the zone must belong to the same field and owner.
  foreign key (zone_id, field_id, owner_id) references public.planting_zones (id, field_id, owner_id) on delete cascade,
  constraint crop_history_dates check (harvested_on is null or planted_on is null or harvested_on >= planted_on),
  constraint crop_history_yield_unit check ((reported_yield is null) = (reported_yield_unit is null))
);
create index crop_history_owner_idx on public.crop_history (owner_id);
create index crop_history_field_idx on public.crop_history (field_id, season_year);
create index crop_history_zone_idx on public.crop_history (zone_id) where zone_id is not null;

-- ----------------------------------------------------- soil observations ---

create table public.soil_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  field_id uuid not null,
  zone_id uuid,
  observed_on date not null check (observed_on between date '1950-01-01' and date '2100-12-31'),
  depth_top_cm numeric(6, 1) not null check (depth_top_cm >= 0),
  depth_bottom_cm numeric(6, 1) not null check (depth_bottom_cm <= 500),
  property text not null,
  value_numeric numeric,
  value_text text check (value_text is null or char_length(value_text) between 1 and 80),
  unit text,
  method text check (method is null or char_length(method) <= 200),
  evidence_class text not null default 'farmer_report' check (evidence_class in ('ground_measurement', 'farmer_report')),
  source text check (source is null or char_length(source) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade,
  foreign key (zone_id, field_id, owner_id) references public.planting_zones (id, field_id, owner_id) on delete cascade,
  constraint soil_observations_depth check (depth_bottom_cm > depth_top_cm),
  constraint soil_observations_one_value check ((value_numeric is null) <> (value_text is null)),
  -- Property/unit vocabulary mirrors src/domain/farm/soil.ts.
  constraint soil_observations_property_unit check (
    (property = 'ph_water' and unit = 'pH' and value_numeric between 0 and 14)
    or (property = 'organic_matter' and unit = '%' and value_numeric between 0 and 100)
    or (property = 'soil_organic_carbon' and unit = '%' and value_numeric between 0 and 100)
    or (property in ('clay', 'sand', 'silt') and unit = '%' and value_numeric between 0 and 100)
    or (property = 'cation_exchange_capacity' and unit = 'cmol(+)/kg' and value_numeric between 0 and 200)
    or (property = 'bulk_density' and unit = 'g/cm3' and value_numeric between 0.1 and 2.6)
    or (property = 'available_water_capacity' and unit = 'cm/cm' and value_numeric between 0 and 0.7)
    or (property = 'nitrate_n' and unit = 'mg/kg' and value_numeric >= 0)
    or (property = 'phosphorus' and unit = 'mg/kg' and value_numeric >= 0)
    or (property = 'potassium' and unit = 'mg/kg' and value_numeric >= 0)
    or (property in ('texture_class', 'drainage_class') and unit is null and value_text is not null)
  )
);
create index soil_observations_owner_idx on public.soil_observations (owner_id);
create index soil_observations_field_idx on public.soil_observations (field_id, observed_on);
create index soil_observations_zone_idx on public.soil_observations (zone_id) where zone_id is not null;

-- ------------------------------------------- water & equipment constraints ---

create table public.field_constraints (
  field_id uuid primary key,
  owner_id uuid not null default auth.uid(),
  irrigation text not null default 'unknown' check (irrigation in ('none', 'full', 'deficit', 'supplemental', 'unknown')),
  irrigation_method text check (irrigation_method in ('center_pivot', 'drip', 'furrow', 'sprinkler', 'flood', 'other')),
  seasonal_water_allocation_mm numeric check (seasonal_water_allocation_mm is null or seasonal_water_allocation_mm between 0 and 3000),
  water_source text check (water_source is null or char_length(water_source) <= 200),
  equipment text[] not null default '{}' check (
    equipment <@ array['row_planter', 'grain_drill', 'no_till_drill', 'combine_grain_header', 'combine_corn_header',
                       'forage_harvester', 'baler', 'sprayer', 'manure_spreader', 'cultivator']::text[]
  ),
  equipment_notes text check (equipment_notes is null or char_length(equipment_notes) <= 2000),
  updated_at timestamptz not null default now(),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade,
  constraint field_constraints_method check (irrigation_method is null or irrigation in ('full', 'deficit', 'supplemental'))
);
create index field_constraints_owner_idx on public.field_constraints (owner_id);

-- ------------------------------------------------------ farmer priorities ---

create table public.farmer_priorities (
  field_id uuid primary key,
  owner_id uuid not null default auth.uid(),
  -- 0 = not important … 5 = very important. Relative weights only; they are not scores of outcomes.
  water_use smallint not null default 3 check (water_use between 0 and 5),
  soil_health smallint not null default 3 check (soil_health between 0 and 5),
  income_stability smallint not null default 3 check (income_stability between 0 and 5),
  workload smallint not null default 3 check (workload between 0 and 5),
  weather_risk smallint not null default 3 check (weather_risk between 0 and 5),
  diversification smallint not null default 3 check (diversification between 0 and 5),
  excluded_crops text[] not null default '{}' check (cardinality(excluded_crops) <= 30),
  notes text check (notes is null or char_length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  foreign key (field_id, owner_id) references public.fields (id, owner_id) on delete cascade
);
create index farmer_priorities_owner_idx on public.farmer_priorities (owner_id);

-- ---------------------------------------------------- market preferences ---

create table public.market_preferences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  farm_id uuid not null,
  crop_name text not null check (char_length(btrim(crop_name)) between 1 and 80),
  preference text not null check (preference in ('preferred', 'acceptable', 'avoid', 'no_market_access')),
  has_contract boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (farm_id, owner_id) references public.farms (id, owner_id) on delete cascade,
  unique (farm_id, crop_name)
);
create index market_preferences_owner_idx on public.market_preferences (owner_id);

-- -------------------------------------------- triggers, RLS, privileges ---

do $$
declare
  t text;
begin
  foreach t in array array['farms', 'fields', 'field_scene_settings', 'planting_zones', 'crop_history',
                           'soil_observations', 'field_constraints', 'farmer_priorities', 'market_preferences']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
                   t || '_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))',
                   t || ': read own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))',
                   t || ': insert own', t);
    execute format('create policy %I on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
                   t || ': update own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (owner_id = (select auth.uid()))',
                   t || ': delete own', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

-- Derived columns (area, centroid) are trigger-maintained and not writable by end users.
-- Column privileges only bite once the table-level grant is withdrawn.
revoke insert, update on public.fields from authenticated;
grant insert (id, owner_id, farm_id, name, boundary, boundary_source, notes) on public.fields to authenticated;
grant update (farm_id, name, boundary, boundary_source, notes) on public.fields to authenticated;
revoke insert, update on public.planting_zones from authenticated;
grant insert (id, owner_id, field_id, name, boundary, basis, notes) on public.planting_zones to authenticated;
grant update (name, boundary, basis, notes) on public.planting_zones to authenticated;

-- ------------------------------------------- geometry write helpers (RPC) ---
-- SECURITY INVOKER: RLS and the composite foreign keys still apply to the caller.

create or replace function private.multipolygon_from_geojson(p_geojson jsonb)
returns extensions.geometry
language plpgsql
immutable
set search_path = ''
as $$
declare
  g extensions.geometry;
begin
  if p_geojson is null or jsonb_typeof(p_geojson) <> 'object' or p_geojson->>'type' not in ('Polygon', 'MultiPolygon') then
    raise exception 'Boundary must be a GeoJSON Polygon or MultiPolygon' using errcode = '22023';
  end if;
  g := extensions.st_setsrid(extensions.st_geomfromgeojson(p_geojson::text), 4326);
  if not extensions.st_isvalid(g) then
    raise exception 'Boundary is not a valid polygon: %', extensions.st_isvalidreason(g) using errcode = '22023';
  end if;
  if extensions.st_xmin(g) < -180 or extensions.st_xmax(g) > 180 or extensions.st_ymin(g) < -90 or extensions.st_ymax(g) > 90 then
    raise exception 'Boundary coordinates must be longitude/latitude in WGS84' using errcode = '22023';
  end if;
  return extensions.st_multi(g);
end;
$$;

create or replace function public.set_field_boundary(p_field_id uuid, p_boundary jsonb, p_source text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.fields
     set boundary = private.multipolygon_from_geojson(p_boundary), boundary_source = p_source
   where id = p_field_id;
  if not found then
    raise exception 'Field not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.create_planting_zone(
  p_field_id uuid, p_name text, p_boundary jsonb, p_basis text, p_notes text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.planting_zones (field_id, name, boundary, basis, notes)
  values (p_field_id, p_name, private.multipolygon_from_geojson(p_boundary), p_basis, p_notes)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.set_field_boundary(uuid, jsonb, text) from public, anon;
revoke execute on function public.create_planting_zone(uuid, text, jsonb, text, text) from public, anon;
grant execute on function public.set_field_boundary(uuid, jsonb, text) to authenticated;
grant execute on function public.create_planting_zone(uuid, text, jsonb, text, text) to authenticated;

-- GeoJSON read helper for a field and its zones (RLS applies through SECURITY INVOKER).
create or replace function public.field_geometry(p_field_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'boundary', extensions.st_asgeojson(f.boundary, 7)::jsonb,
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'boundary', extensions.st_asgeojson(z.boundary, 7)::jsonb) order by z.name)
      from public.planting_zones z where z.field_id = f.id), '[]'::jsonb))
  from public.fields f where f.id = p_field_id;
$$;

revoke execute on function public.field_geometry(uuid) from public, anon;
grant execute on function public.field_geometry(uuid) to authenticated;
