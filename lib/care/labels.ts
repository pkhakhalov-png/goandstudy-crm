/**
 * Человеческие подписи.
 *
 * `budget.tuition.max` — это имя поля в базе, а не то, что читает куратор.
 * Показывать его на экране значит требовать от человека знания схемы: он
 * ведёт клиентов, а не отлаживает таблицы.
 *
 * Раздел 2 дизайн-документа: «Куратор — не оператор нейросети». Здесь это
 * правило превращается в словарь.
 */

const ПОЛЯ: Record<string, string> = {
  'budget.tuition.max': 'Бюджет на обучение',
  'budget.living.max': 'Бюджет на проживание',
  'budget.fees.max': 'Бюджет на сборы и визу',
  'intake.year': 'Год поступления',
  'intake.term': 'Семестр',
  'country.target': 'Страна',
  'language.ielts.overall': 'IELTS, общий балл',
  'language.toefl.overall': 'TOEFL, общий балл',
  'language.german.level': 'Немецкий, уровень',
  'language.english.level': 'Английский, уровень',
  'gpa.value': 'Средний балл',
  'education.degree': 'Текущее образование',
}

/** Подпись поля. Неизвестное поле показываем как есть — это честнее выдумки. */
export function подписьПоля(поле: string): string {
  return ПОЛЯ[поле] ?? поле
}

/** Единица измерения после значения: период для денег, ничего для остального. */
export function периодПоля(поле: string): string {
  return поле.startsWith('budget.living') ? '/ мес' : поле.startsWith('budget.') ? '/ год' : ''
}

const СТАТУСЫ_ЗАДАЧ: Record<string, string> = {
  todo: 'не начата',
  in_progress: 'в работе',
  waiting: 'ждём',
  review: 'на проверке',
  done: 'сделана',
  paused: 'на паузе',
  failed: 'не вышло',
}

export function подписьСтатуса(статус: string): string {
  return СТАТУСЫ_ЗАДАЧ[статус] ?? статус
}

const ОЖИДАНИЕ: Record<string, string> = {
  none: '',
  client: 'ждём клиента',
  university: 'ждём ответ вуза',
  specialist: 'ждём специалиста',
  review: 'ждём вашего решения',
}

export function подписьОжидания(кого: string): string {
  return ОЖИДАНИЕ[кого] ?? кого
}

/**
 * Срок словами.
 *
 * Всегда относительно сегодня: колонка существует, чтобы не считать в уме,
 * какая из двух дат ближе. Точная дата идёт второй строкой, мелким.
 */
export type Срочность = 'нет' | 'просрочен' | 'сегодня' | 'горит' | 'скоро' | 'спокойно'

export function срок(дата: string | null): { текст: string; дата: string | null; уровень: Срочность; дней: number | null } {
  if (!дата) return { текст: 'срока нет', дата: null, уровень: 'нет', дней: null }
  const дней = Math.ceil((new Date(дата).getTime() - Date.now()) / 86_400_000)
  const подпись = new Date(дата).toLocaleDateString('ru-RU')
  if (дней < 0) return { текст: `просрочен на ${-дней} дн.`, дата: подпись, уровень: 'просрочен', дней }
  if (дней === 0) return { текст: 'сегодня', дата: подпись, уровень: 'сегодня', дней }
  if (дней <= 7) return { текст: `через ${дней} дн.`, дата: подпись, уровень: 'горит', дней }
  if (дней <= 30) return { текст: `через ${дней} дн.`, дата: подпись, уровень: 'скоро', дней }
  return { текст: `через ${дней} дн.`, дата: подпись, уровень: 'спокойно', дней }
}

/** Инициалы для кружка. Две буквы, как в дизайн-системе. */
export function инициалы(имя: string): string {
  return имя
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((ч) => ч[0])
    .join('')
    .toUpperCase()
}

/** Русское склонение: 1 клиент, 2 клиента, 5 клиентов. */
export function склонение(n: number, один: string, два: string, много: string): string {
  const с = Math.abs(n) % 100
  const е = с % 10
  if (с > 10 && с < 20) return много
  if (е > 1 && е < 5) return два
  if (е === 1) return один
  return много
}
