-- Возврат к прежнему (открытому) состоянию. Применять только если закрытие
-- что-то сломало, и сразу разбираться почему.
begin;
alter table public.deal_analyses   disable row level security;
alter table public.call_recordings disable row level security;
grant all on public.deal_analyses, public.call_recordings to anon, authenticated;
alter view public.v_money_in        reset (security_invoker);
alter view public.v_deal_last_touch reset (security_invoker);
grant all on public.v_money_in, public.v_deal_last_touch to anon, authenticated;
grant execute on function public.analytics_money(date, date), public.analytics_sales(date, date),
  public.analytics_curators(date, date), public.analytics_forecast() to public, anon, authenticated;
commit;
