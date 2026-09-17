-- Исходы отправки, включая неизвестный (E5.11).
--
-- Разведка Telegram выяснила неприятное: у Bot API нет ключа идемпотентности и
-- бот не может прочитать историю канала. Значит, если запрос на отправку ушёл,
-- а ответ не дошёл, узнать штатными средствами, опубликовалось сообщение или
-- нет, нельзя.
--
-- Это состояние надо где-то хранить, и все три привычных варианта — ложь.
--
--   Оставить 'publishing' — значит сказать «отправляется» про то, что уже не
--     отправляется. Через сутки такая строка читается как зависший процесс.
--   Написать 'failed' — значит сказать «не вышло» про то, что, возможно,
--     вышло. Следом кто-нибудь нажмёт «повторить» и получит второй пост.
--   Написать 'published' — значит показать в отчёте публикацию, которой может
--     не быть, со ссылкой, которая никуда не ведёт.
--
-- Поэтому заводится отдельный статус: 'unknown' — «отправляли, исход
-- неизвестен». Он неудобен ровно настолько, насколько неудобна сама ситуация,
-- и это правильно: неудобство видно, а тихая ложь — нет.
--
-- Отзыв токена — не исход публикации, а состояние канала. Публикация при этом
-- возвращается в план: она не провалилась, она ещё не ушла.

begin;

alter table content.publications drop constraint if exists publications_status_check;
alter table content.publications add constraint publications_status_check
  check (status in ('scheduled', 'publishing', 'published', 'failed', 'superseded', 'cancelled', 'unknown'));

comment on column content.publications.status is
  'scheduled | publishing | published | failed | superseded | cancelled | unknown. '
  'unknown — отправляли, исход неизвестен: ответ не дошёл, а способа спросить у площадки нет. '
  'Это не failed и не published; оба этих ответа были бы неправдой.';

-- Индексы по новому статусу: неизвестные исходы разбирают отдельным проходом,
-- и искать их среди всех публикаций не надо.
create index if not exists publications_unknown
  on content.publications (channel_id, scheduled_at)
  where status = 'unknown';

-- ── Отзыв токена ────────────────────────────────────────────────────────────

create or replace function content.channel_auth_failed(
  p_channel_id bigint,
  p_reason     text
) returns table (out_paused_publications int)
language plpgsql as $$
declare
  ch      record;
  v_back  int := 0;
begin
  select * into ch from content.channels where id = p_channel_id;
  if ch is null then raise exception 'канала % нет', p_channel_id; end if;

  -- Останавливается ТОЛЬКО этот канал. Требование гейта E5: отзыв токена
  -- одного канала не ломает остальные и не трогает выпуск статей на сайт.
  update content.channels set mode = 'stopped' where id = p_channel_id;

  -- Публикации, которые не успели уйти, возвращаются в план. Они не
  -- провалились — им просто нечем было отправиться.
  update content.publications
     set status = 'scheduled'
   where channel_id = p_channel_id and status = 'publishing';
  get diagnostics v_back = row_count;

  insert into content.attention_items (
    reason_code, severity, entity_type, entity_id, suggested_action
  )
  select 'auth_required', 'high', 'channel', p_channel_id,
         format('Канал %s: площадка не приняла токен (%s). Канал остановлен, %s публикаций вернулись в план. Обновить токен и включить канал.',
                ch.account_external_id, p_reason, v_back)
   where not exists (
     select 1 from content.attention_items a
      where a.reason_code = 'auth_required'
        and a.entity_type = 'channel' and a.entity_id = p_channel_id
        and a.resolved_at is null);

  return query select v_back;
end $$;

comment on function content.channel_auth_failed is
  'Токен канала не принят: останавливается только этот канал, его неотправленные '
  'публикации возвращаются в план, заводится вопрос. Остальные каналы и выпуск '
  'статей на сайт не трогаются — это требование гейта E5.';

grant execute on all functions in schema content to service_role;

commit;

-- Проверить:
--   select status, count(*) from content.publications group by 1;
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'content.publications'::regclass and conname = 'publications_status_check';
--   ожидается: в списке статусов есть unknown
