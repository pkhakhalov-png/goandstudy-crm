-- Планирование выпуска (E4.9).
--
-- Поставить пост в календарь — самая простая часть. Сложное начинается там,
-- где план встречается с действительностью: сервер лежал сутки, площадка
-- ответила не сразу, материал устарел, пока ждал очереди. Каждый из этих
-- случаев по отдельности выглядит мелочью, а вместе они дают ленту, в которой
-- три поста подряд вышли в одну минуту и все три говорят вчерашнее.
--
-- Поэтому здесь не функция «запланировать», а набор запретов.
--
--   Слот занят — второй пост в тот же слот не встаёт. Держит уникальный
--     индекс, а не проверка перед вставкой: проверка и вставка — два действия,
--     между которыми успевает второй воркер.
--   Дневной темп — один пост на канал в день. Повышать только после замера,
--     как прямо сказано в PRD. Задаётся у канала, а не константой в коде.
--   Та же версия варианта уже стоит в плане — второй раз не встаёт.
--   Материал не актуален — слот пропускается. Заполнять план устаревшим
--     запрещено, и это проверяется, а не подразумевается.
--   После простоя накопленное не заливается залпом.
--
-- Время. Храним UTC, зону аккаунта — отдельно. «В девять утра» без зоны это
-- не время, а намерение: для московского канала и для канала в другой зоне
-- это разные моменты, и слот у них разный.

begin;

alter table content.channels
  add column if not exists daily_cap     int not null default 1,
  add column if not exists max_catch_up  int not null default 1;

comment on column content.channels.daily_cap is
  'Сколько постов в день допускается на этом канале. Единица — это темп из PRD, '
  'и повышать его без замера нельзя. Стоит у канала, а не в коде, чтобы повышение '
  'было решением, а не правкой.';
comment on column content.channels.max_catch_up is
  'Сколько просроченных слотов разрешено догнать за один проход после простоя. '
  'Без этого сутки простоя выливаются в ленту из двадцати постов за минуту.';

alter table content.publications
  add column if not exists slot_day    date,
  add column if not exists slot_no     int not null default 0,
  add column if not exists fingerprint text;

comment on column content.publications.slot_day is
  'День слота В ЗОНЕ КАНАЛА, а не в UTC. Пост на 23:30 по Москве и пост на 00:30 '
  'следующего дня — разные дни для читателя, и слот у них разный.';
comment on column content.publications.fingerprint is
  'Отпечаток содержания. По нему видно, что мы третий раз за месяц выпускаем '
  'один тезис другими словами, даже если текст каждый раз новый.';

-- Слот занят — второй не встанет. Уникальный индекс, а не проверка в коде:
-- между проверкой и вставкой успевает второй воркер.
create unique index if not exists publications_slot_unique
  on content.publications (channel_id, slot_day, slot_no)
  where status in ('scheduled', 'publishing', 'published');

-- Одна версия варианта — одна активная публикация на канал.
create unique index if not exists publications_version_unique
  on content.publications (channel_id, variant_version_id)
  where status in ('scheduled', 'publishing', 'published');

create index if not exists publications_fingerprint
  on content.publications (channel_id, fingerprint)
  where fingerprint is not null and status in ('scheduled', 'publishing', 'published');

-- ── Запланировать ───────────────────────────────────────────────────────────

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

  if ch.mode <> 'active' then
    return query select null::bigint, null::date,
      format('канал %s: режим %s, новые публикации не ставятся', ch.account_external_id, ch.mode);
    return;
  end if;

  -- День слота считается в зоне канала.
  v_slot_day := (p_desired_at at time zone ch.timezone)::date;

  -- Материал должен быть актуальным. Вариант, собранный по устаревшей версии
  -- пакета, в план не ставится: «нет качественного материала — слот
  -- пропускается» означает пропустить слот, а не заполнить его вчерашним.
  select vv.package_version_id, v.package_id into v_pkg_ver, v_pkg
    from content.variant_versions vv
    join content.variants v on v.id = vv.variant_id
   where vv.id = p_variant_version_id;

  if v_pkg_ver is null then
    return query select null::bigint, v_slot_day, 'вариант не привязан к версии пакета — проверять нечего';
    return;
  end if;

  select current_version_id into v_current from content.packages where id = v_pkg;
  if v_current is distinct from v_pkg_ver then
    return query select null::bigint, v_slot_day,
      'материал устарел: вариант собран по прошлой версии пакета — слот пропускается';
    return;
  end if;

  -- Дневной темп.
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

  -- Тот же тезис уже стоит в плане.
  if p_fingerprint is not null and exists (
    select 1 from content.publications p
     where p.channel_id = p_channel_id
       and p.fingerprint = p_fingerprint
       and p.status in ('scheduled', 'publishing', 'published'))
  then
    return query select null::bigint, v_slot_day, 'такой же тезис уже в плане на этом канале';
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
    -- Слот заняли между проверкой и вставкой, либо это повтор по ключу.
    select id into v_pub_id from content.publications
     where channel_id = p_channel_id and idempotency_key = p_idempotency_key;
    if v_pub_id is not null then
      return query select v_pub_id, v_slot_day, 'повтор: публикация с таким ключом уже есть';
    else
      return query select null::bigint, v_slot_day, 'слот занят другой публикацией';
    end if;
    return;
  end;

  return query select v_pub_id, v_slot_day, null::text;
end $$;

comment on function content.schedule_publication is
  'Ставит публикацию в слот или объясняет, почему не поставила. Пропуск слота — '
  'нормальный исход, а не ошибка: заполнять план устаревшим запрещено.';

-- ── После простоя ───────────────────────────────────────────────────────────

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

  -- Просроченные слоты: время вышло, а пост не ушёл. Столько, сколько
  -- разрешено догнать, — остальные не «потерялись», а отложены и видны.
  with просроченные as (
    select p.id, row_number() over (order by p.scheduled_at) as n
      from content.publications p
     where p.channel_id = p_channel_id
       and p.status = 'scheduled'
       and p.scheduled_at < p_now
  )
  update content.publications p
     set scheduled_at = p_now
    from просроченные s
   where p.id = s.id and s.n <= ch.max_catch_up;
  get diagnostics v_release = row_count;

  -- Остальные просроченные выносятся человеку, а не сдвигаются молча:
  -- «догнать» и «выпустить вчерашнее сегодня» — разные решения.
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
     and not exists (
       select 1 from content.attention_items a
        where a.reason_code = 'slot_expired'
          and a.entity_type = 'publication' and a.entity_id = p.id
          and a.resolved_at is null);
  get diagnostics v_defer = row_count;

  return query select v_release, v_defer;
end $$;

comment on function content.catch_up is
  'После простоя выпускает не больше max_catch_up просроченных, остальные выносит '
  'в очередь внимания. Сутки простоя не должны превращаться в двадцать постов за минуту.';

grant execute on all functions in schema content to service_role;

commit;

-- Проверить:
--   select id, account_external_id, daily_cap, max_catch_up, timezone from content.channels;
--   ожидается: каналов нет — они заводятся отдельно
