-- Один владелец расписаний (PRD, инвариант 3).
--
-- Что было. В кроне пять ночных заданий, каждое зовёт seo.enqueue_nightly(lane).
-- Эта функция — заглушка: внутри `perform 1`, то есть ничего. Всю ночную работу
-- на самом деле ставит тик: раз в сутки он добавляет одиннадцать шагов обхода,
-- импорта и находок, и раз в час — шаги потока статей.
--
-- Это хуже, чем два владельца. Два спорили бы, и спор был бы виден. А здесь
-- один работает, а пять лишь выглядят работающими: открыв миграцию, человек
-- уверен, что обход запускается в два часа ночи, и ищет беду не там.
--
-- Что стало. В кроне остаётся один seo_tick. Он и есть тот самый «pg_cron →
-- /api/seo/tick ставит задачи», который PRD называет единственным владельцем.
--
-- Функция enqueue_nightly НЕ удаляется. Удалять то, чего я не могу прочитать,
-- нельзя: её могли переопределить руками в SQL Editor, и тогда удаление снесло
-- бы живую логику. Она просто перестаёт вызываться, и рядом остаётся пометка.

begin;

-- Снимаем только то, что действительно стоит: unschedule по несуществующему
-- имени падает с ошибкой и откатил бы всю транзакцию.
do $$
declare
  v_name text;
begin
  for v_name in
    select jobname from cron.job
     where jobname in ('seo_crawl', 'seo_gsc', 'seo_findings', 'seo_freshness', 'seo_attribution')
  loop
    perform cron.unschedule(v_name);
    raise notice 'снято ночное задание: %', v_name;
  end loop;
end $$;

comment on function seo.enqueue_nightly(text) is
  'НЕ ИСПОЛЬЗУЕТСЯ с 17.09.2026. Была заглушкой, её вызовы сняты из крона. '
  'Ночную работу ставит /api/seo/tick — он единственный владелец расписаний.';

-- ── schedule_all больше не возвращает снятые задания ────────────────────────
--
-- Иначе первый же вызов после этой миграции вернул бы всё как было, и через
-- месяц никто бы не понял, откуда снова взялись ночные задания-пустышки.
create or replace function seo.schedule_all()
returns void language plpgsql as $$
begin
  -- Единственное расписание: тик раз в минуту. Что и когда ставить в очередь,
  -- решает сам тик — там это видно в коде, а не размазано между кроном и кодом.
  perform cron.unschedule(jobname) from cron.job where jobname = 'seo_tick';
  perform cron.schedule('seo_tick', '* * * * *', $q$ select seo.dispatch_tick(); $q$);
end $$;

create or replace function seo.unschedule_all()
returns void language plpgsql as $$
declare
  v_name text;
begin
  for v_name in
    select jobname from cron.job
     where jobname in ('seo_tick','seo_crawl','seo_gsc','seo_findings','seo_freshness','seo_attribution')
  loop
    perform cron.unschedule(v_name);
  end loop;
end $$;

commit;

-- Проверить, что осталось:
--   select jobname, schedule, command, active from cron.job order by jobname;
-- Ожидается одна строка: seo_tick, '* * * * *'.
