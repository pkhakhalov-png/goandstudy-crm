# Database Indexes

Три отдельных Supabase-проекта — каждый со своими индексами.

## 1. Main CRM (`pxtwaxhmygnssyyowrgr`)

Файл: [`migrations/20260506000000_indexes.sql`](./migrations/20260506000000_indexes.sql)

Применяется обычным flow миграций:

```bash
# Через Supabase CLI (нужен supabase login + supabase link)
supabase db push

# Или вручную: скопировать содержимое в SQL Editor проекта main
```

Содержит индексы для всех таблиц CRM: `clients`, `deals`, `payments`,
`client_documents`, `client_essays`, `client_universities`, `client_scholarships`,
`client_applications`, `client_activities`, `users`, `curators`, `client_invitations`,
`curator_invitations`, `curator_stages`, `client_stages`, `client_shortlists` и др.

## 2. Parser DB (`ymyzzdnmadtxzjuvpefq`)

Файл: [`parser-indexes.sql`](./parser-indexes.sql)

**Запускать вручную в SQL Editor парсер-проекта**, ПО ОДНОМУ statement'у —
`CREATE INDEX CONCURRENTLY` не работает внутри транзакции (а Editor по
умолчанию каждый run = транзакция).

Особенно важные:
- `idx_programs_school_id`, `idx_programs_source`, `idx_programs_specialty_group` — фильтры каталога
- `idx_programs_jsonb_level`, `idx_programs_jsonb_intake_start` — JSONB-фильтры (наш level/intake)
- `idx_programs_name_trgm` — GIN trigram для ILIKE-поиска «Что изучать?»
- `idx_schools_country_code` — фильтр по стране через embedded join

## 3. Scholarships DB

Файл: [`scholarships-indexes.sql`](./scholarships-indexes.sql)

То же самое — вручную в SQL Editor проекта стипендий, по одному
statement'у с CONCURRENTLY.

## Best practices применённые

(на основе `supabase-postgres-best-practices`):

1. **FK columns indexed** — Postgres не делает это автоматически
2. **Composite indexes** — leftmost для equality, range последним
3. **Partial indexes** — `WHERE x IS NOT NULL` где запрос всегда такой
4. **GIN trigram** — для `ILIKE %query%` (B-tree не работает с wildcards)
5. **JSONB expression indexes** — `((raw_data #>> '{a,b}'))` для частых путей
6. **CONCURRENTLY** — для прода с нагрузкой, чтоб не блокировать записи
7. **ANALYZE** — после индексов, обновляет статистику оптимизатора

## Что НЕ делали

- `tsvector` full-text search — пока хватает trigram, добавим если будет
  жалоба на качество поиска
- BRIN на created_at — у нас нет огромных time-series таблиц
- Hash indexes — B-tree почти такой же быстрый и универсальнее

## Когда добавлять новые индексы

1. Появилась медленная query (проверь через `pg_stat_statements`)
2. EXPLAIN ANALYZE показывает Seq Scan на большой таблице
3. Новый фильтр в UI = вероятно нужен индекс под него

Не добавляй "впрок" — каждый индекс замедляет INSERT/UPDATE.
