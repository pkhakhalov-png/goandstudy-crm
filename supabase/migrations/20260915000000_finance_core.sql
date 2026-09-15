-- Финансовый модуль: ядро учёта. Схема finance.
--
-- ВАЖНО: файл не применён. Прямого доступа к DDL из кода нет — выполните его
-- вручную в SQL-редакторе Supabase (проект pxtwaxhmygnssyyowrgr), целиком, одним
-- запуском. После этого добавьте схему `finance` в Settings → API → Exposed
-- schemas, иначе PostgREST её не увидит и приложение получит «schema not found».
--
-- Почему отдельная схема, а не таблицы в public. Так же сделан модуль SEO: слой
-- серверный, ходит под service_role, и отделение снижает риск, что случайный
-- `select` из браузера достанет денежные записи. Доступ к деньгам проверяется в
-- коде по таблице finance.access, а не ролью CRM: по PRD §5 доступ к CRM сам по
-- себе финансовых прав не даёт.
--
-- Деньги хранятся в минорных единицах (копейки, центы) целым числом. Float для
-- денег не используется нигде: 0.1 + 0.2 в двоичной дроби не равно 0.3, и на
-- сверке это вылезет расхождением на копейку без объяснимой причины.

create schema if not exists finance;

-- ─────────────────────────────────────────────────────────────────────────────
-- Справочники
-- ─────────────────────────────────────────────────────────────────────────────

-- Валюты перечислением, а не свободным текстом: «RUB», «руб», «₽» в одной
-- колонке — это тихая порча отчётов.
do $$ begin
  create type finance.currency as enum ('RUB', 'USD');
exception when duplicate_object then null; end $$;

create table if not exists finance.accounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  currency         finance.currency not null,
  -- Граница начала учёта: операции раньше неё вводить нельзя, они уже сидят в
  -- начальном остатке. PRD §6: повторный ввод удваивает деньги.
  opening_at       timestamptz not null,
  opening_minor    bigint not null default 0,
  is_active        boolean not null default true,
  archived_at      timestamptz,
  note             text,
  created_at       timestamptz not null default now(),
  created_by       uuid references public.users(id),
  -- Нужна для составного внешнего ключа из движений: движение не может быть в
  -- валюте, отличной от валюты своего счёта. Проверка на уровне БД, не кода.
  unique (id, currency)
);

create table if not exists finance.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  parent_id     uuid references finance.categories(id),
  -- Какие типы операций допускает категория: «Комиссии» не должна попадаться
  -- при вводе поступления.
  allowed_kinds text[] not null default '{}',
  sort          int not null default 100,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Контрагент — кому платим и от кого получаем. Ссылка на существующие сущности
-- CRM, а не их копия: дублировать людей нельзя (PRD §9).
create table if not exists finance.counterparties (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kind         text not null default 'person' check (kind in ('person', 'company')),
  crm_user_id  uuid references public.users(id),
  crm_curator_id uuid references public.curators(id),
  is_founder   boolean not null default false,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- Псевдонимы: «Оля», «Ольге», «Ольга Петрова» — один человек. Бот выбирает
-- только из этого списка и не заводит людей молча (PRD §7.1).
create table if not exists finance.counterparty_aliases (
  id              uuid primary key default gen_random_uuid(),
  counterparty_id uuid not null references finance.counterparties(id) on delete cascade,
  alias           text not null,
  created_at      timestamptz not null default now(),
  unique (alias)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Операции и движения денег
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type finance.tx_kind as enum (
    'income',                 -- поступление извне
    'expense',                -- расход вовне
    'transfer',               -- между своими счетами
    'fee',                    -- комиссия банка
    'refund_in',              -- вернули нам
    'refund_out',             -- вернули мы
    'founder_contribution',   -- основатель внёс свои
    'founder_withdrawal',     -- основатель забрал себе
    'founder_expense',        -- основатель оплатил за компанию своими (движения денег компании нет)
    'founder_reimbursement',  -- компания возместила основателю
    'adjustment'              -- корректировка остатка по сверке, с причиной
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type finance.tx_status as enum ('active', 'reversed', 'superseded');
exception when duplicate_object then null; end $$;

create table if not exists finance.transactions (
  id                  uuid primary key default gen_random_uuid(),
  kind                finance.tx_kind not null,
  -- Когда деньги двинулись, а не когда запись внесли. Отчёты и сверки считают
  -- по occurred_at: задним числом внесённый факт обязан попасть в свой день.
  occurred_at         timestamptz not null,
  created_at          timestamptz not null default now(),
  actor_user_id       uuid references public.users(id),
  category_id         uuid references finance.categories(id),
  counterparty_id     uuid references finance.counterparties(id),
  client_id           bigint references public.clients(id),
  deal_id             uuid references public.deals(id),
  note                text,
  -- Откуда пришла операция: telegram | crm | import
  origin              text not null default 'crm' check (origin in ('crm', 'telegram', 'import')),
  source_event_id     uuid,
  -- Исправление не переписывает сумму, а создаёт новую редакцию. Вся цепочка
  -- редакций держится одним correction_group_id (PRD §8.3).
  version             int not null default 1,
  correction_group_id uuid not null default gen_random_uuid(),
  status              finance.tx_status not null default 'active',
  reverses_id         uuid references finance.transactions(id),
  -- Мост с существующим учётом CRM: одна клиентская оплата или один расход из
  -- карточки клиента не может дать два денежных факта (PRD §14.2).
  crm_payment_id      bigint unique references public.payments(id),
  crm_expense_id      uuid   unique references public.expenses(id),
  -- Справочный курс на дату операции, снимок. Меняется только явным действием.
  rate_rub_per_usd    numeric(18, 6),
  created_by          uuid references public.users(id)
);

create index if not exists tx_occurred_idx     on finance.transactions (occurred_at desc);
create index if not exists tx_kind_idx         on finance.transactions (kind, occurred_at desc);
create index if not exists tx_client_idx       on finance.transactions (client_id) where client_id is not null;
create index if not exists tx_counterparty_idx on finance.transactions (counterparty_id) where counterparty_id is not null;
create index if not exists tx_group_idx        on finance.transactions (correction_group_id);
create index if not exists tx_status_idx       on finance.transactions (status) where status = 'active';

-- Движение денег по конкретному счёту. Знак: вход плюс, выход минус.
-- Перевод — это одна операция с двумя движениями; отмена — обратные движения.
create table if not exists finance.movements (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references finance.transactions(id) on delete cascade,
  account_id     uuid not null,
  currency       finance.currency not null,
  amount_minor   bigint not null check (amount_minor <> 0),
  reversal_of_id uuid references finance.movements(id),
  created_at     timestamptz not null default now(),
  -- Валюта движения обязана совпадать с валютой счёта. Без этого «списать 6000
  -- рублей с долларовой карты» тихо пройдёт и испортит остаток (PRD §7.2).
  foreign key (account_id, currency) references finance.accounts(id, currency)
);

create index if not exists mv_account_idx on finance.movements (account_id);
create index if not exists mv_tx_idx      on finance.movements (transaction_id);

-- Операция до границы начала учёта — это двойной счёт: она уже в начальном
-- остатке. Ловим на уровне БД, потому что цена ошибки — разъехавшийся баланс.
create or replace function finance.check_movement_after_opening() returns trigger as $$
declare acc finance.accounts%rowtype; occurred timestamptz;
begin
  select * into acc from finance.accounts where id = new.account_id;
  select occurred_at into occurred from finance.transactions where id = new.transaction_id;
  if occurred < acc.opening_at then
    raise exception 'операция % раньше начала учёта счёта % (%): такие деньги уже в начальном остатке',
      occurred, acc.name, acc.opening_at;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists movement_after_opening on finance.movements;
create trigger movement_after_opening before insert on finance.movements
  for each row execute function finance.check_movement_after_opening();

-- Перевод в одной валюте обязан сходиться в ноль: иначе деньги исчезли или
-- появились. Проверка отложенная — движения вставляются по одному.
create or replace function finance.check_transfer_balanced() returns trigger as $$
declare k finance.tx_kind; n int; cur_count int; total bigint;
begin
  select kind into k from finance.transactions where id = new.transaction_id;
  if k <> 'transfer' then return new; end if;

  select count(*), count(distinct currency), coalesce(sum(amount_minor), 0)
    into n, cur_count, total
    from finance.movements where transaction_id = new.transaction_id;

  if n < 2 then
    raise exception 'перевод % должен иметь два движения, найдено %', new.transaction_id, n;
  end if;
  if cur_count = 1 and total <> 0 then
    raise exception 'перевод % в одной валюте не сходится: остаток %', new.transaction_id, total;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists transfer_balanced on finance.movements;
create constraint trigger transfer_balanced
  after insert on finance.movements
  deferrable initially deferred
  for each row execute function finance.check_transfer_balanced();

-- Остатки считаются из журнала движений, а не хранятся отдельным числом:
-- хранимый остаток рано или поздно разойдётся с журналом, и никто не заметит.
create or replace view finance.account_balances as
select a.id            as account_id,
       a.name,
       a.currency,
       a.opening_at,
       a.opening_minor,
       a.opening_minor + coalesce(sum(m.amount_minor), 0) as balance_minor,
       count(m.id)     as movements
  from finance.accounts a
  left join finance.movements m on m.account_id = a.id
  left join finance.transactions t on t.id = m.transaction_id and t.status <> 'superseded'
 group by a.id, a.name, a.currency, a.opening_at, a.opening_minor;

-- ─────────────────────────────────────────────────────────────────────────────
-- Планы, погашения, долги основателям
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists finance.obligations (
  id              uuid primary key default gen_random_uuid(),
  direction       text not null check (direction in ('out', 'in')),
  counterparty_id uuid references finance.counterparties(id),
  client_id       bigint references public.clients(id),
  category_id     uuid references finance.categories(id),
  amount_minor    bigint not null check (amount_minor > 0),
  currency        finance.currency not null,
  due_on          date,
  purpose         text,
  status          text not null default 'planned'
                  check (status in ('planned', 'partially_paid', 'paid', 'cancelled')),
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id)
);

create index if not exists ob_status_idx on finance.obligations (status, due_on);

-- Частичная оплата плана: сколько именно этого факта отнесено к обязательству.
create table if not exists finance.settlements (
  id              uuid primary key default gen_random_uuid(),
  obligation_id   uuid not null references finance.obligations(id) on delete cascade,
  transaction_id  uuid not null references finance.transactions(id) on delete cascade,
  allocated_minor bigint not null check (allocated_minor > 0),
  created_at      timestamptz not null default now(),
  unique (obligation_id, transaction_id)
);

-- Оплата основателем из личных: расход компании есть, денег компании не убыло.
create table if not exists finance.founder_claims (
  id                uuid primary key default gen_random_uuid(),
  founder_user_id   uuid not null references public.users(id),
  transaction_id    uuid not null references finance.transactions(id) on delete cascade,
  amount_minor      bigint not null check (amount_minor > 0),
  currency          finance.currency not null,
  settled_minor     bigint not null default 0,
  created_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Курс, сверка, аудит
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists finance.exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  rate_date      date not null,
  rub_per_usd    numeric(18, 6) not null check (rub_per_usd > 0),
  source         text not null default 'manual' check (source in ('manual', 'actual_transfer')),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.users(id),
  unique (rate_date, source)
);

create table if not exists finance.reconciliations (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references finance.accounts(id),
  as_of         timestamptz not null,
  computed_minor bigint not null,
  entered_minor  bigint not null,
  diff_minor     bigint not null,
  status        text not null default 'open'
                check (status in ('matched', 'open', 'needs_recheck', 'resolved')),
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id)
);

create index if not exists rec_account_idx on finance.reconciliations (account_id, as_of desc);

create table if not exists finance.audit_events (
  id         bigserial primary key,
  actor_id   uuid references public.users(id),
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  reason     text,
  at         timestamptz not null default now()
);

create index if not exists audit_entity_idx on finance.audit_events (entity, entity_id);
create index if not exists audit_at_idx     on finance.audit_events (at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Телеграм: события, черновики, привязки, правила
-- ─────────────────────────────────────────────────────────────────────────────

-- Событие сохраняется до любой обработки: если упали после ответа Telegram,
-- сообщение не должно пропасть (PRD §14.3).
create table if not exists finance.source_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'telegram',
  update_id     bigint,
  chat_id       bigint,
  message_id    bigint,
  revision      int not null default 0,
  from_tg_id    bigint,
  actor_user_id uuid references public.users(id),
  kind          text not null default 'text' check (kind in ('text', 'voice', 'callback', 'other')),
  raw           jsonb not null,
  text          text,
  transcript    text,
  state         text not null default 'received'
                check (state in ('received', 'processing', 'awaiting_input', 'ready', 'posted', 'failed_retryable', 'failed_final', 'ignored')),
  error         text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz,
  -- Один и тот же update от Telegram не должен обработаться дважды: ретраи
  -- вебхука — норма, повторная запись денег — нет.
  unique (provider, update_id)
);

create index if not exists se_state_idx on finance.source_events (state, created_at);

create table if not exists finance.drafts (
  id              uuid primary key default gen_random_uuid(),
  source_event_id uuid references finance.source_events(id) on delete cascade,
  author_user_id  uuid references public.users(id),
  batch_index     int not null default 0,
  state           text not null default 'awaiting_input'
                  check (state in ('awaiting_input', 'ready', 'posted', 'cancelled', 'stale')),
  version         int not null default 1,
  extracted       jsonb not null default '{}'::jsonb,
  unresolved      text[] not null default '{}',
  question        text,
  transaction_id  uuid references finance.transactions(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists draft_state_idx on finance.drafts (state, created_at);

-- Право на деньги отдельно от роли CRM (PRD §5).
create table if not exists finance.access (
  user_id    uuid primary key references public.users(id) on delete cascade,
  level      text not null default 'owner' check (level in ('owner', 'operator', 'viewer')),
  granted_at timestamptz not null default now(),
  granted_by uuid references public.users(id),
  revoked_at timestamptz
);

-- Связь telegram-аккаунта с пользователем CRM. Связываем по числовому id, а не
-- по username: username меняется, id — нет.
create table if not exists finance.telegram_bindings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  telegram_id    bigint not null unique,
  telegram_name  text,
  status         text not null default 'active' check (status in ('active', 'revoked')),
  bound_at       timestamptz not null default now(),
  revoked_at     timestamptz
);

-- Разрешённые чаты: закрытая группа основателей и личные диалоги.
create table if not exists finance.telegram_chats (
  chat_id    bigint primary key,
  title      text,
  kind       text not null check (kind in ('group', 'private')),
  is_allowed boolean not null default false,
  added_at   timestamptz not null default now()
);

-- Одноразовая ссылка для привязки: живёт минуты, гасится при использовании.
create table if not exists finance.link_tokens (
  token_hash text primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Правила по умолчанию: «рублёвый расход без счёта → Т-Банк».
create table if not exists finance.rules (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  conditions jsonb not null default '{}'::jsonb,
  defaults   jsonb not null default '{}'::jsonb,
  priority   int not null default 100,
  is_active  boolean not null default true,
  version    int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

-- Ключ идемпотентности: повтор с тем же ключом и телом отдаёт прежний ответ,
-- тот же ключ с другим телом — конфликт (PRD §12.3).
create table if not exists finance.idempotency_keys (
  key          text primary key,
  request_hash text not null,
  response     jsonb,
  created_at   timestamptz not null default now()
);

-- Отправка подтверждений отдельно от проведения: запись в CRM удалась, а
-- Telegram мог не ответить — повторяем доставку, а не операцию (PRD §17.17).
create table if not exists finance.outbox (
  id           bigserial primary key,
  kind         text not null,
  payload      jsonb not null,
  state        text not null default 'pending' check (state in ('pending', 'sent', 'failed')),
  attempts     int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

create index if not exists outbox_pending_idx on finance.outbox (state, next_attempt_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Стартовые категории (PRD §9). Суммы и ставки в код не зашиваются.
-- ─────────────────────────────────────────────────────────────────────────────

insert into finance.categories (name, allowed_kinds, sort) values
  ('Оплаты клиентов',              array['income', 'refund_out'],        10),
  ('Профориентация',               array['expense', 'refund_in'],        20),
  ('Кураторы и сопровождение',     array['expense', 'refund_in'],        30),
  ('Зарплаты',                     array['expense'],                     40),
  ('Реклама',                      array['expense', 'refund_in'],        50),
  ('Сервисы и подписки',           array['expense', 'refund_in'],        60),
  ('Переводы документов',          array['expense'],                     70),
  ('Комиссии',                     array['fee'],                         80),
  ('Офис и связь',                 array['expense'],                     90),
  ('Налоги и обязательные платежи', array['expense'],                   100),
  ('Прочие расходы',               array['expense'],                    110),
  ('Не распределено',              array['income', 'expense', 'fee'],   999)
on conflict (name) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Доступ: модуль серверный, ходит под service_role — как схема seo.
-- Права человека проверяются в коде по finance.access.
-- ─────────────────────────────────────────────────────────────────────────────

grant usage on schema finance to service_role;
grant all privileges on all tables    in schema finance to service_role;
grant all privileges on all sequences in schema finance to service_role;
grant execute      on all functions   in schema finance to service_role;
alter default privileges in schema finance grant all on tables to service_role;
alter default privileges in schema finance grant all on sequences to service_role;
alter default privileges in schema finance grant execute on functions to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Проведение операций: одной транзакцией базы
--
-- Почему это функция в базе, а не код приложения. Операция и её движения по
-- счетам обязаны записаться вместе или не записаться вовсе: половина операции —
-- это разъехавшийся остаток, который потом никто не объяснит. Клиент Supabase
-- транзакций не умеет — каждый запрос отдельный. Поэтому вся запись денег живёт
-- здесь, а приложение только готовит данные (PRD §12.2).
--
-- Ключ идемпотентности проверяется тут же: повтор с тем же ключом и тем же телом
-- возвращает прежний ответ, тот же ключ с другим телом — ошибка конфликта. Так
-- ретрай вебхука Telegram не может записать деньги дважды (PRD §14.2).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function finance.balance_minor(p_account uuid, p_as_of timestamptz default null)
returns bigint language sql stable as $$
  select a.opening_minor + coalesce((
    select sum(m.amount_minor)
      from finance.movements m
      join finance.transactions t on t.id = m.transaction_id
     where m.account_id = a.id
       and t.status <> 'superseded'
       and (p_as_of is null or t.occurred_at <= p_as_of)
  ), 0)
  from finance.accounts a where a.id = p_account;
$$;

create or replace function finance.post_transaction(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_key       text := p->>'idempotency_key';
  v_hash      text;
  v_prev      finance.idempotency_keys%rowtype;
  v_kind      finance.tx_kind := (p->>'kind')::finance.tx_kind;
  v_tx        uuid;
  v_group     uuid;
  v_mv        jsonb;
  v_count     int;
  v_positive  int;
  v_negative  int;
  v_accounts  uuid[] := '{}';
  v_unique    uuid[];
  v_balances  jsonb := '[]'::jsonb;
  v_acc       uuid;
begin
  if v_key is null or length(v_key) < 8 then
    raise exception 'нужен ключ идемпотентности длиной хотя бы 8 символов';
  end if;

  -- Хэш считается по телу без самого ключа: тот же ключ с другим телом — это
  -- не повтор, а ошибка вызывающего, и молча отдавать прежний ответ нельзя.
  v_hash := md5((p - 'idempotency_key')::text);

  select * into v_prev from finance.idempotency_keys where key = v_key;
  if found then
    if v_prev.request_hash = v_hash then
      return v_prev.response;
    end if;
    raise exception 'ключ % уже использован с другим содержимым', v_key
      using errcode = '23505';
  end if;

  -- Проверки знаков. Смысл операции задаёт направление денег, и «расход на
  -- плюс» — это не мелкая опечатка, а перевёрнутый остаток.
  select count(*),
         count(*) filter (where (value->>'amount_minor')::bigint > 0),
         count(*) filter (where (value->>'amount_minor')::bigint < 0)
    into v_count, v_positive, v_negative
    from jsonb_array_elements(coalesce(p->'movements', '[]'::jsonb));

  if v_kind = 'founder_expense' then
    if v_count <> 0 then
      raise exception 'оплата основателем из личных не двигает счета компании: движений быть не должно';
    end if;
  elsif v_kind = 'transfer' then
    if v_count <> 2 or v_positive <> 1 or v_negative <> 1 then
      raise exception 'перевод — это ровно два движения: одно списание и одно зачисление';
    end if;
  elsif v_count < 1 then
    raise exception 'операция без движения денег: нечего проводить';
  elsif v_kind in ('income', 'refund_in', 'founder_contribution') and v_negative > 0 then
    raise exception 'поступление не может быть отрицательным';
  elsif v_kind in ('expense', 'fee', 'refund_out', 'founder_withdrawal', 'founder_reimbursement') and v_positive > 0 then
    raise exception 'выплата не может быть положительной';
  end if;

  v_group := coalesce((p->>'correction_group_id')::uuid, gen_random_uuid());

  insert into finance.transactions (
    kind, occurred_at, actor_user_id, category_id, counterparty_id, client_id, deal_id,
    note, origin, source_event_id, correction_group_id, version,
    crm_payment_id, crm_expense_id, rate_rub_per_usd, created_by
  ) values (
    v_kind,
    (p->>'occurred_at')::timestamptz,
    (p->>'actor_user_id')::uuid,
    (p->>'category_id')::uuid,
    (p->>'counterparty_id')::uuid,
    (p->>'client_id')::bigint,
    (p->>'deal_id')::uuid,
    p->>'note',
    coalesce(p->>'origin', 'crm'),
    (p->>'source_event_id')::uuid,
    v_group,
    coalesce((p->>'version')::int, 1),
    (p->>'crm_payment_id')::bigint,
    (p->>'crm_expense_id')::uuid,
    (p->>'rate_rub_per_usd')::numeric,
    (p->>'created_by')::uuid
  ) returning id into v_tx;

  for v_mv in select * from jsonb_array_elements(coalesce(p->'movements', '[]'::jsonb)) loop
    insert into finance.movements (transaction_id, account_id, currency, amount_minor)
    values (
      v_tx,
      (v_mv->>'account_id')::uuid,
      (v_mv->>'currency')::finance.currency,
      (v_mv->>'amount_minor')::bigint
    );
    v_accounts := v_accounts || (v_mv->>'account_id')::uuid;
  end loop;

  -- Долг компании основателю за оплату из личных денег.
  if v_kind = 'founder_expense' then
    insert into finance.founder_claims (founder_user_id, transaction_id, amount_minor, currency)
    values (
      (p->>'founder_user_id')::uuid,
      v_tx,
      (p->>'claim_amount_minor')::bigint,
      (p->>'claim_currency')::finance.currency
    );
  end if;

  -- Погашение планового платежа, полное или частичное.
  if p->>'obligation_id' is not null then
    insert into finance.settlements (obligation_id, transaction_id, allocated_minor)
    values ((p->>'obligation_id')::uuid, v_tx, (p->>'allocated_minor')::bigint);

    update finance.obligations o set status = case
      when (select coalesce(sum(s.allocated_minor), 0) from finance.settlements s where s.obligation_id = o.id) >= o.amount_minor
        then 'paid' else 'partially_paid' end
     where o.id = (p->>'obligation_id')::uuid;
  end if;

  insert into finance.audit_events (actor_id, action, entity, entity_id, after, reason)
  values ((p->>'actor_user_id')::uuid, 'post', 'transaction', v_tx::text, p - 'idempotency_key', p->>'reason');

  -- Остатки после записи: их спрашивают сразу, и считать их отдельным запросом
  -- значит показать число из другого момента времени.
  select array_agg(distinct x) into v_unique from unnest(v_accounts) x;
  foreach v_acc in array coalesce(v_unique, '{}'::uuid[]) loop
    v_balances := v_balances || jsonb_build_object(
      'account_id', v_acc,
      'balance_minor', finance.balance_minor(v_acc)
    );
  end loop;

  insert into finance.idempotency_keys (key, request_hash, response)
  values (v_key, v_hash, jsonb_build_object('transaction_id', v_tx, 'balances', v_balances));

  return jsonb_build_object('transaction_id', v_tx, 'balances', v_balances);
end $$;

-- Отмена: не удаление и не правка суммы, а обратные движения. Исходный факт и
-- его отмена вместе дают ноль, и оба видны в истории (PRD §4, §8.3).
create or replace function finance.reverse_transaction(
  p_transaction uuid, p_actor uuid, p_reason text default null, p_idempotency_key text default null
) returns jsonb language plpgsql as $$
declare
  v_src finance.transactions%rowtype;
  v_new uuid;
  v_mv  finance.movements%rowtype;
  v_key text := coalesce(p_idempotency_key, 'reverse:' || p_transaction::text);
  v_prev finance.idempotency_keys%rowtype;
begin
  select * into v_prev from finance.idempotency_keys where key = v_key;
  if found then return v_prev.response; end if;

  select * into v_src from finance.transactions where id = p_transaction;
  if not found then raise exception 'операция % не найдена', p_transaction; end if;
  if v_src.status = 'reversed' then raise exception 'операция % уже отменена', p_transaction; end if;

  insert into finance.transactions (
    kind, occurred_at, actor_user_id, category_id, counterparty_id, client_id, deal_id,
    note, origin, correction_group_id, version, status, reverses_id, rate_rub_per_usd, created_by
  ) values (
    v_src.kind, now(), p_actor, v_src.category_id, v_src.counterparty_id, v_src.client_id, v_src.deal_id,
    coalesce(p_reason, 'отмена операции'), v_src.origin, v_src.correction_group_id, v_src.version + 1,
    'active', v_src.id, v_src.rate_rub_per_usd, p_actor
  ) returning id into v_new;

  for v_mv in select * from finance.movements where transaction_id = p_transaction loop
    insert into finance.movements (transaction_id, account_id, currency, amount_minor, reversal_of_id)
    values (v_new, v_mv.account_id, v_mv.currency, -v_mv.amount_minor, v_mv.id);
  end loop;

  update finance.transactions set status = 'reversed' where id = p_transaction;

  -- Отмена факта возвращает плану непогашенный остаток.
  update finance.obligations o set status = case
      when (select coalesce(sum(s.allocated_minor), 0)
              from finance.settlements s
              join finance.transactions t on t.id = s.transaction_id and t.status = 'active'
             where s.obligation_id = o.id) = 0 then 'planned'
      when (select coalesce(sum(s.allocated_minor), 0)
              from finance.settlements s
              join finance.transactions t on t.id = s.transaction_id and t.status = 'active'
             where s.obligation_id = o.id) >= o.amount_minor then 'paid'
      else 'partially_paid' end
   where o.id in (select obligation_id from finance.settlements where transaction_id = p_transaction);

  insert into finance.audit_events (actor_id, action, entity, entity_id, before, reason)
  values (p_actor, 'reverse', 'transaction', p_transaction::text, to_jsonb(v_src), p_reason);

  insert into finance.idempotency_keys (key, request_hash, response)
  values (v_key, md5(p_transaction::text), jsonb_build_object('reversal_id', v_new));

  return jsonb_build_object('reversal_id', v_new);
end $$;

-- Исправление: отмена прежней редакции и новая, обе в одной цепочке и в одной
-- транзакции. «Было 6000, стало 6500» даёт итоговое дополнительное списание 500
-- и две видимые редакции, а не переписанную сумму (PRD §17.12).
create or replace function finance.correct_transaction(p_transaction uuid, p jsonb)
returns jsonb language plpgsql as $$
declare
  v_src finance.transactions%rowtype;
  v_res jsonb;
begin
  select * into v_src from finance.transactions where id = p_transaction;
  if not found then raise exception 'операция % не найдена', p_transaction; end if;

  perform finance.reverse_transaction(
    p_transaction, (p->>'actor_user_id')::uuid,
    coalesce(p->>'reason', 'исправление'),
    'correct-reverse:' || p_transaction::text || ':' || coalesce(p->>'idempotency_key', '')
  );

  v_res := finance.post_transaction(
    p
    || jsonb_build_object('correction_group_id', v_src.correction_group_id)
    || jsonb_build_object('version', v_src.version + 2)
  );

  insert into finance.audit_events (actor_id, action, entity, entity_id, before, after, reason)
  values ((p->>'actor_user_id')::uuid, 'correct', 'transaction', p_transaction::text,
          to_jsonb(v_src), p - 'idempotency_key', p->>'reason');

  return v_res;
end $$;

grant execute on all functions in schema finance to service_role;
