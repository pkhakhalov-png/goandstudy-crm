-- Кабинет куратора v2, миграция 004: требования, подборки, заявки, задачи.
--
-- Что делает. Пять таблиц: что требует программа (`program_requirements`),
-- что мы предложили студенту (`shortlists`, `shortlist_items`), куда он подал
-- (`applications`) и что кому делать (`tasks`).
--
-- ПОЧЕМУ ТРЕБОВАНИЯ ХРАНИМ У СЕБЯ, А НЕ БЕРЁМ ИЗ СПРАВОЧНИКА. Справочник
-- вузов отвечает на вопрос «что написано на сайте», а куратору нужен ответ на
-- «подходит ли этот студент». Между ними — дата проверки, цитата и признание
-- «не нашли». Требование без `checked_at` через год становится вымыслом, а
-- отличить непроверенное от проверенного и отсутствующего можно только если
-- хранить это раздельно.
--
-- ПОЧЕМУ У ЗАДАЧИ ЕСТЬ `waiting_on`. «В работе» — бесполезный статус: он не
-- отличает «куратор не сделал» от «ждём документ от студента» и «ждём ответ
-- вуза». А вся работа кабинета — в том, чтобы заметить, что ждут слишком
-- долго, и понять, кого толкать.
--
-- Документы тут не заводятся: до решения владельца по обработке персональных
-- документов читаем `public.client_documents` как есть (п. 0.7 плана).
--
-- Откат: supabase/migrations/care/004_shortlists_and_tasks.rollback.sql

begin;

-- ── Требования программ ─────────────────────────────────────────────────────
--
-- `status` различает три разных «нет»: не нашли (`not_found`), нашли
-- противоречие (`conflict`), нужно спросить у вуза (`needs_query`). Сводить
-- их в одно значит потерять разницу между «требования нет» и «мы не знаем».

create table care.program_requirements (
  id                  uuid primary key default gen_random_uuid(),
  program_ref         jsonb not null,
  intake              text null,
  applicant_category  text null,
  requirement_type    text not null,
  value               jsonb not null default '{}'::jsonb,
  source_url          text null,
  excerpt             text null,
  checked_at          timestamptz null,
  status              text not null default 'needs_query'
                        check (status in ('confirmed', 'not_found', 'conflict', 'needs_query')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column care.program_requirements.program_ref is
  'Ссылка на программу справочника по значению: {"program_id": …}. Внешнего ключа нет — справочник в другой базе.';
comment on column care.program_requirements.excerpt is
  'Цитата со страницы источника. Требование без цитаты проверить нельзя, а значит нельзя и доверять.';
comment on column care.program_requirements.checked_at is
  'Когда сверяли. Старее settings.requirements_ttl_days — считается устаревшим и уходит в needs_query.';

create index care_prog_req_program_idx on care.program_requirements using gin (program_ref);
create index care_prog_req_stale_idx on care.program_requirements (checked_at nulls first);

-- ── Подборки ────────────────────────────────────────────────────────────────
--
-- Версиями, а не правкой на месте. Подборка — это то, что показали человеку;
-- переписать её задним числом значит потерять, на что он отвечал.

create table care.shortlists (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references care.cases(id) on delete cascade,
  version      int not null default 1,
  status       text not null default 'draft'
                 check (status in ('draft', 'curator_review', 'published', 'client_chosen', 'rejected')),
  reviewed_by  uuid null references care.members(id) on delete set null,
  reviewed_at  timestamptz null,
  review_note  text null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (case_id, version)
);

create table care.shortlist_items (
  id              uuid primary key default gen_random_uuid(),
  shortlist_id    uuid not null references care.shortlists(id) on delete cascade,
  program_ref     jsonb not null,
  tuition_amount  numeric(12, 2) null,
  currency        text null,
  fit_notes       jsonb not null default '{}'::jsonb,
  unresolved      jsonb not null default '[]'::jsonb,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column care.shortlist_items.unresolved is
  'Требования со статусом не confirmed. Пустой список означает «всё проверено» — и это утверждение, за которое отвечаем.';
comment on column care.shortlist_items.fit_notes is
  'Объяснение, почему программа подходит. Пишется по уже посчитанной сверке, а не вместо неё.';

create index care_shortlist_items_list_idx on care.shortlist_items (shortlist_id, position);

-- ── Заявки ──────────────────────────────────────────────────────────────────

create table care.applications (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references care.cases(id) on delete cascade,
  program_ref      jsonb not null,
  external_ref     text null,
  status           text not null default 'planned'
                     check (status in ('planned', 'preparing', 'submitted', 'offer', 'rejected', 'declined', 'withdrawn')),
  submitted_at     timestamptz null,
  submitted_proof  jsonb null,
  decision_at      timestamptz null,
  note             text null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column care.applications.submitted_proof is
  'Чем подтверждается подача: номер, письмо, снимок. «Подали» без доказательства — это «кажется, подали».';

create index care_applications_case_idx on care.applications (case_id, status);

-- ── Задачи ──────────────────────────────────────────────────────────────────
--
-- `due_source_id` отвечает на вопрос «откуда взялся этот срок». Дедлайн,
-- списанный с сайта вуза полгода назад, и дедлайн, подтверждённый вчера, —
-- разные вещи, и разница видна только если хранить ссылку на источник.
--
-- `next_check_on` — для того, что не двигается само: ждём ответ вуза, и надо
-- вернуться к этому через неделю, даже если ничего не произошло.

create table care.tasks (
  id                 uuid primary key default gen_random_uuid(),
  case_id            uuid not null references care.cases(id) on delete cascade,
  application_id     uuid null references care.applications(id) on delete set null,
  title              text not null,
  details            text null,
  due_on             date null,
  due_source_id      uuid null references care.sources(id) on delete set null,
  assignee_member_id uuid null references care.members(id) on delete set null,
  waiting_on         text not null default 'none'
                       check (waiting_on in ('none', 'client', 'university', 'specialist', 'review')),
  status             text not null default 'todo'
                       check (status in ('todo', 'in_progress', 'waiting', 'review', 'done', 'paused', 'failed')),
  next_check_on      date null,
  depends_on         uuid[] not null default '{}',
  closed_at          timestamptz null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column care.tasks.waiting_on is
  'Кого ждём. «В работе» не отличает «куратор не сделал» от «ждём документ» — а вся работа кабинета в этой разнице.';
comment on column care.tasks.due_source_id is
  'Откуда взялся срок. Дедлайн без источника нельзя перепроверить, когда он начнёт поджимать.';

create index care_tasks_case_idx on care.tasks (case_id, status);
-- Открытые задачи со сроком — то, из чего собирается лента внимания.
create index care_tasks_due_idx on care.tasks (due_on)
  where status not in ('done', 'failed') and due_on is not null;
create index care_tasks_waiting_idx on care.tasks (waiting_on, updated_at)
  where status not in ('done', 'failed');
create index care_tasks_assignee_idx on care.tasks (assignee_member_id)
  where status not in ('done', 'failed');

-- ── Триггеры отметки времени ────────────────────────────────────────────────

create trigger care_program_requirements_touch before update on care.program_requirements
  for each row execute function care.touch_updated_at();
create trigger care_shortlists_touch before update on care.shortlists
  for each row execute function care.touch_updated_at();
create trigger care_shortlist_items_touch before update on care.shortlist_items
  for each row execute function care.touch_updated_at();
create trigger care_applications_touch before update on care.applications
  for each row execute function care.touch_updated_at();
create trigger care_tasks_touch before update on care.tasks
  for each row execute function care.touch_updated_at();

-- ── Доступ ──────────────────────────────────────────────────────────────────

alter table care.program_requirements enable row level security;
alter table care.shortlists enable row level security;
alter table care.shortlist_items enable row level security;
alter table care.applications enable row level security;
alter table care.tasks enable row level security;

create policy care_app_all on care.program_requirements for all to care_app using (true) with check (true);
create policy care_app_all on care.shortlists           for all to care_app using (true) with check (true);
create policy care_app_all on care.shortlist_items      for all to care_app using (true) with check (true);
create policy care_app_all on care.applications         for all to care_app using (true) with check (true);
create policy care_app_all on care.tasks                for all to care_app using (true) with check (true);

revoke all on care.program_requirements, care.shortlists, care.shortlist_items,
              care.applications, care.tasks
  from anon, authenticated;

commit;
