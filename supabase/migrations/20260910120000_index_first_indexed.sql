-- Дата, когда страница впервые оказалась в индексе.
-- Нужна, чтобы в конце месяца видеть: что вышло за месяц и сколько дней шло до индекса.
alter table seo.index_status add column if not exists first_indexed_at timestamptz;

-- Задним числом: у страниц, которые уже в индексе, считаем датой последний обход
-- Google. Это не точная дата попадания, но ближайшее честное приближение —
-- дальше значение проставляется в момент, когда статус меняется на «в индексе».
update seo.index_status
   set first_indexed_at = coalesce(last_crawl, checked_at)
 where verdict = 'PASS' and first_indexed_at is null;
