# Схему `seo` нужно применить к dev-проекту

_Найдено 17 сентября._

## Что обнаружилось

Дев-сервер работает не с боевой базой. В `.env.development.local` прописан
отдельный проект Supabase `ekdnujgjoepjxhrdetjt`, и он перекрывает `.env.local`.

В нём есть таблицы CRM (8 пользователей, 16 клиентов, 25 сделок, 108 записей),
но **нет схемы `seo`**. Любая функция SEO-модуля локально падает с
«Invalid schema: seo».

Обнаружилось так: новый маршрут приёма событий `/api/track` отвечал 204, но не
записывал ничего. Код оказался верным — не было схемы.

## Чем это плохо

1. **SEO-конвейер нельзя проверить локально.** Вся проверка идёт на боевой базе.
   Я это делал весь день: создавал и удалял тестовые задачи в живой очереди.
   Работает, но так быть не должно.
2. **Восстановление из бэкапа проверять негде** — а PRD этого требует (§14).
   Отдельный проект для этого создавать не нужно, он уже есть.

## Что сделать

Применить к проекту `ekdnujgjoepjxhrdetjt` те же миграции, что и к боевому, в
порядке их номеров:

```
supabase/migrations/20260908000001_seo_schema.sql
supabase/migrations/20260908000001_seo_technical.sql
supabase/migrations/20260908000002_seo_functions.sql
supabase/migrations/20260908000003_seo_cron.sql       ← ВНИМАНИЕ, см. ниже
supabase/migrations/20260908000004_seo_seed.sql
supabase/migrations/20260908000005_seo_grants.sql
supabase/migrations/20260909000001_seo_opportunities.sql
supabase/migrations/20260909000002_seo_experiments.sql
supabase/migrations/20260910120000_index_first_indexed.sql
supabase/migrations/20260911120000_jobs_runner.sql
supabase/migrations/20260917000000_claim_jobs_no_double.sql
supabase/migrations/20260917010000_job_lease_expand.sql
supabase/migrations/20260917020000_job_lease_enable.sql
supabase/migrations/20260917030000_cost_accounting.sql
supabase/migrations/20260917040000_model_pricing_seed.sql
supabase/migrations/20260917050000_single_scheduler.sql
supabase/migrations/20260917060000_provenance.sql
```

**Про cron отдельно.** Файл `20260908000003_seo_cron.sql` создаёт расписание, но
сам его НЕ включает — включение идёт отдельным вызовом `seo.schedule_all()`.
На dev его вызывать не надо: иначе dev-проект начнёт долбиться в боевой
`/api/seo/tick`, и получится второй исполнитель, которого никто не ждал.

После применения не забыть: **Settings → API → Exposed schemas** добавить `seo`,
иначе схема будет невидима снаружи и ошибка останется прежней.
