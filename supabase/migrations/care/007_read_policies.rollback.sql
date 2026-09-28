-- Откат 007. Снимает политики чтения для роли контура.
--
-- После отката `care_app` снова видит ноль строк в рабочих таблицах: грант
-- `SELECT` из 001 остаётся, но RLS без политики не пропускает ничего.
-- Существующие политики других ролей не затрагиваются.

begin;

drop policy if exists care_app_read on public.clients;
drop policy if exists care_app_read on public.curators;
drop policy if exists care_app_read on public.users;
drop policy if exists care_app_read on public.client_applications;
drop policy if exists care_app_read on public.client_universities;
drop policy if exists care_app_read on public.client_documents;
drop policy if exists care_app_read on public.client_tg_messages;
drop policy if exists care_app_read on public.client_tg_files;
drop policy if exists care_app_read on public.client_activities;
drop policy if exists care_app_read on public.client_essays;
drop policy if exists care_app_read on public.client_scholarships;
drop policy if exists care_app_read on public.curator_stages;
drop policy if exists care_app_read on public.curator_stage_checklist;
drop policy if exists care_app_read on public.curator_templates;

commit;
