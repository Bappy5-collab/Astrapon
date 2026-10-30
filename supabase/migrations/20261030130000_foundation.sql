-- FieldShift Phase 2 · foundation: extensions, private helpers, profiles.
-- Additive only. Every object is created in this migration; nothing is dropped.

create extension if not exists postgis with schema extensions;

-- Internal helpers live in a schema the Data API does not expose.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the current request is trusted server code (secret/service key or a direct DB session),
-- never for a signed-in end user or anonymous browser request.
create or replace function private.is_trusted()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin', 'service_role');
$$;

-- Rejects any UPDATE on rows that must stay immutable once written.
create or replace function private.reject_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable; create a new version instead', tg_table_name
    using errcode = 'P0001';
end;
$$;

-- ------------------------------------------------------------- profiles ---

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  locale text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Per-user preferences. One row per auth user, created by trigger.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select, update (display_name, unit_system, locale) on public.profiles to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Users who signed up before this migration get a profile too.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
