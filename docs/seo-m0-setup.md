# SEO M0 — применение на проде (инструкция)

Код M0 готов и проверен (ветка `feat/seo-m0`, коммит `de79a5d`). Ниже — шаги,
которые требуют доступов и выполняются человеком. Прод-инфру автоматика не трогала.

Всё изолировано в схеме `seo`; `public` (CRM) не меняется. Модуль обратим:
`drop schema seo cascade;` + снять cron (`select seo.unschedule_all();`).

---

## 1. Supabase CLI: link + сведение уже-накатанных вручную миграций ⚠️

Наши прошлые миграции применялись **вручную через SQL Editor**, поэтому CLI про них
«не знает» и при `db push` попытается накатить повторно (сломает прод). Порядок:

```bash
supabase login                                   # если не залогинен
supabase link --project-ref pxtwaxhmygnssyyowrgr # спросит DB password

supabase migration list                          # покажет: local есть, remote нет
```

Пометить **каждую старую** миграцию как уже применённую (НЕ прогоняя её повторно):

```bash
# по одному version-префиксу из migration list (всё, что ДО 20260908*)
supabase migration repair --status applied 20260410000000
supabase migration repair --status applied 20260410000001
# ... и так все существующие до 20260908000001
```

Проверить, что дифф пуст (БД == миграции, кроме новых seo):

```bash
supabase migration list        # старые → Applied; новые 20260908* → только Local
supabase db diff               # не должно показывать удаление/изменение public.*
```

> Если `db diff` показывает изменения в `public` — СТОП, не пушить, разобраться.
> Значит какая-то ручная миграция расходится с файлом.

## 2. Расширения

`vector`, `pg_cron`, `pg_net` включаются самими миграциями (`create extension if not exists`).
Если Supabase не даёт создать `pg_cron`/`pg_net` из миграции — включить в дашборде
Database → Extensions, затем повторить push.

## 3. Применить миграции seo

```bash
supabase db push               # накатит только 20260908000001..004
```

Проверить в БД: схема `seo` есть, 20+ таблиц, `select count(*) from seo.settings;` = 11,
`select count(*) from seo.claim_policy;` = 11.

## 4. Секреты

**Supabase Vault** (Database → Vault) — добавить секрет `SEO_TICK_SECRET` (любой длинный рандом).

**Vercel env** (Project Settings → Environment Variables) — из `.env.example`, блок SEO:
- `SEO_TICK_SECRET` (**то же значение**, что в Vault),
- `EMBEDDING_PROVIDER=voyage`, `EMBEDDING_API_KEY=<ключ Voyage>`, `EMBEDDING_MODEL=voyage-3`, `EMBEDDING_DIM=1024`,
- `SUPABASE_STORAGE_BUCKET=seo-snapshots`.

Создать бакет Storage `seo-snapshots` (private).

## 5. Деплой и проверка воркера (до включения cron)

Смёржить `feat/seo-m0` → задеплоить. Затем вручную дёрнуть тик и проверить job-echo:

```sql
-- положить тестовую задачу
insert into seo.jobs(step, lane) values ('echo','production');
```
```bash
curl -X POST https://crm.goandstudy.com/api/seo/tick \
  -H "x-seo-tick-secret: <SEO_TICK_SECRET>"
# ждём {"ok":true,"processed":1,...}
```
```sql
select step, status, result from seo.jobs where step='echo';  -- status=done
```

Открыть `/admin/seo` — «Обзор» должен показать «схема seo: применена ✓».

## 6. Включить планировщик (только после успешного теста воркера)

```sql
select seo.schedule_all();      -- тик каждую минуту + ночные заглушки
select jobname, schedule from cron.job where jobname like 'seo_%';
```
Выключить при необходимости: `select seo.unschedule_all();`

---

## Что дальше (нужны доступы к сайту)
- **M1 Инвентарь** — обход + WP REST + sitemap + GSC-universe.
- **M2 GSC** — OAuth (`GSC_*`).
- **M3 Атрибуция** — tracker, `/api/track*`, hidden-поле `anon_id` в `/book`, Tilda webhook, домен.
- **M4 WordPress Bridge** — mu-plugin, `WP_*`.

Блокирующее до этих этапов (раздел 17 PRD): домен WP (поддомен `goandstudy.com`?),
доступ к Tilda (webhook + hidden-поля), доступы WP, провайдер SERP.
