-- Кабинет куратора v2, миграция 025: место в подборке назначает база.
--
-- ЧТО СЛУЧИЛОСЬ. Куратор попросил «добавь ещё несколько программ», помощник
-- вызвал добавление четыре раза одним ходом, и все четыре вызова прочитали
-- одну и ту же максимальную позицию. Две программы встали на седьмое место.
--
-- ЧЕМ ЭТО ПЛОХО. Порядок в подборке — это не украшение: куратор ставит вперёд
-- главное, а клиент читает сверху вниз. При одинаковых позициях порядок между
-- двумя открытиями страницы может оказаться разным, и «переставь вторую» тогда
-- переставит не ту. Молча.
--
-- ПОЧЕМУ В БАЗЕ, А НЕ В КОДЕ. «Прочитать максимум и прибавить единицу» ломается
-- всегда, когда писателей двое, — а их теперь двое и будет больше. Единственное
-- место, где можно посчитать без гонки, — та же транзакция, что и вставка.
--
-- ПОЧЕМУ ОДНОГО ТРИГГЕРА МАЛО. Первая попытка считала максимум прямо в
-- триггере — и четыре одновременные вставки в тесте дали места 0, 1, 1, 2.
-- Параллельные транзакции не видят неподтверждённых строк друг друга, поэтому
-- максимум они читают один и тот же. Нужна блокировка на подборку: вставки в
-- одну подборку выстраиваются в очередь, вставки в разные идут параллельно.
--
-- ПОЧЕМУ НЕ УНИКАЛЬНЫЙ ИНДЕКС. Перестановка «выше/ниже» меняет позиции двух
-- строк двумя отдельными запросами; уникальный индекс отверг бы первый из них.
-- Отложенный индекс не помог бы — запросы идут не в одной транзакции.
--
-- Откат: supabase/migrations/care/025_shortlist_position_by_db.rollback.sql

begin;

-- Сначала развести уже столкнувшиеся: нумеруем подряд в текущем видимом
-- порядке, чтобы у куратора на экране ничего не переставилось.
with новые as (
  select id,
         (row_number() over (partition by shortlist_id order by position, created_at) - 1) as номер
    from care.shortlist_items
)
update care.shortlist_items с
   set position = н.номер
  from новые н
 where н.id = с.id
   and с.position is distinct from н.номер;

create or replace function care.shortlist_item_position()
returns trigger
language plpgsql
as $$
begin
  -- Позиция пришла явно — не трогаем: так работает перестановка.
  if new.position is not null then
    return new;
  end if;

  -- Блокировка держится до конца транзакции и действует на одну подборку.
  -- Без неё параллельные вставки читают один и тот же максимум.
  perform pg_advisory_xact_lock(hashtext(new.shortlist_id::text));

  select coalesce(max(position), -1) + 1
    into new.position
    from care.shortlist_items
   where shortlist_id = new.shortlist_id;

  return new;
end;
$$;

drop trigger if exists shortlist_item_position on care.shortlist_items;
create trigger shortlist_item_position
  before insert on care.shortlist_items
  for each row
  execute function care.shortlist_item_position();

-- Без значения по умолчанию: столбец not null с default 0 не дал бы триггеру
-- увидеть null и каждая вставка без позиции садилась бы на нулевое место.
alter table care.shortlist_items alter column position drop not null;
alter table care.shortlist_items alter column position drop default;

commit;
