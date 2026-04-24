-- Export: curator_templates + curator_resources from dev Supabase
-- Source: https://ekdnujgjoepjxhrdetjt.supabase.co
-- Generated: 2026-04-22T09:20:12.510Z

-- ═══ curator_templates ═══
-- Удаляем старые шаблоны и вставляем актуальные
DELETE FROM public.curator_templates;

INSERT INTO public.curator_templates (code, title, body, category, usage_hint, is_active) VALUES (
  'designer_brief',
  'ТЗ для дизайнера',
  '1. Название университета:
2. Название программы:
3. Даты и сроки:
   — Начало обучения:
   — Дедлайн подачи:
   — Длительность (лет):
4. Язык обучения:
5. Стоимость в год (€/$):
6. Проживание (от и до в месяц):
7. Варианты жилья:
   — Студенческая резиденция вуза: да / нет
   — Другие резиденции: да / нет
   — Аренда квартиры: да / нет
8. Требования к поступлению:
   — аттестат / диплом
   — языковой сертификат (какой / балл)
   — мотивационное письмо
   — рекомендательное письмо
9. Гранты и стипендии:
   — Государственные: [сумма / нет]
   — От университета: [сумма / нет]',
  'designer',
  'Отправляй Алёне @upgradename в Telegram',
  TRUE
);

INSERT INTO public.curator_templates (code, title, body, category, usage_hint, is_active) VALUES (
  'session_summary',
  'Итог стратегической сессии',
  '[Имя клиента], хочу подвести итог нашей стратегической сессии.

На основе обсуждённых данных я разработаю стратегию и дорожную карту поступления, подберу учебные заведения и программы, подготовлю презентацию.

Дедлайн отправки презентации: [дата].

Пожалуйста, подтвердите актуальность данных.',
  'messages',
  'Отправить в день сессии в общий чат',
  TRUE
);

INSERT INTO public.curator_templates (code, title, body, category, usage_hint, is_active) VALUES (
  'portals_ready',
  'Личные кабинеты созданы',
  '[Имя клиента], все личные кабинеты созданы, документы загружены.

Ожидаем ответ от вузов ориентировочно 3–4 недели, то есть примерно до [дата].',
  'messages',
  'После загрузки документов во все вузы',
  TRUE
);

INSERT INTO public.curator_templates (code, title, body, category, usage_hint, is_active) VALUES (
  'presentation_review',
  'Итог разбора презентации',
  '[Имя клиента], хочу подвести итог нашего созвона.

Мы определили приоритетные направления:
— Приоритет 1: [Вуз / программа]
— Приоритет 2: [Вуз / программа]
— Приоритет 3: [Вуз / программа]

Следующий шаг — [описание шага].

Пожалуйста, подтвердите, что всё верно.',
  'messages',
  'После созвона по вузам',
  TRUE
);

INSERT INTO public.curator_templates (code, title, body, category, usage_hint, is_active) VALUES (
  'cover_letter_sample',
  'Сопроводительная записка — образец',
  'Смотри, есть крутой вариант в Барселоне — EU Business School.

Программа называется BA in Business Management, учиться 3 года на английском. Начало в сентябре, но если не успеваешь — есть дедлайн до 15 декабря, это реально удобно.

Стоимость €17000 в год за обучение. Жить в Барселоне — €800–1200 в месяц (аренда, еда, транспорт).

По документам стандартный набор: аттестат, IELTS 6.5, мотивационное письмо, резюме и рекомендательное.

Кстати, есть гранты — государственные и от университета по €2500.

Если интересно — давай разберём подробнее: шансы, виза, следующие шаги.',
  'messages',
  'EU Business School, Барселона',
  TRUE
);


-- ═══ curator_resources ═══
DELETE FROM public.curator_resources;

INSERT INTO public.curator_resources (title, description, icon_code, url, login, password, category, is_active) VALUES (
  'Таблица мониторинга',
  'Google Sheets — трекинг клиентов',
  'GS',
  NULL,
  NULL,
  NULL,
  'main',
  TRUE
);

INSERT INTO public.curator_resources (title, description, icon_code, url, login, password, category, is_active) VALUES (
  'Google Calendar',
  'Расписание сессий и дедлайнов',
  'Cal',
  'https://calendar.google.com',
  NULL,
  NULL,
  'main',
  TRUE
);

INSERT INTO public.curator_resources (title, description, icon_code, url, login, password, category, is_active) VALUES (
  'Zoom',
  'Видеозвонки с клиентами',
  'Zm',
  'https://zoom.us',
  NULL,
  NULL,
  'session',
  TRUE
);

INSERT INTO public.curator_resources (title, description, icon_code, url, login, password, category, is_active) VALUES (
  'ApplyBoard SoP',
  'Генератор Statement of Purpose',
  'AB',
  NULL,
  NULL,
  NULL,
  'docs',
  TRUE
);

INSERT INTO public.curator_resources (title, description, icon_code, url, login, password, category, is_active) VALUES (
  'Resume.io',
  'Конструктор CV',
  'CV',
  'https://resume.io',
  NULL,
  NULL,
  'docs',
  TRUE
);

INSERT INTO public.curator_resources (title, description, icon_code, url, login, password, category, is_active) VALUES (
  'Курсы подготовки к тестам',
  'IELTS, Goethe, DELE и др.',
  'EN',
  NULL,
  NULL,
  NULL,
  'main',
  TRUE
);

INSERT INTO public.curator_resources (title, description, icon_code, url, login, password, category, is_active) VALUES (
  'Дизайнер Алёна',
  'Презентации для клиентов',
  'TG',
  NULL,
  NULL,
  NULL,
  'designer',
  TRUE
);

