-- Стипендии «двухступенчатые»: куратор добавляет в подборку (скрыто от клиента),
-- после оплаты доп.услуги — раскрывает все одной кнопкой → клиент видит.
-- Раскрытие per-row не нужно (по требованию пользователя — bulk toggle).

ALTER TABLE public.client_scholarships
  ADD COLUMN IF NOT EXISTS unlocked_for_client BOOLEAN NOT NULL DEFAULT false;

-- Индекс под client-side фильтрацию (когда построим /client/scholarships)
CREATE INDEX IF NOT EXISTS idx_client_scholarships_unlocked
  ON public.client_scholarships (client_id, unlocked_for_client);
