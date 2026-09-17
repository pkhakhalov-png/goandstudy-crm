-- Починка планирования: две ошибки, найденные проверкой на живой базе.
--
-- Первая. Проверка ключа повтора стояла последней, в обработчике исключения,
-- и до неё не доходило: повтор упирался в дневной темп и получал ответ «темп
-- исчерпан». Это не придирка к формулировке — это другой ответ. Обычный повтор
-- после обрыва сети выглядел как отказ по лимиту, и вызывающий, разбирая такой
-- ответ, отложил бы публикацию, которая на самом деле уже стоит в плане.
-- Проверка ключа теперь первая: сначала «мы это уже делали», потом всё
-- остальное.
--
-- Вторая серьёзнее. Догон после простоя выставлял просроченному посту время
-- «сейчас» — и следующий проход, случившийся минутой позже, снова видел его
-- просроченным и заводил по нему вопрос. То есть система догоняла пост и тут
-- же жаловалась на него сама себе. При проходе раз в пять минут очередь
-- внимания за сутки наполнилась бы сотнями одинаковых строк, и настоящие
-- вопросы в ней утонули бы.
--
-- Лечится не сдвигом времени вперёд, а отметкой о принятом решении: пост,
-- который решили догнать, помечен, и второй раз его не догоняют. Если он
-- после этого так и не ушёл — это уже не «слот просрочен», а «отправка
-- застряла», и это другой вопрос с другой причиной.

begin;

alter table content.publications
  add column if not exists caught_up_at timestamptz;

comment on column content.publications.caught_up_at is
  'Когда решили догнать этот пост после простоя. Отметка о РЕШЕНИИ, а не о времени '
  'выпуска: догонять дважды нечего, а если пост и после этого не ушёл — причина '
  'другая, и вопрос должен называться иначе.';

create or replace function content.schedule_publication(
  p_channel_id         bigint,
  p_variant_version_id bigint,
  p_desired_at         timestamptz,
  p_idempotency_key    text,
  p_fingerprint        text default null,
  p_slot_no            int  default 0
) returns table (out_publication_id bigint, out_slot_day date, out_skipped text)
language plpgsql as $$
declare
  ch          record;
  v_slot_day  date;
  v_count     int;
  v_pub_id    bigint;
  v_pkg_ver   bigint;
  v_current   bigint;
  v_pkg       bigint;
begin
  select * into ch from content.channels where id = p_channel_id;
  if ch is null then
    raise exception 'канала % нет', p_channel_id;
  end if;

  -- Ключ повтора — ПЕРВЫМ. «Мы это уже делали» должно отвечаться раньше любых
  -- ограничений: повтор не потребляет темп и не занимает слот заново.
  select p.id, p.slot_day into v_pub_id, v_slot_day
    from content.publications p
   where p.channel_id = p_channel_id and p.idempotency_key = p_idempotency_key;
  if v_pub_id is not null then
    return query select v_pub_id, v_slot_day, 'повтор: публикация с таким ключом уже есть'::text;
    return;
  end if;

  if ch.mode <> 'active' then
    return query select null::bigint, (p_desired_at at time zone ch.timezone)::date,
      format('канал %s: режим %s, новые публикации не ставятся', ch.account_external_id, ch.mode);
    return;
  end if;

  v_slot_day := (p_desired_at at time zone ch.timezone)::date;

  select vv.package_version_id, v.package_id into v_pkg_ver, v_pkg
    from content.variant_versions vv
    join content.variants v on v.id = vv.variant_id
   where vv.id = p_variant_version_id;

  if v_pkg_ver is null then
    return query select null::bigint, v_slot_day, 'вариант не привязан к версии пакета — проверять нечего'::text;
    return;
  end if;

  select current_version_id into v_current from content.packages where id = v_pkg;
  if v_current is distinct from v_pkg_ver then
    return query select null::bigint, v_slot_day,
      'материал устарел: вариант собран по прошлой версии пакета — слот пропускается'::text;
    return;
  end if;

  select count(*) into v_count
    from content.publications p
   where p.channel_id = p_channel_id
     and p.slot_day = v_slot_day
     and p.status in ('scheduled', 'publishing', 'published');
  if v_count >= ch.daily_cap then
    return query select null::bigint, v_slot_day,
      format('дневной темп канала исчерпан: %s из %s', v_count, ch.daily_cap);
    return;
  end if;

  if p_fingerprint is not null and exists (
    select 1 from content.publications p
     where p.channel_id = p_channel_id
       and p.fingerprint = p_fingerprint
       and p.status in ('scheduled', 'publishing', 'published'))
  then
    return query select null::bigint, v_slot_day, 'такой же тезис уже в плане на этом канале'::text;
    return;
  end if;

  begin
    insert into content.publications (
      channel_id, variant_version_id, scheduled_at, status, idempotency_key,
      slot_day, slot_no, fingerprint, channel_policy_version_snapshot
    ) values (
      p_channel_id, p_variant_version_id, p_desired_at, 'scheduled', p_idempotency_key,
      v_slot_day, p_slot_no, p_fingerprint,
      (select to_jsonb(cp) from content.channel_policies cp where cp.id = ch.policy_id)
    )
    returning id into v_pub_id;
  exception when unique_violation then
    -- Слот или версию заняли между проверкой и вставкой. Индекс — последняя
    -- линия, и то, что она сработала, значит, что проверок мало, а не много.
    return query select null::bigint, v_slot_day,
      'слот или эта версия уже заняты другой публикацией'::text;
    return;
  end;

  return query select v_pub_id, v_slot_day, null::text;
end $$;

comment on function content.schedule_publication is
  'Ставит публикацию в слот или объясняет, почему не поставила. Повтор по ключу '
  'отвечается первым: он не потребляет темп и не занимает слот заново.';

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

  -- Догоняем только те, по которым решения ещё не принимали.
  with просроченные as (
    select p.id, row_number() over (order by p.scheduled_at) as n
      from content.publications p
     where p.channel_id = p_channel_id
       and p.status = 'scheduled'
       and p.scheduled_at < p_now
       and p.caught_up_at is null
  )
  update content.publications p
     set scheduled_at = p_now,
         caught_up_at = p_now
    from просроченные s
   where p.id = s.id and s.n <= ch.max_catch_up;
  get diagnostics v_release = row_count;

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
  'После простоя выпускает не больше max_catch_up просроченных и помечает решение. '
  'Догонять дважды нечего: пост, который догнали и который так и не ушёл, — это '
  'застрявшая отправка, другая причина и другой вопрос.';

grant execute on all functions in schema content to service_role;

commit;

-- Проверить:
--   select count(*) from content.publications where caught_up_at is not null;
--   ожидается: 0 — публикаций ещё нет
