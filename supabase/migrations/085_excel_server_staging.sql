-- UStorE: Excel faylini katalogga yozishdan oldin serverdagi vaqtinchalik
-- maydonda to'liq tekshirish. Faqat tasdiqlangandan keyin mavjud import
-- mexanizmi staged nusxadan katalogga yozadi.
begin;

create table if not exists public.import_staging_batches (
  batch_id uuid primary key,
  shop_id uuid not null,
  approved_new_paths jsonb not null default '[]'::jsonb,
  aliases jsonb not null default '[]'::jsonb,
  staged_rows integer not null default 0,
  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  unique(shop_id,batch_id),
  foreign key(shop_id,batch_id) references public.import_batches(shop_id,id) on delete cascade
);

create table if not exists public.import_staging_rows (
  shop_id uuid not null,
  batch_id uuid not null,
  row_index integer not null check(row_index>=0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(shop_id,batch_id,row_index),
  foreign key(shop_id,batch_id) references public.import_staging_batches(shop_id,batch_id) on delete cascade
);

create index if not exists import_staging_rows_batch_idx
  on public.import_staging_rows(shop_id,batch_id,row_index);
alter table public.import_staging_batches enable row level security;
alter table public.import_staging_rows enable row level security;

create or replace function public.ustore_stage_import_chunk(
  p_shop_id uuid,p_batch_id uuid,p_offset integer,p_rows jsonb,p_is_final boolean
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare meta public.import_staging_batches; row_count integer;
begin
  if jsonb_typeof(p_rows)<>'array' then raise exception 'invalid_stage_rows'; end if;
  row_count:=jsonb_array_length(p_rows);
  if row_count<1 or row_count>150 then raise exception 'invalid_stage_rows'; end if;
  select * into meta from public.import_staging_batches
   where shop_id=p_shop_id and batch_id=p_batch_id for update;
  if not found then raise exception 'import_stage_not_started'; end if;
  if meta.is_complete then raise exception 'import_stage_already_complete'; end if;
  if meta.staged_rows<>p_offset then raise exception 'import_stage_offset_conflict:%',meta.staged_rows; end if;
  insert into public.import_staging_rows(shop_id,batch_id,row_index,payload)
  select p_shop_id,p_batch_id,(p_offset+ordinality-1)::integer,value
  from jsonb_array_elements(p_rows) with ordinality;
  update public.import_staging_batches
    set staged_rows=p_offset+row_count,is_complete=p_is_final
    where shop_id=p_shop_id and batch_id=p_batch_id;
  return jsonb_build_object('stagedRows',p_offset+row_count,'completed',p_is_final);
end; $$;
revoke all on function public.ustore_stage_import_chunk(uuid,uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.ustore_stage_import_chunk(uuid,uuid,integer,jsonb,boolean) to service_role;

commit;
