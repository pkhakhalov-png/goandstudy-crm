-- Кабинет куратора v2, миграция 007: политики чтения для роли контура.
--
-- ЧТО СЛУЧИЛОСЬ. Миграция 001 выдала роли `care_app` право `SELECT` на
-- четырнадцать рабочих таблиц. В боевой базе на них включён RLS, а политики
-- написаны под роли `authenticated` и `public` с предикатами `is_staff()` и
-- `get_my_role()`. Для `care_app` политики нет ни одной — и строк она видит
-- ноль. При коде ответа 200.
--
-- Проверено 28.09.2026: `clients` под service-role отдаёт 75 строк, под
-- `care_app` — ноль. То же у `curators` (12/0), `users` (46/0),
-- `client_tg_messages` (148/0), `client_universities` (140/0).
--
-- Обнаружилось не сразу, потому что `selftest-perms.ts` считал успехом код
-- 200 и не смотрел, есть ли в ответе данные. Это исправлено там же.
--
-- ЧТО ДЕЛАЕТ ЭТА МИГРАЦИЯ. Добавляет по одной политике на таблицу — только
-- `for select` и только `to care_app`. Это недостающая половина уже принятого
-- в 001 решения, а не новое право: разрешается ровно то, что и так выдано
-- грантом.
--
-- ЧЕГО НЕ ДЕЛАЕТ. Не трогает существующие политики, не включает и не
-- выключает RLS, не меняет данные, не касается других ролей. Для всех, кто
-- работает с базой сегодня, поведение не меняется: политика с `TO care_app`
-- для остальных ролей невидима.
--
-- Модель угроз та же, что была после 001: кто держит `CARE_DB_KEY`, тот
-- читает эти четырнадцать таблиц. Запись по-прежнему не выдана ничем.
--
-- Откат: supabase/migrations/care/007_read_policies.rollback.sql

begin;

-- Список ровно тот же, что в 001. Финансы, оценки разговоров и воронка
-- продаж сюда не входят и не войдут.

create policy care_app_read on public.clients for select to care_app using (true);
create policy care_app_read on public.curators for select to care_app using (true);
create policy care_app_read on public.users for select to care_app using (true);
create policy care_app_read on public.client_applications for select to care_app using (true);
create policy care_app_read on public.client_universities for select to care_app using (true);
create policy care_app_read on public.client_documents for select to care_app using (true);
create policy care_app_read on public.client_tg_messages for select to care_app using (true);
create policy care_app_read on public.client_tg_files for select to care_app using (true);
create policy care_app_read on public.client_activities for select to care_app using (true);
create policy care_app_read on public.client_essays for select to care_app using (true);
create policy care_app_read on public.client_scholarships for select to care_app using (true);
create policy care_app_read on public.curator_stages for select to care_app using (true);
create policy care_app_read on public.curator_stage_checklist for select to care_app using (true);
create policy care_app_read on public.curator_templates for select to care_app using (true);

commit;
