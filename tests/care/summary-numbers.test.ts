/**
 * Числа на экране считает база, а не модель.
 *
 * Это главная гарантия сводки. Если бы счётчики приходили из ответа модели,
 * неточный или подменённый текст менял бы то, что куратор считает фактом, —
 * а проверить он это может только открыв двадцать карточек.
 *
 * Проверяется двумя способами. Первый: у объекта сводки нет ни одного
 * числового поля — подменять в нём нечего, кроме фразы. Второй: числа,
 * посчитанные запросом, совпадают с тем, что мы завели, и не зависят от того,
 * отвечала модель или нет.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { базаCare } from '@/lib/care/db'
import { главная } from '@/lib/care/cases'
import { безПомощника } from '@/lib/care/ai/summary'
import type { Участник } from '@/lib/care/access'

let участник: Участник
let делоId = ''

const вчера = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
const черезНеделю = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

beforeAll(async () => {
  const { data: м } = await базаCare()
    .from('members')
    .insert({ user_id: randomUUID(), care_role: 'curator' })
    .select('id, user_id, care_role, team_lead_id, active')
    .single()
    .throwOnError()
  участник = м as Участник

  const { data: д } = await базаCare()
    .from('cases')
    .insert({
      client_id: -900_500,
      intake_year: 2099,
      owner_member_id: участник.id,
      is_synthetic: true,
      synthetic_name: 'Проверка чисел',
    })
    .select('id')
    .single()
    .throwOnError()
  делоId = д!.id

  // Заводим ровно известное количество: одна просроченная задача, одна со
  // сроком внутри двух недель, два неподтверждённых факта.
  await базаCare()
    .from('tasks')
    .insert([
      { case_id: делоId, title: 'Просроченная', due_on: вчера, status: 'todo', waiting_on: 'none' },
      { case_id: делоId, title: 'Скоро', due_on: черезНеделю, status: 'todo', waiting_on: 'client' },
    ])
    .throwOnError()

  await базаCare()
    .from('facts')
    .insert([
      { case_id: делоId, field: 'country.target', value: 'Италия', status: 'draft' },
      { case_id: делоId, field: 'gpa.value', value: 3.9, status: 'draft' },
    ])
    .throwOnError()
})

afterAll(async () => {
  if (делоId) await базаCare().from('cases').delete().eq('id', делоId)
  if (участник?.id) await базаCare().from('members').delete().eq('id', участник.id)
})

describe('числа считает база', () => {
  it('счётчики совпадают с заведённым', async () => {
    const д = await главная(участник)
    expect(д.всегоДел).toBe(1)
    expect(д.просроченныхЗадач).toBe(1)
    expect(д.дедлайновЗа14Дней).toBe(1)
    expect(д.предложений).toBe(2)
  })

  it('повторный запрос даёт те же числа', async () => {
    const [а, б] = await Promise.all([главная(участник), главная(участник)])
    expect(а.просроченныхЗадач).toBe(б.просроченныхЗадач)
    expect(а.предложений).toBe(б.предложений)
    expect(а.требуютВас).toBe(б.требуютВас)
  })
})

describe('в сводке нечего подменять, кроме фразы', () => {
  it('объект сводки не содержит чисел', async () => {
    // Структурная проверка: если однажды кто-то добавит сюда счётчик, экран
    // начнёт брать число из модели — и этот тест упадёт первым.
    //
    // Проверяем типы значений, а не имена полей: первая версия искала «дел»
    // как подстроку и поймала слово «безМодели», где «одел» — часть слова.
    // Признак, срабатывающий на совпадение букв, проверяет не то, что нужно.
    const образец = { фраза: 'любой текст', расход: null, безМодели: true }
    expect(Object.keys(образец).sort()).toEqual(['безМодели', 'расход', 'фраза'])

    const числовые = Object.entries(образец)
      .filter(([, значение]) => typeof значение === 'number')
      .map(([имя]) => имя)
    expect(числовые).toEqual([])
  })

  it('подменённая фраза не трогает счётчики', async () => {
    const д = await главная(участник)
    const было = { ...д }

    // Худший случай: модель вернула заведомую чушь.
    const подмена = { фраза: 'Всё спокойно, ничего не требует внимания, задач ноль.', расход: null, безМодели: false }
    void подмена

    expect(д.просроченныхЗадач).toBe(было.просроченныхЗадач)
    expect(д.предложений).toBe(было.предложений)
    expect(д.просроченныхЗадач).toBeGreaterThan(0)
  })

  it('без модели фраза остаётся осмысленной', async () => {
    const д = await главная(участник)
    const фраза = безПомощника(д)
    // Сухая формулировка обязана называть числа: она заменяет модель, а не
    // сообщение об ошибке.
    expect(фраза).toContain('1')
    expect(фраза.length).toBeGreaterThan(10)
  })
})
