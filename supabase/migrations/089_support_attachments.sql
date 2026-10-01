begin;

alter table public.support_ticket_messages
  alter column body drop not null,
  add column if not exists attachment_path text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint;

alter table public.support_ticket_messages
  drop constraint if exists support_ticket_messages_content_check;
alter table public.support_ticket_messages
  add constraint support_ticket_messages_content_check
  check (nullif(btrim(coalesce(body,'')), '') is not null or attachment_path is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
