-- PRD v2.0 §7 — Opportunity Engine (этап 2). Персистентная приоритизированная очередь.
-- Пока не применена, /admin/seo/opportunities работает как вычисляемое представление
-- (lib/seo/opportunities.ts). Применение включает сохранение решений и калибровку.
-- Применяется вручную через Supabase SQL Editor (ref pxtwaxhmygnssyyowrgr).

create table if not exists seo.opportunities (
  id             bigserial primary key,
  kind           text not null,        -- ctr | striking_distance | cannibalization
                                       -- | orphan | broken_link | stale | schema
                                       -- | content_gap | technical
  page_ids       bigint[],             -- участники (1–3)
  topic_id       bigint references seo.topics(id),
  query_group    text[],               -- запросы, агрегированные до URL (§5.3)
  intent         text,                 -- informational | commercial | navigational
  funnel_stage   text,
  country        text,
  service        text,                 -- связанная услуга Go&Study
  decision       text,                 -- CREATE | UPDATE | EXPAND | MERGE
                                       -- | REPOSITION | REDIRECT | LINK_ONLY | IGNORE
  decision_reason text,
  risk           text not null default 'low',    -- low | medium | high
  confidence     numeric,              -- 0..1
  seo_score      numeric,
  business_value numeric,
  priority       numeric,
  forecast       jsonb,                -- {conservative, base, optimistic, basis}
  evidence       jsonb not null default '{}',    -- какие находки, сегменты, окна
  status         text not null default 'new',
      -- new | approved | queued | in_production | done | dismissed | expired
  assigned_to    uuid,
  created_at     timestamptz default now(),
  updated_at     timestamptz
);
create index if not exists opportunities_status_priority_idx on seo.opportunities (status, priority desc);

-- веса формулы приоритета (§7.3) — меняются без деплоя
insert into seo.settings (key, value) values
  ('priority_weights', '{"seo":1,"business":1,"product_fit":1,"ranking_prob":1,"seasonal":1,"conversion":1,"cost_divisor":1}')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
