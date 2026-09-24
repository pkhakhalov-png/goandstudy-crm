-- Откат таблицы разборов. Сами разборы теряются — они производные,
-- и пересчитываются прогоном по тем же сделкам.
begin;
drop table if exists public.deal_analyses;
commit;
