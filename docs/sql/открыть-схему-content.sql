-- Открыть схему content для PostgREST.
--
-- То же самое, что галочка в Settings → Data API → Exposed schemas, только
-- она не сохраняется. Здесь список ДОПИСЫВАЕТСЯ, а не заменяется: public, seo,
-- finance и graphql_public остаются на месте, что бы в нём сейчас ни стояло.
--
-- Прав это никому не даёт. Список решает только одно: разговаривает ли
-- PostgREST со схемой вообще. Читать её по-прежнему может лишь service_role —
-- у anon и authenticated прав на схему content нет, и ответ им будет
-- «permission denied for schema content», как сейчас отвечает seo.

do $$
declare
  было text;
begin
  select coalesce(
           (select split_part(cfg, '=', 2)
              from unnest(rolconfig) cfg
             where cfg like 'pgrst.db_schemas=%'),
           'public, graphql_public')
    into было
    from pg_roles
   where rolname = 'authenticator';

  raise notice 'было: %', было;

  if position('content' in было) = 0 then
    execute format('alter role authenticator set pgrst.db_schemas = %L', было || ', content');
    raise notice 'стало: %', было || ', content';
  else
    raise notice 'content уже в списке — менять нечего';
  end if;
end $$;

-- Перечитать конфигурацию, чтобы не ждать перезапуска.
notify pgrst, 'reload config';

-- Проверить: в строке должен быть content рядом с public и seo.
select rolconfig from pg_roles where rolname = 'authenticator';
