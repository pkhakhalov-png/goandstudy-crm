-- Технический аудит (порт чеклистов claude-seo: seo-technical / seo-schema).
-- 1) храним факт наличия JSON-LD на странице (для находки missing_schema и генерации схемы);
-- 2) таблица для будущей генерации/хранения schema.org разметки по странице (seo-schema).
-- Применяется вручную через Supabase SQL Editor (ref pxtwaxhmygnssyyowrgr).

alter table seo.pages add column if not exists has_schema boolean;

-- обнаруженные на странице типы schema.org (@type из JSON-LD) — для аудита покрытия
alter table seo.pages add column if not exists schema_types text[];

-- сгенерированная/предложенная разметка по странице (источник recommend|bridge)
create table if not exists seo.page_schema (
  id           bigserial primary key,
  page_id      bigint not null references seo.pages(id) on delete cascade,
  schema_type  text not null,               -- Article | Course | Organization | FAQPage ...
  jsonld       jsonb not null,              -- готовый объект JSON-LD
  source       text not null default 'recommend',  -- recommend | bridge
  status       text not null default 'proposed',   -- proposed | applied | dismissed
  created_at   timestamptz default now(),
  applied_at   timestamptz
);

create index if not exists page_schema_page_idx on seo.page_schema(page_id);
create unique index if not exists page_schema_page_type_uq on seo.page_schema(page_id, schema_type);

notify pgrst, 'reload schema';
