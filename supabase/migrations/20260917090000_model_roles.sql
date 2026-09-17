-- Роли через настройку (E2.7).
--
-- Сейчас модель писателя — строка в lib/seo/generate.ts. Смена модели поэтому
-- означает правку кода и выкладку, а на вопрос «чем написана вот эта статья»
-- приходится отвечать по датам коммитов. Настройка переносит решение в одно
-- место, где его видно и откуда его можно откатить, не трогая конвейер.
--
-- Таблица создаётся с теми же значениями, что стоят в коде сегодня. Применение
-- этой миграции не меняет ни одной буквы в том, как пишутся статьи: сначала
-- появляется место для настройки, и только потом кто-то её меняет.
--
-- Строк для embeddings и image здесь намеренно нет: они сегодня настраиваются
-- переменными окружения (EMBEDDING_MODEL, FAL_IMAGE_MODEL), и если завести им
-- строки вслепую, настройка выкладки тихо перестанет действовать. Появится
-- строка — она станет главнее окружения; это осознанный шаг, а не побочный.

begin;

create table if not exists seo.model_roles (
  role           text primary key,
  provider       text not null,
  model          text not null,
  prompt_version text,
  max_tokens     int,
  enabled        boolean not null default true,
  note           text,
  updated_at     timestamptz not null default now()
);

comment on table seo.model_roles is
  'Чем работает каждая роль конвейера. Пусто для роли — работает то, что стоит в коде: '
  'отсутствие строки означает «как было», а не «выключено».';

comment on column seo.model_roles.role is
  'writer | fact_reviewer | context_reviewer | diagrams | embeddings | image. '
  'Без ограничения списком нарочно: новая роль не должна требовать миграции.';

comment on column seo.model_roles.prompt_version is
  'Версия промпта. Попадает в ключ кэша проверок: новый промпт — новая проверка, '
  'а не тот же ответ из кэша.';

comment on column seo.model_roles.enabled is
  'false — строка есть, но не действует: вернётся значение из кода. Нужно, чтобы '
  'откатить настройку, не теряя её.';

insert into seo.model_roles (role, provider, model, prompt_version, note) values
  ('writer',           'anthropic', 'claude-opus-5', 'v1', 'как в коде на 17 сентября'),
  ('fact_reviewer',    'anthropic', 'claude-opus-5', 'v1', 'как в коде на 17 сентября'),
  ('context_reviewer', 'anthropic', 'claude-opus-5', 'v1', 'как в коде на 17 сентября'),
  ('diagrams',         'anthropic', 'claude-opus-5', 'v1', 'как в коде на 17 сентября')
on conflict (role) do nothing;

commit;

-- Проверить:
--   select role, provider, model, prompt_version from seo.model_roles order by role;
--   ожидается: четыре строки, все claude-opus-5 — то же, что работает сейчас
