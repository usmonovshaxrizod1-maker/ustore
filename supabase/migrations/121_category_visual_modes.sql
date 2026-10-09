-- Individual native emoji or uploaded category image. Preserve existing SVG icons as legacy until edited.
begin;
alter table public.categories add column if not exists icon_type text not null default 'legacy';
alter table public.categories add column if not exists icon_emoji text;
alter table public.categories add constraint categories_icon_type_check check (icon_type in ('legacy','emoji','image'));
alter table public.categories add constraint categories_icon_emoji_check check (icon_emoji is null or char_length(icon_emoji) <= 32);
commit;
