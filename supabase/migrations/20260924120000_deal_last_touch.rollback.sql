-- Откат представления «последнее касание».
begin;
drop view if exists public.v_deal_last_touch;
drop index if exists public.idx_deal_activities_human;
drop index if exists public.idx_deal_messages_outgoing;
commit;
