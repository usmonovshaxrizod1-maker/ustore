-- USTORE GREENFIELD — 077: serialize promo usage-limit decisions.
begin;

create unique index if not exists promotion_redemptions_order_unique
  on public.promotion_redemptions(shop_id,promotion_id,order_id);
create unique index if not exists customer_discount_usages_order_unique
  on public.customer_discount_usages(shop_id,customer_discount_id,order_id);

create or replace function public.ustore_guard_promotion_redemption()
returns trigger language plpgsql as $$
declare v_promo public.promotions; v_total bigint; v_customer bigint;
begin
  select * into v_promo from public.promotions
   where shop_id = new.shop_id and id = new.promotion_id for update;
  if not found or not v_promo.is_active then raise exception 'promo_unavailable'; end if;
  if v_promo.starts_at is not null and v_promo.starts_at > now() then raise exception 'promo_not_started'; end if;
  if v_promo.ends_at is not null and v_promo.ends_at < now() then raise exception 'promo_expired'; end if;
  if v_promo.usage_limit is not null then
    select count(*) into v_total from public.promotion_redemptions
     where shop_id = new.shop_id and promotion_id = new.promotion_id;
    if v_total >= v_promo.usage_limit then raise exception 'promo_usage_limit_reached'; end if;
  end if;
  if v_promo.per_customer_limit is not null then
    select count(*) into v_customer from public.promotion_redemptions
     where shop_id = new.shop_id and promotion_id = new.promotion_id and tg_id = new.tg_id;
    if v_customer >= v_promo.per_customer_limit then raise exception 'promo_customer_limit_reached'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_promotion_redemption_limit on public.promotion_redemptions;
create trigger trg_promotion_redemption_limit before insert on public.promotion_redemptions
for each row execute function public.ustore_guard_promotion_redemption();

commit;
