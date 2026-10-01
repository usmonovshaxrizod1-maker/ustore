-- UStorE: yangi shoplar eski shoplar bilan feature-parity + /start rasm.
begin;

alter table public.shop_settings
  add column if not exists start_image_url text;

-- Online acquiring platform funksiyasi barcha shoplarda mavjud bo'ladi;
-- shop ichidagi payment method enabled holati fulfillment_config orqali OFF/ON qilinadi.
alter table public.shops alter column click_access_granted set default true;
alter table public.shops alter column payme_access_granted set default true;
alter table public.shops alter column uzum_access_granted set default true;

update public.shops
set click_access_granted = true,
    payme_access_granted = true,
    uzum_access_granted = true
where coalesce(click_access_granted,false) = false
   or coalesce(payme_access_granted,false) = false
   or coalesce(uzum_access_granted,false) = false;

-- Provisioning funksiyasini patch qilmasdan ham yuqoridagi column defaultlar
-- yangi insertlarda avtomatik qo'llanadi.
commit;
