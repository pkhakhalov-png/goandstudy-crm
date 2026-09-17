-- Тарифы провайдеров на 17 сентября 2026.
--
-- Отдельным файлом от схемы намеренно: цены меняются чаще, чем таблицы, и
-- обновление тарифа не должно выглядеть как изменение структуры. Новая цена
-- добавляется строкой с новой effective_from — прошлые расчёты остаются
-- верными для своего времени.
--
-- Источники цен на дату: Anthropic — $5/$25 за миллион токенов для claude-opus-5,
-- чтение из кэша ×0.1, запись в кэш ×1.25 при пятиминутном сроке хранения.
-- Voyage и fal внесены с нулями и пометкой: их тариф надо подставить, и до тех
-- пор их вызовы будут видны в runs, но не будут учитываться в деньгах.

begin;

insert into seo.model_pricing
  (provider, model, input_per_mtok, output_per_mtok, cache_write_mult, cache_read_mult, unit, note)
values
  ('anthropic', 'claude-opus-5',   5.00, 25.00, 1.25, 0.10, 'token', 'основная модель производства статей'),
  ('anthropic', 'claude-sonnet-5', 3.00, 15.00, 1.25, 0.10, 'token', 'на случай перевода части шагов на более дешёвую модель'),
  ('anthropic', 'claude-haiku-4-5',1.00,  5.00, 1.25, 0.10, 'token', 'короткие служебные шаги')
on conflict do nothing;

-- Тарифы, которые надо уточнить. Ноль здесь означает «не знаем», и это видно
-- в отчёте: seo.run_cost вернёт ноль, а не null, поэтому рядом стоит пометка.
insert into seo.model_pricing
  (provider, model, input_per_mtok, output_per_mtok, unit, note)
values
  ('voyage', 'voyage-3', 0, 0, 'token', 'ТАРИФ НЕ ПОДСТАВЛЕН — уточнить в личном кабинете Voyage'),
  ('fal',    'cover',    0, 0, 'image', 'ТАРИФ НЕ ПОДСТАВЛЕН — уточнить в личном кабинете fal')
on conflict do nothing;

update seo.model_pricing set per_unit = 0 where unit = 'image' and per_unit is null;

commit;
