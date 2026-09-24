-- Когда со сделкой последний раз работал человек.
-- PRD: docs/PRD_SALES_UPGRADE.md, раздел 3.3.
--
-- Почему нельзя считать по `deals.updated_at`. Это поле двигает всё подряд:
-- входящее сообщение от клиента, фоновая правка, слияние дублей. Список
-- «застрявших» на нём и построен — и показывает 1041 сделку из 1111, то есть
-- 94 % базы. Списком, в котором почти всё, пользоваться нельзя: он не
-- отвечает на вопрос «где мы буксуем», он отвечает «везде».
--
-- Застревание — это когда НАШ человек ничего не сделал. Значит считать надо
-- по следам человека, а их ровно два:
--   · запись в ленте сделки, у которой есть автор (`user_id`) — заметка, смена
--     этапа, постановка задачи. Автоматические записи автора не имеют и сюда
--     не попадают, и это правильно: бот, переложивший сообщение, работой не
--     является;
--   · исходящее сообщение клиенту — самый честный признак, что с человеком
--     действительно говорили.
--
-- Входящие сообщения намеренно не учитываются. Клиент, который пишет третий
-- день без ответа, — это не «сделка в работе», это худший вид застревания.
--
-- Представление, а не колонка: хранимое поле пришлось бы поддерживать
-- триггерами на трёх таблицах и оно разъехалось бы с правдой при первой же
-- массовой правке.

begin;

-- Оба индекса частичные: строк с автором и исходящих заметно меньше, чем
-- всего, и полный индекс здесь был бы тратой места ради того же плана.
create index if not exists idx_deal_activities_human
  on public.deal_activities (deal_id, created_at desc)
  where user_id is not null;

create index if not exists idx_deal_messages_outgoing
  on public.deal_messages (deal_id, created_at desc)
  where direction = 'outgoing';

create or replace view public.v_deal_last_touch as
select
  d.id as deal_id,
  -- GREATEST в Postgres пропускает NULL и возвращает его, только если пусты
  -- оба аргумента. Тогда касаний не было вовсе — считаем от создания сделки,
  -- иначе новая сделка выглядела бы застрявшей с бесконечной давностью.
  coalesce(greatest(act.at, msg.at), d.created_at) as last_touch_at,
  act.at as last_human_activity_at,
  msg.at as last_outgoing_at
from public.deals d
left join lateral (
  select max(a.created_at) as at
    from public.deal_activities a
   where a.deal_id = d.id and a.user_id is not null
) act on true
left join lateral (
  select max(m.created_at) as at
    from public.deal_messages m
   where m.deal_id = d.id and m.direction = 'outgoing'
) msg on true
where d.deleted_at is null;

comment on view public.v_deal_last_touch is
  'Последнее касание сделки человеком: запись в ленте с автором либо исходящее '
  'сообщение. Основа честного списка застрявших — в отличие от deals.updated_at, '
  'который двигает любое входящее и любая фоновая правка.';

commit;

-- Проверить:
--   select count(*) from public.v_deal_last_touch
--    where last_touch_at < now() - interval '5 days';
