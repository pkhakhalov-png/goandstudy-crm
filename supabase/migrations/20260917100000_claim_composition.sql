-- Полный состав утверждения (E2.2) и владелец источника (E2.3).
--
-- Чего не хватает сегодня. Утверждение «стоимость обучения 2500» не говорит,
-- на какой программе, для какого уровня, для какого набора и для какой
-- категории студента. А это ровно те четыре способа, которыми верное число
-- становится ложью: цена магистратуры выданная за цену бакалавриата, цена
-- прошлого набора выданная за нынешнюю, цена для граждан ЕС выданная за цену
-- для всех.
--
-- Приёмочный тест PRD №8 требует ловить «другую программу, год или валюту».
-- Валюту ловим единицей, а программу и год ловить нечем: полей нет.
--
-- Отдельно про набор. Колонок две нарочно: `intake` — как это называет
-- редактор («осень 2026»), `intake_start` — дата, по которой считает код.
-- Одной текстовой колонкой считать срок годности нельзя, а одной датой нельзя
-- показать человеку то, что он узнаёт.

begin;

alter table seo.claims
  add column if not exists program          text,
  add column if not exists level            text,
  add column if not exists intake           text,
  add column if not exists intake_start     date,
  add column if not exists academic_year    text,
  add column if not exists student_category text;

comment on column seo.claims.program is
  'Конкретная программа, если утверждение относится к ней, а не к вузу целиком. '
  'Пусто — утверждение общее для вуза, и переносить его на программу нельзя.';
comment on column seo.claims.level is
  'bachelor | master | phd | language | foundation. Возраст «до 25» верен для бакалавриата '
  'и неверен для аспирантуры — без уровня это одно неразличимое утверждение.';
comment on column seo.claims.intake is
  'Набор словами, как его называет редактор: «осень 2026». Показывается человеку.';
comment on column seo.claims.intake_start is
  'Дата начала набора. По ней считается срок годности: утверждение про набор '
  'перестаёт действовать, когда набор начался, а не когда истёк срок политики.';
comment on column seo.claims.academic_year is
  'Академический год: 2026/27. Не то же, что набор: в один год бывает два набора.';
comment on column seo.claims.student_category is
  'Кому это верно, если верно не всем: eu | non_eu | local | international. '
  'Пусто — верно всем. Половина ложных цен на обучение живёт именно здесь.';

alter table seo.sources
  add column if not exists owner            text,
  add column if not exists content_dated_at date;

comment on column seo.sources.owner is
  'Кто публикует источник: «Университет Чулалонгкорн», «Минобрнауки КНР». Домен '
  'машине понятен, а человеку, который читает доказательство, — нет.';

comment on column seo.sources.content_dated_at is
  'Дата, которой источник датирует себя сам. Не дата, когда мы его прочитали. '
  'Разница принципиальная: подтвердить, что число есть на странице, и подтвердить, '
  'что число действует, — это два разных утверждения. Страница Чулалонгкорна несёт '
  'в таблице цен подпись «as of April 12, 2023»: числа на ней настоящие, но им три года, '
  'и срок годности обязан считаться от них, а не от дня нашей проверки.';

update seo.sources set owner = 'Университет Чулалонгкорн' where domain = 'chula.ac.th' and owner is null;

-- Дата стоит на самой странице: «1 USD = 34.26 THB (as of April 12,2023)» в таблице цен.
update seo.sources set content_dated_at = date '2023-04-12'
 where domain = 'chula.ac.th' and content_dated_at is null;

create index if not exists claims_subject on seo.claims (subject_key, kind);
create index if not exists claims_intake on seo.claims (intake_start) where intake_start is not null;

commit;

-- Проверить:
--   select id, kind, subject_key, level, program, intake from seo.claims order by id limit 5;
--   ожидается: колонки есть, значения пустые — заполнять их будет экстрактор
