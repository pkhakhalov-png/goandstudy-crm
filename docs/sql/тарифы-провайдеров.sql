-- Тарифы на то, что теперь попадает в учёт: схемы, эмбеддинги, картинки (E1.11).
--
-- Что изменилось в коде. Платные вызовы схем (anthropic), эмбеддингов (voyage
-- или openai) и картинок (fal или openai) теперь проходят через withSpend и
-- ложатся в seo.runs. Тариф им нужен, чтобы стоимость перестала быть нулём.
--
-- Почему нули сейчас и почему их не надо «поправить» наугад. В model_pricing
-- лежат две заготовки с пометкой «ТАРИФ НЕ ПОДСТАВЛЕН» — voyage/voyage-3 и
-- fal/cover. Первая совпадает с тем, что вызывает код, и даёт честный ноль.
-- Вторая не совпадает ни с чем: модель у fal называется fal-ai/nano-banana-2,
-- и строки под этим именем нет. Тарифа нет — seo.run_cost возвращает null, а
-- withSpend пишет ноль и говорит об этом в лог:
--   [учёт] нет тарифа для fal/fal-ai/nano-banana-2: вызов записан нулём.
-- Это не поломка, это видимый пробел. Заполнять его выдуманными числами нельзя:
-- сумма в отчёте должна сходиться со счётом, а не выглядеть правдоподобно.
--
-- Что сделать. Взять настоящие цены в личных кабинетах и выполнить вставки ниже,
-- заменив нули. Тарифы именно вставляются, а не переписываются: seo.run_cost
-- берёт строку с последним effective_from, поэтому прошлые расчёты остаются
-- такими, какими были в момент вызова.
--
-- Применять в SQL Editor проекта pxtwaxhmygnssyyowrgr.

-- Что вызывает код прямо сейчас (для сверки имён):
--   anthropic / claude-opus-5            — выбор схем к статье (роль diagrams), тариф уже есть
--   voyage    / voyage-3                 — эмбеддинги (роль embeddings)
--   openai    / text-embedding-3-small   — эмбеддинги, если EMBEDDING_PROVIDER=openai
--   fal       / fal-ai/nano-banana-2     — картинки (роль image), имя из FAL_IMAGE_MODEL
--   openai    / gpt-image-1              — картинки, если ключа fal нет

-- 1. Картинки fal. unit = image, цена за изображение.
insert into seo.model_pricing (provider, model, input_per_mtok, output_per_mtok, unit, per_unit, effective_from, note)
values ('fal', 'fal-ai/nano-banana-2', 0, 0, 'image', 0 /* ← цена за картинку */, now(),
        'ЗАМЕНИТЬ на цену из кабинета fal; до замены расход по картинкам занижен');

-- 2. Эмбеддинги Voyage. unit = token, цена за миллион входных токенов.
insert into seo.model_pricing (provider, model, input_per_mtok, output_per_mtok, unit, per_unit, effective_from, note)
values ('voyage', 'voyage-3', 0 /* ← цена за миллион токенов */, 0, 'token', null, now(),
        'ЗАМЕНИТЬ на цену из кабинета Voyage; до замены расход по эмбеддингам занижен');

-- 3. Запасные поставщики — заводить только если переключимся на них.
-- insert into seo.model_pricing (provider, model, input_per_mtok, output_per_mtok, unit, per_unit, effective_from, note)
-- values ('openai', 'text-embedding-3-small', 0, 0, 'token', null, now(), 'запасной поставщик эмбеддингов'),
--        ('openai', 'gpt-image-1',            0, 0, 'image', 0,    now(), 'запасной поставщик картинок');

-- Проверка: по каждой строке должна быть видна последняя цена
-- select provider, model, unit, input_per_mtok, per_unit, effective_from, note
--   from seo.model_pricing order by provider, model, effective_from desc;

-- И сколько уже учтено по новым ролям (пока тарифов нет — нули, но объём виден):
-- select role, provider, model, count(*) вызовов, sum(input_tokens) токенов,
--        sum(units) штук, sum(cost) сумма
--   from seo.runs where role in ('diagrams', 'embeddings', 'image')
--  group by role, provider, model order by role;
