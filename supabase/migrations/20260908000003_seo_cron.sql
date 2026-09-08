-- ═══════════════════════════════════════════════════════════════════════════
-- SEO cron (PRD v1.2, 10.3). Расширения + функции планировщика.
-- ВАЖНО: сам тик НЕ планируется при применении миграции — включается вручную
-- вызовом `select seo.schedule_all();` ПОСЛЕ того как: (1) задеплоен /api/seo/tick,
-- (2) в Vault лежит секрет SEO_TICK_SECRET, (3) воркер проверен на job-echo.
-- Так применение схемы не начинает дёргать эндпоинты раньше времени.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Куда стучимся тиком. Меняется через seo.settings (key='tick_url').
insert into seo.settings (key, value)
values ('tick_url', to_jsonb('https://crm.goandstudy.com/api/seo/tick'::text))
on conflict (key) do nothing;

-- Один тик: POST на /api/seo/tick с секретом из Vault (ответ не нужен — pg_net async).
create or replace function seo.dispatch_tick()
returns void
language plpgsql
security definer
as $$
declare
  v_url    text;
  v_secret text;
begin
  select (value #>> '{}') into v_url from seo.settings where key='tick_url';
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name='SEO_TICK_SECRET';
  exception when others then
    v_secret := null;   -- Vault недоступен/секрета нет — тик не шлём
  end;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-seo-tick-secret', v_secret),
    body    := '{}'::jsonb
  );
end $$;

-- Ночные джобы кладут задачи в свои lanes (тела реализуются в соответствующих M).
-- Пока — заглушки-функции, чтобы расписание ссылалось на существующие имена.
create or replace function seo.enqueue_nightly(p_lane text)
returns void language plpgsql as $$
begin
  -- реализуется в M1/M2/M5/M12/M3 (обход, gsc, находки, freshness, сшивка)
  -- placeholder: ничего не делает, пока модули не готовы
  perform 1;
end $$;

-- Включить всё расписание (идемпотентно). Вызывать вручную после проверки воркера.
create or replace function seo.schedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job
    where jobname in ('seo_tick','seo_crawl','seo_gsc','seo_findings','seo_freshness','seo_attribution');
  perform cron.schedule('seo_tick',        '* * * * *',  $q$ select seo.dispatch_tick(); $q$);
  perform cron.schedule('seo_attribution', '0 1 * * *',  $q$ select seo.enqueue_nightly('attribution'); $q$);
  perform cron.schedule('seo_crawl',       '0 2 * * *',  $q$ select seo.enqueue_nightly('crawl'); $q$);
  perform cron.schedule('seo_freshness',   '0 3 * * *',  $q$ select seo.enqueue_nightly('freshness'); $q$);
  perform cron.schedule('seo_gsc',         '0 4 * * *',  $q$ select seo.enqueue_nightly('gsc'); $q$);
  perform cron.schedule('seo_findings',    '0 5 * * *',  $q$ select seo.enqueue_nightly('index'); $q$);
end $$;

create or replace function seo.unschedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job
    where jobname in ('seo_tick','seo_crawl','seo_gsc','seo_findings','seo_freshness','seo_attribution');
end $$;
