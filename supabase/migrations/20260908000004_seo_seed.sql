-- ═══════════════════════════════════════════════════════════════════════════
-- SEO seed (PRD v1.2, приложение D): settings по умолчанию, claim_policy, brand_terms.
-- Значения — стартовые, калибруются на этапе 1.
-- ═══════════════════════════════════════════════════════════════════════════

insert into seo.settings (key, value) values
  ('autopilot_enabled',          to_jsonb(false)),
  ('autopilot_daily_limit',      to_jsonb(20)),
  ('autopilot_budget_limit',     to_jsonb(20)),        -- USD/сутки
  ('similarity_threshold',       to_jsonb(0.86)),      -- калибруется на 50 парах, этап 1
  ('max_topic_depth',            to_jsonb(1)),
  ('auto_topic_daily_limit',     to_jsonb(10)),
  ('worker_concurrency_by_lane', '{"production":3,"crawl":2,"gsc":1,"freshness":2,"index":1,"attribution":1,"autopilot":1}'::jsonb),
  ('embedding_model',            to_jsonb('voyage-3'::text)),   -- vector(1024)
  ('tracker_consent_required',   to_jsonb(true)),
  ('brand_terms',                '["goandstudy","го энд стади","гоэндстади","go and study"]'::jsonb)
on conflict (key) do nothing;

-- Стартовая claim_policy (приложение D). required_kinds — «нужен хотя бы один
-- источник из списка» (см. 7.4 confirmed). autopilot_ok = false до конца этапа 5.
insert into seo.claim_policy (kind, required_kinds, preferred_kinds, default_ttl, autopilot_ok) values
  ('tuition_fee',          array['university_program'],                    array['university_program','university_general'], interval '180 days', false),
  ('deadline',             array['university_program'],                    array['university_program'],                     interval '30 days',  false),
  ('language_req',         array['university_program'],                    array['university_program','university_general'], interval '180 days', false),
  ('visa_requirement',     array['official_gov'],                          array['official_gov','ministry'],                interval '90 days',  false),
  ('eligibility',          array['university_program','official_gov'],     array['university_program'],                     interval '180 days', false),
  ('document_req',         array['university_program','official_gov'],     array['university_program'],                     interval '180 days', false),
  ('scholarship',          array['university_general','official_gov'],     array['university_program'],                     interval '180 days', false),
  ('practical_timeline',   array['internal_expert'],                       array['internal_expert'],                        interval '180 days', false),
  ('practice_vs_official', array['internal_expert'],                       array['internal_expert'],                        interval '180 days', false),
  ('system_basics',        array['official_gov','ministry'],               array['ministry'],                               interval '730 days', false),
  ('internal_stat',        array['internal_stats'],                        array['internal_stats'],                         interval '365 days', false)
on conflict (kind) do nothing;
