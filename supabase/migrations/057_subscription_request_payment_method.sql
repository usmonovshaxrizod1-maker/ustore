-- UStorE Platform — subscription request payment method snapshot.
-- User qaysi usul (CARD / CLICK / PAYME / PAYNET) orqali to'laganini admin
-- tekshiruv paytida ko'rishi uchun. `payment_claimed_at` (049) esa user
-- "To'lovni tasdiqlash"ni bosgan SERVER vaqtini saqlashda davom etadi.

alter table public.subscription_requests
  add column if not exists payment_method text,
  add column if not exists payment_method_id uuid references public.platform_payment_methods(id) on delete set null;

alter table public.subscription_requests
  drop constraint if exists subscription_requests_payment_method_check;

alter table public.subscription_requests
  add constraint subscription_requests_payment_method_check
  check (payment_method is null or payment_method in ('CARD','CLICK','PAYME','PAYNET'));
