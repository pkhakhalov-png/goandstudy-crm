-- Догон не отвечает за человека, которого уже спросил.
--
-- Что происходило. Первый проход догонял один просроченный пост, а по
-- остальным заводил вопрос: «слот прошёл, решить — выпустить, перенести или
-- снять». Второй проход брал из этих же остальных ещё один и выпускал. Третий
-- ещё один. То есть система задавала вопрос и, не дожидаясь ответа, отвечала
-- на него сама.
--
-- Это хуже лишней строки в очереди. Если код всё равно решит сам, то вопрос
-- был не вопросом, а уведомлением, притворяющимся вопросом, — и человек,
-- один раз это заметив, перестанет читать очередь внимания целиком.
--
-- PRD говорит «expired slots пересматриваются», а не «постепенно сливаются».
-- Пересматривает человек. Догон берёт свои max_catch_up один раз — это
-- решение про «сервер полежал десять минут, доставим». Всё, что дальше, —
-- это уже вопрос о том, актуально ли вчерашнее сегодня, и на него отвечаем
-- не мы.

begin;

create or replace function content.catch_up(
  p_channel_id bigint,
  p_now        timestamptz default now()
) returns table (out_released int, out_deferred int)
language plpgsql as $$
declare
  ch        record;
  v_release int := 0;
  v_defer   int := 0;
begin
  select * into ch from content.channels where id = p_channel_id;
  if ch is null then raise exception 'канала % нет', p_channel_id; end if;

  -- Догоняем только то, по чему решения ещё не принимали И о чём ещё не
  -- спрашивали. Открытый вопрос в очереди внимания — это «ждём человека»,
  -- и обходить его сзади нельзя.
  with просроченные as (
    select p.id, row_number() over (order by p.scheduled_at) as n
      from content.publications p
     where p.channel_id = p_channel_id
       and p.status = 'scheduled'
       and p.scheduled_at < p_now
       and p.caught_up_at is null
       and not exists (
         select 1 from content.attention_items a
          where a.reason_code = 'slot_expired'
            and a.entity_type = 'publication' and a.entity_id = p.id
            and a.resolved_at is null)
  )
  update content.publications p
     set scheduled_at = p_now,
         caught_up_at = p_now
    from просроченные s
   where p.id = s.id and s.n <= ch.max_catch_up;
  get diagnostics v_release = row_count;

  -- Про остальные спрашиваем — по одному разу на слот.
  insert into content.attention_items (
    reason_code, severity, entity_type, entity_id, suggested_action
  )
  select 'slot_expired', 'medium', 'publication', p.id,
         format('Слот на %s прошёл, пост не вышел. Решить: выпустить сейчас, перенести или снять.',
                to_char(p.scheduled_at at time zone ch.timezone, 'DD.MM HH24:MI'))
    from content.publications p
   where p.channel_id = p_channel_id
     and p.status = 'scheduled'
     and p.scheduled_at < p_now
     and p.caught_up_at is null
     and not exists (
       select 1 from content.attention_items a
        where a.reason_code = 'slot_expired'
          and a.entity_type = 'publication' and a.entity_id = p.id
          and a.resolved_at is null);
  get diagnostics v_defer = row_count;

  return query select v_release, v_defer;
end $$;

comment on function content.catch_up is
  'Догоняет не больше max_catch_up просроченных за первый проход и про остальные '
  'спрашивает человека. Повторные проходы не отвечают за него: открытый вопрос в '
  'очереди внимания означает «ждём», а не «можно брать».';

grant execute on all functions in schema content to service_role;

commit;

-- Проверить:
--   select reason_code, count(*) from content.attention_items where resolved_at is null group by 1;
