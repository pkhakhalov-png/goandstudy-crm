-- Удаление пакета: можно, но никогда молча.
--
-- Триггер неизменяемости версий запрещал и update, и delete. Запрет на update
-- правильный: версия — это то, что было опубликовано, и переписывать её значит
-- переписывать прошлое. А вот запрет на delete оказался тупиком: удалить нельзя
-- ничего и никогда — ни тестовые строки, ни данные, которые человек попросил
-- убрать. Такой запрет обходят, а обход всегда грубее того, что он заменяет.
--
-- Вылезло на уборке после теста: шестнадцать проверок прошли, а прибрать за
-- собой тест не смог и оставил пакет в рабочей базе.
--
-- Решение: удаление разрешено, но только по названному намерению в той же
-- транзакции и с записью в журнал. Случайно так не удалишь, а нарочно — можно,
-- и потом видно, кто и почему.

begin;

create or replace function content.versions_are_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('content.purging', true), '') = 'on' then
    return old;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'версию пакета нельзя удалить мимоходом: это делает content.purge_package() и пишет в журнал (пакет %, версия %)',
      old.package_id, old.version;
  end if;
  raise exception 'версия пакета неизменяема: создайте новую версию (пакет %, версия %)',
    old.package_id, old.version;
end $$;

create or replace function content.purge_package(
  p_package_id bigint,
  p_reason     text,
  p_actor      text default 'system'
) returns int
language plpgsql as $$
declare
  v_versions int;
begin
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'удаление пакета требует причины: она попадёт в журнал и будет прочитана';
  end if;

  select count(*) into v_versions from content.package_versions where package_id = p_package_id;

  -- Журнал ПЕРЕД удалением: если удаление упадёт, запись о намерении останется,
  -- и это честнее, чем тишина.
  insert into content.audit_events (actor, operation, entity_type, entity_id, previous_hash, new_hash)
  values (p_actor, 'purge_package', 'package', p_package_id,
          (select content_hash from content.package_versions
            where package_id = p_package_id order by version desc limit 1),
          null);

  -- Намерение названо — на время этой транзакции триггер пропускает удаление.
  perform set_config('content.purging', 'on', true);

  delete from content.publications p
   using content.variant_versions vv, content.variants v
   where p.variant_version_id = vv.id and vv.variant_id = v.id and v.package_id = p_package_id;
  delete from content.variants where package_id = p_package_id;
  update content.packages set current_version_id = null where id = p_package_id;
  delete from content.package_versions where package_id = p_package_id;
  delete from content.packages where id = p_package_id;

  perform set_config('content.purging', 'off', true);
  return v_versions;
end $$;

comment on function content.purge_package is
  'Удалить пакет целиком. Требует причины и пишет в журнал до удаления. '
  'Единственный способ убрать версию пакета: триггер неизменяемости пропускает '
  'удаление только внутри этой функции.';

grant execute on all functions in schema content to service_role;

commit;

-- Проверить (пакета -777 может не быть — тогда вернёт 0):
--   select content.purge_package(id, 'уборка после проверки моста')
--     from content.packages where seo_article_id = -777;
--   select count(*) from content.packages where seo_article_id = -777;  -- 0
