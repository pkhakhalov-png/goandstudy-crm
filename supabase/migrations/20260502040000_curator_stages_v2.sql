-- Обновляем перечень стадий куратора. 12 этапов в новом порядке.
-- Старые стадии и их чек-листы удаляются.

DELETE FROM public.curator_stage_checklist;
DELETE FROM public.curator_stages;

INSERT INTO public.curator_stages (code, title, position) VALUES
  ('profo',         'Проф.Ориентация',                1),
  ('strategy',      'Стратегическая сессия',          2),
  ('roadmap',       'Дорожная карта',                 3),
  ('uni_search',    'Подбор университетов',           4),
  ('presentation',  'Презентация и выбор вузов',      5),
  ('documents',     'Документы',                      6),
  ('applications',  'Подача заявок',                  7),
  ('offer',         'Оффер',                          8),
  ('enrollment',    'Зачисление',                     9),
  ('housing',       'Проживание',                    10),
  ('visa',          'Виза',                          11),
  ('trip_prep',     'Подготовка к поездке',          12);

-- Сбрасываем current_stage_code у клиентов на новый первый этап.
UPDATE public.clients SET current_stage_code = 'profo' WHERE current_stage_code IS NOT NULL;
