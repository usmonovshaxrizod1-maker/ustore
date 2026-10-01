-- ============================================================================
-- USTORE GREENFIELD — 060: SHOP LOGO TYPE (image vs generated wordmark)
-- ============================================================================
-- POLISH ROUND, task 2 ("Nomdan logo yaratish"): do'kon endi ikkita logo
-- turidan birini tanlashi mumkin — yuklangan RASM (mavjud logo_url, xulqi
-- o'zgarmaydi) yoki do'kon nomidan LIVE render qilinadigan wordmark
-- (rasterizatsiya qilinmaydi, faqat tanlangan preset+matn saqlanadi).
-- Additive/backward-compatible: eski qatorlar logo_type='IMAGE'ga tushadi,
-- logo_url xatti-harakati butunlay saqlanadi.

begin;

alter table public.shop_settings
  add column if not exists logo_type text not null default 'IMAGE'
    check (logo_type in ('IMAGE', 'WORDMARK')),
  add column if not exists logo_wordmark jsonb;

commit;
