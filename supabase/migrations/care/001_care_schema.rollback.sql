-- Откат 001. Возвращает базу в состояние до кабинета v2.
-- Существующие таблицы public не затрагиваются: снимаются только выданные
-- роли права на чтение, сами таблицы и их данные остаются как были.

begin;

drop schema if exists care cascade;

revoke select on
  public.clients, public.curators, public.users,
  public.client_applications, public.client_universities,
  public.client_documents, public.client_tg_messages, public.client_tg_files,
  public.client_activities, public.client_essays, public.client_scholarships,
  public.curator_stages, public.curator_stage_checklist, public.curator_templates
from care_app;

revoke usage on schema public from care_app;
revoke care_app from authenticator;

drop role if exists care_app;

commit;
