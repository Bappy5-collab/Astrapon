-- FieldShift Phase 2 · versioned reference data (crop parameters, rotation rules, calendars,
-- data-source registry) with citations.
--
-- Readable by everyone; writable only by trusted server code (secret key / direct DB). Once a
-- dataset version is published its items and citations are frozen, so a saved simulation that
-- pins a dataset id always sees exactly the content it was run with.

create table public.reference_citations (
  id uuid primary key default gen_random_uuid(),
  citation_key text not null check (citation_key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  citation text not null check (char_length(citation) between 3 and 1000),
  url text check (url is null or url ~ '^https://'),
  doi text,
  -- verified: title and locator checked against the publisher. Otherwise say what is unconfirmed.
  verification text not null check (verification in ('verified', 'title_to_verify', 'secondary_source', 'catalog_pointer')),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (citation_key, content_sha256)
);
comment on table public.reference_citations is
  'Citations are append-only: a corrected citation is a new row with a new content hash.';

create table public.reference_datasets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('crop_parameters', 'rotation_rules', 'crop_calendar', 'data_source_registry', 'reference_library')),
  name text not null check (name ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  version integer not null check (version >= 1),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  -- sha256 over the canonical JSON of all items; set when published.
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  description text check (description is null or char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (kind, name, version),
  constraint reference_datasets_published check (
    (status = 'draft' and published_at is null) or (status <> 'draft' and published_at is not null and content_sha256 is not null)
  )
);

create table public.reference_items (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.reference_datasets (id) on delete restrict,
  item_key text not null check (char_length(item_key) between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (dataset_id, item_key)
);
create index reference_items_dataset_idx on public.reference_items (dataset_id);

create table public.reference_item_citations (
  item_id uuid not null references public.reference_items (id) on delete restrict,
  citation_id uuid not null references public.reference_citations (id) on delete restrict,
  primary key (item_id, citation_id)
);
create index reference_item_citations_citation_idx on public.reference_item_citations (citation_id);

-- Frozen-content enforcement ------------------------------------------------

create or replace function private.reference_datasets_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Published reference datasets cannot be deleted; retire them instead' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'draft' then
    return new;
  end if;
  -- Published/retired: only the status may move forward (published -> retired).
  if (new.kind, new.name, new.version, new.content_sha256, new.published_at, new.description)
     is distinct from (old.kind, old.name, old.version, old.content_sha256, old.published_at, old.description)
     or not (old.status = 'published' and new.status in ('published', 'retired')) then
    raise exception 'Reference dataset % v% is % and frozen', old.name, old.version, old.status using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger reference_datasets_guard before update or delete on public.reference_datasets
  for each row execute function private.reference_datasets_guard();

create or replace function private.reference_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ds_status text;
  ds_id uuid;
begin
  if tg_table_name = 'reference_items' then
    ds_id := coalesce(new.dataset_id, old.dataset_id);
    if tg_op = 'UPDATE' and new.dataset_id <> old.dataset_id then
      raise exception 'Reference items cannot move between datasets' using errcode = 'P0001';
    end if;
  else
    select i.dataset_id into ds_id from public.reference_items i where i.id = coalesce(new.item_id, old.item_id);
  end if;
  select d.status into ds_status from public.reference_datasets d where d.id = ds_id;
  if ds_status is distinct from 'draft' then
    raise exception 'Items of a published reference dataset are frozen' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger reference_items_guard before insert or update or delete on public.reference_items
  for each row execute function private.reference_items_guard();
create trigger reference_item_citations_guard before insert or update or delete on public.reference_item_citations
  for each row execute function private.reference_items_guard();
create trigger reference_citations_immutable before update on public.reference_citations
  for each row execute function private.reject_update();

-- Read-only for clients -----------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['reference_citations', 'reference_datasets', 'reference_items', 'reference_item_citations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end;
$$;

-- Only non-draft content is visible to clients; drafts are staging for trusted import scripts.
create policy "reference_datasets: read published" on public.reference_datasets
  for select to anon, authenticated using (status <> 'draft');
create policy "reference_items: read published" on public.reference_items
  for select to anon, authenticated
  using (exists (select 1 from public.reference_datasets d where d.id = dataset_id and d.status <> 'draft'));
create policy "reference_item_citations: read published" on public.reference_item_citations
  for select to anon, authenticated
  using (exists (
    select 1 from public.reference_items i join public.reference_datasets d on d.id = i.dataset_id
    where i.id = item_id and d.status <> 'draft'
  ));
create policy "reference_citations: read all" on public.reference_citations
  for select to anon, authenticated using (true);
-- No insert/update/delete policies: with RLS on and no grants, client writes are refused.
