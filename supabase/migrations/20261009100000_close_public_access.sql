-- Закрываем публичный доступ к разборам сделок, записям звонков и денежным
-- представлениям. Советник Supabase пометил их как CRITICAL 9 октября.
--
-- Что было: у таблиц выключен RLS, а у ролей anon и authenticated полные права.
-- Публичный ключ лежит в браузерном коде CRM, так что любой, у кого он есть,
-- мог через REST читать, менять и удалять эти строки. Представления созданы
-- с правами владельца и отдавали денежные данные в обход RLS.
--
-- Почему это ничего не ломает: CRM ходит сюда только служебным ключом
-- (createAdminClient), а функции analytics_* — security definer от владельца.
-- Обе дороги RLS и отозванные права не затрагивают.
begin;

alter table public.deal_analyses   enable row level security;
alter table public.call_recordings enable row level security;
revoke all on public.deal_analyses, public.call_recordings from anon, authenticated;

alter view public.v_money_in        set (security_invoker = on);
alter view public.v_deal_last_touch set (security_invoker = on);
revoke all on public.v_money_in, public.v_deal_last_touch from anon, authenticated;

-- Функции аналитики — security definer без проверки роли: кто вызвал, тот и
-- получил деньги всей компании. Страница /admin/analytics проверяет админа
-- и зовёт их служебным ключом (коммит 2b46335), больше их никто не вызывает.
revoke execute on function public.analytics_money(date, date), public.analytics_sales(date, date),
  public.analytics_curators(date, date), public.analytics_forecast() from public, anon, authenticated;
grant execute on function public.analytics_money(date, date), public.analytics_sales(date, date),
  public.analytics_curators(date, date), public.analytics_forecast() to service_role;

commit;
