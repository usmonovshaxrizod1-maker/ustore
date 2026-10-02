-- UStorE: muddati tugagan elektron to'lov bandini nafaqat orders jadvalida,
-- balki mahalliy Click/Payme tranzaksiya holatida ham yopish.
-- Payme CreateTransaction uchun rasmiy 12 soatlik kutish oynasi qo'llanadi;
-- Click uchun shu 12 soat UStorEning o'z qoldiq-band qilish siyosati.
begin;

create or replace function public.ustore_expire_unpaid_orders(p_limit integer default 200)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_row record; v_count integer := 0; v_cancel_time bigint;
begin
  for v_row in
    select id, shop_id from public.orders
     where status = 'NEW' and payment_status = 'PENDING'
       and payment_due_at is not null and payment_due_at <= now()
     order by payment_due_at for update skip locked limit least(greatest(p_limit,1),1000)
  loop
    v_cancel_time := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

    -- Payme state -1 va reason 4 — provayder hujjatidagi timeout holati.
    update public.payme_transactions
       set state = -1, cancel_time = v_cancel_time, reason = 4
     where shop_id = v_row.shop_id and order_id = v_row.id and state = 1;

    -- Click uchun bu tashqi callback emas; UStorEning muddati tugagan lokal
    -- PREPARED bandini yopamiz. Keyingi Complete -9 oladi.
    update public.click_transactions
       set state = 'CANCELLED', error = -9,
           error_note = 'Payment reservation expired', cancelled_at = now()
     where shop_id = v_row.shop_id and order_id = v_row.id and state = 'PREPARED';

    perform public.update_order_status(
      v_row.shop_id, v_row.id, 'CANCELLED', 'PAYMENT_EXPIRY_CRON', true,
      'To''lov muddati tugadi'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.ustore_expire_unpaid_orders(integer) from public, anon, authenticated;
grant execute on function public.ustore_expire_unpaid_orders(integer) to service_role;

commit;
