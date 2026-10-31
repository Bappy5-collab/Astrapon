-- Fix: deleting a user (or field) failed when one of its snapshots pinned an evidence retrieval.
-- The NO ACTION foreign key from snapshot_evidence_retrievals was checked before the cascade had
-- removed the pin, so the whole delete was refused ("Database error deleting user").
--
-- New rule, same protection:
--  * the pin row cascades away with its retrieval (so field and account deletion work), and
--  * a BEFORE DELETE trigger refuses to delete a pinned retrieval while its field still exists,
--    i.e. a user cannot delete pinned evidence on its own; it goes only with the snapshot or field.

alter table public.snapshot_evidence_retrievals drop constraint snapshot_evidence_retrievals_retrieval_id_owner_id_fkey;
alter table public.snapshot_evidence_retrievals
  add constraint snapshot_evidence_retrievals_retrieval_id_owner_id_fkey
  foreign key (retrieval_id, owner_id) references public.evidence_retrievals (id, owner_id) on delete cascade;

create or replace function private.evidence_retrievals_keep_pinned()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.snapshot_evidence_retrievals p where p.retrieval_id = old.id)
     and exists (select 1 from public.fields f where f.id = old.field_id) then
    raise exception 'This evidence is pinned by a saved snapshot; delete the snapshot first' using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger evidence_retrievals_keep_pinned before delete on public.evidence_retrievals
  for each row execute function private.evidence_retrievals_keep_pinned();
