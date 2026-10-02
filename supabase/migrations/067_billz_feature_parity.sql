-- UStorE: Billz endi Click/Payme/Uzum kabi barcha do'konlarda mavjud bo'ladi.
-- 066-migratsiyadagi bilan AYNAN bir xil naqsh va bir xil xavfsizlik: bu faqat
-- "Billz" sozlamalar kartasi ko'rinishini/ulash imkoniyatini ochadi — haqiqiy
-- sinxronlash faqat shop o'zi haqiqiy secret_token kiritib ulanganidan keyin
-- boshlanadi (requireBillzAccessGranted() ulanish/config actionlarini
-- gate qiladi, lekin hech narsani avtomatik yoqmaydi).
begin;

alter table public.shops alter column billz_access_granted set default true;

update public.shops
set billz_access_granted = true
where coalesce(billz_access_granted, false) = false;

commit;
