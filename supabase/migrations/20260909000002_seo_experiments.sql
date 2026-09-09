-- PRD v2.0 §16 — Эксперименты (этап 1). Каждое изменение страницы — эксперимент
-- с зафиксированным baseline, одной переменной и решением оставить/откатить.
-- Применяется вручную через Supabase SQL Editor (ref pxtwaxhmygnssyyowrgr).

create table if not exists seo.experiments (
  id bigserial primary key,
  page_id bigint not null references seo.pages(id),
  opportunity_id bigint references seo.opportunities(id),
  change_set_id bigint references seo.change_sets(id),
  hypothesis text not null,
  change_type text not null,        -- snippet | content_expand | internal_links
                                    -- | schema | url_migration | merge
  changed_fields text[],
  baseline jsonb not null,          -- дата, версия, 28/56/90 дн: клики/показы/CTR/позиции
  primary_metric text not null,     -- ctr | clicks | position | leads
  guardrail_metrics text[],         -- что не должно ухудшиться
  min_observation_days int not null default 28,
  control_page_ids bigint[],        -- контрольная группа на момент старта
  started_at timestamptz not null default now(),
  result jsonb,
  outcome text,                     -- improved | neutral | degraded | inconclusive
  decision text,                    -- keep | rollback | continue
  decided_at timestamptz, decided_by uuid
);
create index if not exists experiments_page_idx on seo.experiments (page_id, started_at desc);

notify pgrst, 'reload schema';
