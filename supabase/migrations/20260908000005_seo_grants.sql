-- Доступ service_role к схеме seo (воркер /api/seo/tick и панель /admin/seo ходят
-- под service_role через PostgREST). anon/authenticated НЕ получают доступ — модуль
-- серверный. Плюс схему seo нужно добавить в Exposed schemas (Settings → API).
grant usage on schema seo to service_role;
grant all privileges on all tables    in schema seo to service_role;
grant all privileges on all sequences in schema seo to service_role;
grant execute      on all functions   in schema seo to service_role;
alter default privileges in schema seo grant all on tables to service_role;
alter default privileges in schema seo grant all on sequences to service_role;
alter default privileges in schema seo grant execute on functions to service_role;
