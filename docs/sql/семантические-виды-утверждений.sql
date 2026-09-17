-- E2.9: два новых вида утверждений в словаре.
--
-- Зачем. Проверка формулировок без чисел (lib/seo/semantic-claims.ts) находит
-- обещания результата и утверждения о праве на работу. Сами находки живут в
-- памяти и в базу ничего не пишут — этот файл им не нужен, конвейер работает
-- без него.
--
-- Когда понадобится. Как только захочется, чтобы эксперт мог подтвердить такое
-- утверждение подписью, как подтверждает цену: подтверждение заводит строку в
-- seo.claims, а claims.kind ссылается на claim_policy.kind. Без этих двух строк
-- вставка упадёт на внешнем ключе.
--
-- Источники и сроки взяты по образцу соседей в словаре. Обещание подтверждает
-- только внутренний эксперт — обещать за вуз не может ни один официальный
-- источник, и срок ему 90 дней, как визовым правилам: цена ошибки высока.
-- Право на работу — государственный источник и 180 дней: меняется законами, а
-- не сезоном. autopilot_ok = false у обоих: ни то, ни другое машина
-- подтверждать не должна, только человек.
--
-- Применять в SQL Editor проекта pxtwaxhmygnssyyowrgr. Повторный запуск
-- безопасен.

insert into seo.claim_policy (kind, required_kinds, preferred_kinds, default_ttl, autopilot_ok)
values
  ('promise',     array['internal_expert'],          array['internal_expert'],          interval '90 days',  false),
  ('work_rights', array['official_gov'],              array['official_gov', 'ministry'], interval '180 days', false)
on conflict (kind) do nothing;

-- Проверка: должно вернуть две строки
-- select kind, default_ttl, autopilot_ok from seo.claim_policy where kind in ('promise', 'work_rights');
