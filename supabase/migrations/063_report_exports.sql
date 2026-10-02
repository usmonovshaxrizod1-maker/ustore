-- Private temporary/latest-per-user PDF report export bucket.
-- Edge Function service role writes one latest PDF per shop/user and returns
-- a short-lived signed download URL for Telegram Mini App native download.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-exports', 'report-exports', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
