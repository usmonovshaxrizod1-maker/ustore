-- Reserve a stable address during provisioning; DNS/TLS activation stays separate.
begin;
create or replace function public.ustore_ensure_shop_subdomain(
  p_shop_id uuid, p_name text, p_base_hostname text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_row public.shop_domains;
  v_base text;
  v_candidate text;
  v_label text;
  v_attempt integer := 0;
begin
  if p_base_hostname is null or p_base_hostname <> lower(p_base_hostname)
    or length(p_base_hostname)>210 or position('.' in p_base_hostname)=0 then
    raise exception 'invalid_hostname';
  end if;
  foreach v_label in array string_to_array(p_base_hostname,'.') loop
    if v_label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then raise exception 'invalid_hostname'; end if;
  end loop;
  if split_part(p_base_hostname,'.',array_length(string_to_array(p_base_hostname,'.'),1)) !~ '^[a-z][a-z0-9-]*$' then
    raise exception 'invalid_hostname';
  end if;
  perform 1 from public.shops where id=p_shop_id and status in ('PROVISIONING','ACTIVE') for update;
  if not found then raise exception 'shop_unavailable'; end if;
  select * into v_row from public.shop_domains where shop_id=p_shop_id and kind='SUBDOMAIN';
  if found then return to_jsonb(v_row); end if;
  v_base := trim(both '-' from left(regexp_replace(lower(coalesce(p_name,'')), '[^a-z0-9]+', '-', 'g'),28));
  if length(v_base)<3 then v_base := 'shop'; end if;
  loop
    v_candidate := case when v_attempt=0 then v_base
      else left(v_base, greatest(3, 38-length((v_attempt+1)::text))) || (v_attempt+1)::text end;
    if not exists(select 1 from public.shop_reserved_slugs where slug=v_candidate) then
      begin
        insert into public.shop_slug_registry(slug,shop_id) values(v_candidate,p_shop_id);
        insert into public.shop_domains(shop_id,hostname,kind)
          values(p_shop_id,v_candidate||'.'||p_base_hostname,'SUBDOMAIN') returning * into v_row;
        return to_jsonb(v_row);
      exception when unique_violation then
        -- Both inserts roll back together; never reuse another shop's hostname.
        null;
      end;
    end if;
    v_attempt := v_attempt+1;
    if v_attempt>=999 then raise exception 'subdomain_allocation_failed'; end if;
  end loop;
end;
$$;
revoke all on function public.ustore_ensure_shop_subdomain(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ustore_ensure_shop_subdomain(uuid,text,text) to service_role;
commit;
