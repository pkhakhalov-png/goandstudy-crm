/**
 * Факты: что гарантирует база, а не код.
 *
 * Операция подтверждения факта делает два шага — снимает прежний текущий и
 * ставит новый. Правильность этого порядка держится не на внимательности
 * автора, а на уникальном индексе: подтверждённый факт по одному полю дела
 * может быть только один. Если однажды кто-то поменяет шаги местами, упадёт
 * здесь, а не на живом деле через месяц.
 *
 * Отдельно проверяется, что деньги без валюты в базу не попадают. «Бюджет
 * 30 тысяч» — не факт: неизвестно, в чём и за какой срок.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { базаCare } from '@/lib/care/db'
import { разобратьЗначение } from '@/lib/care/facts'

let участникId = ''
let делоId = ''

beforeAll(async () => {
  const { data: участник } = await базаCare()
    .from('members')
    .insert({ user_id: randomUUID(), care_role: 'curator' })
    .select('id')
    .single()
    .throwOnError()
  участникId = участник!.id

  const { data: дело } = await базаCare()
    .from('cases')
    .insert({ client_id: -900_100, intake_year: 2099, owner_member_id: участникId })
    .select('id')
    .single()
    .throwOnError()
  делоId = дело!.id
})

afterAll(async () => {
  if (делоId) await базаCare().from('cases').delete().eq('id', делоId)
  if (участникId) await базаCare().from('members').delete().eq('id', участникId)
})

async function завестиФакт(поле: string, значение: unknown, статус: string, валюта?: string) {
  return базаCare()
    .from('facts')
    .insert({ case_id: делоId, field: поле, value: значение, status: статус, currency: валюта ?? null })
    .select('id')
    .single()
}

describe('текущий факт по полю — один', () => {
  it('второй подтверждённый по тому же полю не проходит', async () => {
    const первый = await завестиФакт('language.ielts.overall', 6.5, 'confirmed')
    expect(первый.error).toBeNull()

    const второй = await завестиФакт('language.ielts.overall', 7.0, 'confirmed')
    expect(второй.error).not.toBeNull()
    expect(второй.error?.code).toBe('23505')
  })

  it('черновиков по тому же полю может быть сколько угодно', async () => {
    const а = await завестиФакт('intake.term', 'fall', 'draft')
    const б = await завестиФакт('intake.term', 'spring', 'draft')
    expect(а.error).toBeNull()
    expect(б.error).toBeNull()
  })

  it('заменённый освобождает место новому', async () => {
    const старый = await завестиФакт('country.target', 'UK', 'confirmed')
    expect(старый.error).toBeNull()

    // Порядок, который выполняет операция подтверждения: сначала снять
    // прежний, потом поставить новый.
    await базаCare().from('facts').update({ status: 'superseded' }).eq('id', старый.data!.id).throwOnError()

    const новый = await завестиФакт('country.target', 'Canada', 'confirmed')
    expect(новый.error).toBeNull()
  })
})

describe('деньги без валюты не факт', () => {
  it('бюджет без валюты не принимается', async () => {
    const { error } = await завестиФакт('budget.tuition.max', 30000, 'draft')
    expect(error).not.toBeNull()
    // 23514 — нарушение check-ограничения.
    expect(error?.code).toBe('23514')
  })

  it('бюджет с валютой принимается', async () => {
    const { error } = await завестиФакт('budget.tuition.max', 30000, 'draft', 'GBP')
    expect(error).toBeNull()
  })

  it('не денежное поле валюты не требует', async () => {
    const { error } = await завестиФакт('gpa.value', 3.8, 'draft')
    expect(error).toBeNull()
  })
})

describe('куратор вписывает своё значение', () => {
  // Разбор того, что человек напечатал руками. Ошибка здесь тихая: неверно
  // понятое «6 000» ляжет в базу числом и потом попадёт в подбор программ.

  it('сумма с пробелами и знаком валюты — это та же сумма', () => {
    for (const введено of ['6000', '6 000', '6 000 €', '6000 EUR']) {
      const итог = разобратьЗначение('budget.tuition.max', введено, 'EUR')
      expect(итог.ok).toBe(true)
      if (итог.ok) expect(итог.значение).toBe(6000)
    }
  })

  it('запятая считается десятичной', () => {
    const итог = разобратьЗначение('budget.living.max', '1,5', 'EUR')
    expect(итог.ok).toBe(true)
    if (итог.ok) expect(итог.значение).toBe(1.5)
  })

  it('сумма без валюты не проходит', () => {
    // То же, что ловит ограничение базы, но отвечает человеку понятной фразой.
    const итог = разобратьЗначение('budget.tuition.max', '6000', '')
    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.почему).toContain('валюта')
  })

  it('буквы вместо суммы не проходят', () => {
    const итог = разобратьЗначение('budget.tuition.max', 'около шести тысяч', 'EUR')
    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.почему).toContain('не число')
  })

  it('отрицательная сумма не проходит', () => {
    const итог = разобратьЗначение('budget.tuition.max', '-100', 'EUR')
    expect(итог.ok).toBe(false)
  })

  it('текстовое поле остаётся текстом как есть', () => {
    const введено = '11 классов школы + 2 года российского вуза (академ) — биология'
    const итог = разобратьЗначение('education.current', введено, null)
    expect(итог.ok).toBe(true)
    // Ни чистки, ни попытки вытащить оттуда числа: это предложение, а не сумма.
    if (итог.ok) expect(итог.значение).toBe(введено)
  })

  it('пустое значение не проходит', () => {
    const итог = разобратьЗначение('education.current', '   ', null)
    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.почему).toContain('Пустое')
  })

  it('валюта приводится к верхнему регистру, но не угадывается по символу', () => {
    const сВалютой = разобратьЗначение('budget.tuition.max', '6000', 'eur')
    expect(сВалютой.ok).toBe(true)
    if (сВалютой.ok) expect(сВалютой.валюта).toBe('EUR')

    // «6000 €» без поля валюты — отказ, а не догадка: символ мог попасть
    // случайно, а от валюты зависит смысл суммы целиком.
    const поСимволу = разобратьЗначение('budget.tuition.max', '6000 €', '')
    expect(поСимволу.ok).toBe(false)
  })

  it('год набора — число, но валюта ему не нужна', () => {
    const итог = разобратьЗначение('intake.year', '2027', null)
    expect(итог.ok).toBe(true)
    if (итог.ok) {
      expect(итог.значение).toBe(2027)
      expect(итог.валюта).toBeNull()
    }
  })
})
