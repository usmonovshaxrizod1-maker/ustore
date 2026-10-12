begin;
-- The two service-only guest placement functions keep the same behavior and
-- privileges, with a fixed search path matching the atomic checkout wrapper.
alter function public.ustore_place_guest_base(uuid,text,text,text,text,text,text,text,jsonb,text) set search_path=public;
alter function public.ustore_place_guest_order(uuid,text,text,text,text,text,text,text,jsonb,uuid,text) set search_path=public;
commit;
