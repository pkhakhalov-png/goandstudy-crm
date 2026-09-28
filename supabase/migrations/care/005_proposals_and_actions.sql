-- Кабинет куратора v2, миграция 005: поручения, предложения, отправки, журнал.
--
-- Здесь живёт главное правило контура: **модель не действует, модель
-- предлагает**. Всё, что она готова сделать, ложится в `proposals` и ждёт
-- решения человека. Выполнение — отдельный шаг, отдельная запись, отдельная
-- проверка прав.
--
-- ПОЧЕМУ У ПРЕДЛОЖЕНИЯ ЕСТЬ `payload_hash`. Куратор соглашается не «с
-- напоминанием вообще», а с конкретным текстом, который он прочитал. Если
-- текст поправили после согласия, согласия на него никто не давал — нужна
-- новая запись. Без хэша это неотличимо, и «я такого не одобрял» станет
-- законным возражением.
--
-- ПОЧЕМУ У ПРЕДЛОЖЕНИЯ ЕСТЬ `data_version`. Между подготовкой напоминания и
-- нажатием «отправить» проходит время, и за это время студент мог прислать
-- документ, которого от него ждут. Отправить такое напоминание — потерять
-- доверие быстрее, чем его можно заработать. Слепок данных на момент
-- подготовки позволяет заметить, что мир изменился, и погасить предложение.
--
-- ПОЧЕМУ `unique(proposal_id)` В ОТПРАВКАХ. Одно принятое предложение — одна
-- отправка. Не ограничение в коде, а ограничение в базе: два тика подряд, два
-- нажатия кнопки, повторная доставка — любой из этих путей иначе даёт второе
-- сообщение человеку.
--
-- Откат: supabase/migrations/care/005_proposals_and_actions.rollback.sql

begin;

-- ── Поручения из общего чата ────────────────────────────────────────────────
--
-- `scope` фиксируется при запуске, а не вычисляется при исполнении. Куратор
-- сказал «напомни всем, кто тянет с документами» — и множество «всех» должно
-- остаться тем же, каким он его видел, даже если пока задание идёт, к нему
-- прибавится новый клиент.

create table care.assignments (
  id                   uuid primary key default gen_random_uuid(),
  initiator_member_id  uuid not null references care.members(id) on delete restrict,
  scope                jsonb not null default '{}'::jsonb,
  prompt               text not null,
  status               text not null default 'queued'
                         check (status in ('queued', 'running', 'done', 'partial', 'failed', 'cancelled')),
  cost_ledger          jsonb not null default '{}'::jsonb,
  cancelled_at         timestamptz null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column care.assignments.scope is
  'Список case_id, зафиксированный в момент запуска. Не пересчитывается: куратор отвечает за то множество, которое видел.';
comment on column care.assignments.cost_ledger is
  'Сколько стоило: токены и деньги по каждому вызову модели. Расход, который не видно, никто не контролирует.';

create table care.assignment_items (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references care.assignments(id) on delete cascade,
  case_id        uuid not null references care.cases(id) on delete cascade,
  status         text not null default 'pending'
                   check (status in ('pending', 'done', 'skipped', 'failed')),
  result         jsonb not null default '{}'::jsonb,
  error          text null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (assignment_id, case_id)
);

create index care_assignment_items_open_idx
  on care.assignment_items (assignment_id) where status = 'pending';

-- ── Предложения ─────────────────────────────────────────────────────────────

create table care.proposals (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references care.cases(id) on delete cascade,
  assignment_id  uuid null references care.assignments(id) on delete set null,
  kind           text not null
                   check (kind in ('reminder', 'fact_update', 'shortlist', 'task_plan', 'reply', 'other')),
  payload        jsonb not null,
  payload_hash   text not null,
  data_version   text not null,
  status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'rejected', 'rework', 'expired')),
  decided_by     uuid null references care.members(id) on delete set null,
  decided_at     timestamptz null,
  reason         text null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column care.proposals.payload_hash is
  'Хэш текста, который читал человек. Текст поправили — нужна новая запись: согласия на изменённое никто не давал.';
comment on column care.proposals.data_version is
  'Слепок данных на момент подготовки. Разошёлся с текущим — предложение гаснет, а не уходит клиенту устаревшим.';

create index care_proposals_pending_idx on care.proposals (case_id, kind) where status = 'pending';
create index care_proposals_assignment_idx
  on care.proposals (assignment_id) where assignment_id is not null;

-- ── Отправки наружу ─────────────────────────────────────────────────────────
--
-- Единственная дверь наружу. Всё, что уходит человеку, проходит здесь и
-- нигде больше — прямых вызовов Bot API в контуре нет.
--
-- `status = 'unknown'` — не выдумка, а честный ответ на неразрешимое: если
-- запрос на отправку оборвался по таймауту, узнать, дошло ли сообщение,
-- нечем. Bot API не даёт спросить «отправлял ли я вот это». Повторять нельзя
-- (получится дубль), считать отправленным нельзя (может, и нет). Поэтому
-- отдельный статус и ручная проверка человеком.

create table care.outbound_actions (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references care.proposals(id) on delete cascade,
  channel      text not null default 'telegram' check (channel in ('telegram')),
  recipient    jsonb not null,
  payload      jsonb not null,
  payload_hash text not null,
  status       text not null default 'queued'
                 check (status in ('queued', 'sent', 'unknown', 'failed', 'cancelled')),
  external_id  text null,
  attempts     int not null default 0,
  last_error   text null,
  sent_at      timestamptz null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Одно принятое предложение — ровно одна отправка. Два тика, два нажатия
  -- кнопки и повторная доставка иначе дают человеку второе сообщение.
  unique (proposal_id)
);

comment on column care.outbound_actions.recipient is
  'Получатель, взятый из contacts дела, а не из payload. Подменённый текст не должен уводить отправку на чужой адрес.';
comment on column care.outbound_actions.status is
  'unknown — отправка оборвалась и исход неизвестен. Повторять нельзя, считать отправленным нельзя: смотрит человек.';

create index care_outbound_queued_idx on care.outbound_actions (created_at) where status = 'queued';
create index care_outbound_unknown_idx on care.outbound_actions (created_at) where status = 'unknown';

-- ── Журнал ──────────────────────────────────────────────────────────────────
--
-- Кто, что, когда и на каком основании. Отдельно от прочего, потому что на
-- вопрос «почему клиенту ушло вот это» нужно уметь ответить через полгода,
-- когда ни куратора, ни памяти о разговоре уже нет.

create table care.events (
  id          uuid primary key default gen_random_uuid(),
  actor_kind  text not null check (actor_kind in ('member', 'system', 'model')),
  actor_id    uuid null,
  case_id     uuid null references care.cases(id) on delete cascade,
  action      text not null,
  before      jsonb null,
  after       jsonb null,
  source      jsonb not null default '{}'::jsonb,
  reason      text null,
  created_at  timestamptz not null default now()
);

comment on table care.events is
  'Журнал дела. Строки не правятся и не удаляются: журнал, который можно поправить, — не журнал.';

create index care_events_case_idx on care.events (case_id, created_at desc);
create index care_events_actor_idx on care.events (actor_kind, actor_id, created_at desc);

-- ── Триггеры отметки времени ────────────────────────────────────────────────
--
-- У journal-таблицы `events` триггера нет намеренно: у неё и колонки
-- updated_at нет, потому что менять записи журнала не предполагается.

create trigger care_assignments_touch before update on care.assignments
  for each row execute function care.touch_updated_at();
create trigger care_assignment_items_touch before update on care.assignment_items
  for each row execute function care.touch_updated_at();
create trigger care_proposals_touch before update on care.proposals
  for each row execute function care.touch_updated_at();
create trigger care_outbound_actions_touch before update on care.outbound_actions
  for each row execute function care.touch_updated_at();

-- ── Доступ ──────────────────────────────────────────────────────────────────

alter table care.assignments enable row level security;
alter table care.assignment_items enable row level security;
alter table care.proposals enable row level security;
alter table care.outbound_actions enable row level security;
alter table care.events enable row level security;

create policy care_app_all on care.assignments       for all to care_app using (true) with check (true);
create policy care_app_all on care.assignment_items  for all to care_app using (true) with check (true);
create policy care_app_all on care.proposals         for all to care_app using (true) with check (true);
create policy care_app_all on care.outbound_actions  for all to care_app using (true) with check (true);
create policy care_app_all on care.events            for all to care_app using (true) with check (true);

revoke all on care.assignments, care.assignment_items, care.proposals,
              care.outbound_actions, care.events
  from anon, authenticated;

commit;
