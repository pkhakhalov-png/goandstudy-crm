begin;
drop index if exists public.bookings_deal_idx;
alter table public.bookings drop column if exists deal_id;
commit;
