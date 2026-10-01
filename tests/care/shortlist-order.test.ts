/**
 * Порядок в подборке: место назначает база, а не код.
 *
 * ОТКУДА ЭТОТ ТЕСТ. Куратор попросил «добавь ещё несколько программ», модель
 * вызвала добавление четыре раза одним ходом, все четыре прочитали одну и ту же
 * максимальную позицию — и две программы встали на седьмое место.
 *
 * Порядок здесь не украшение. Куратор ставит вперёд главное, клиент читает
 * сверху вниз, а «переставь вторую» при одинаковых позициях переставляет
 * разное от чтения к чтению. Ломается это молча.
 *
 * Проверяем настоящей параллельной вставкой: гонку нельзя подтвердить
 * рассуждением о коде, её видно только когда писателей действительно двое.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { базаCare } from '@/lib/care/db'

let подборка: string
const вставленные: string[] = []

beforeAll(async () => {
  const { data: дело } = await базаCare()
    .from('cases')
    .select('id')
    .eq('is_synthetic', true)
    .limit(1)
    .single()

  // Своя подборка, не рабочая: тест переставляет строки, и делать это в той,
  // что лежит у куратора на проверке, нельзя.
  const { data: своя } = await базаCare()
    .from('shortlists')
    .insert({ case_id: дело!.id, version: 9999, status: 'draft' })
    .select('id')
    .single()
  подборка = своя!.id as string
})

afterAll(async () => {
  await базаCare().from('shortlist_items').delete().eq('shortlist_id', подборка)
  await базаCare().from('shortlists').delete().eq('id', подборка)
})

async function добавить(имя: string) {
  const { data, error } = await базаCare()
    .from('shortlist_items')
    .insert({
      shortlist_id: подборка,
      program_ref: { вуз: имя, программа: 'тест', ссылка: 'https://example.org/p' },
    })
    .select('id, position')
    .single()
  if (error) throw new Error(error.message)
  вставленные.push(data!.id as string)
  return Number(data!.position)
}

describe('место в подборке', () => {
  it('четыре одновременные вставки получают четыре разных места', async () => {
    const места = await Promise.all([
      добавить('Вуз А'),
      добавить('Вуз Б'),
      добавить('Вуз В'),
      добавить('Вуз Г'),
    ])

    expect(new Set(места).size).toBe(4)
  })

  it('места идут подряд от нуля — в списке нет дыр', async () => {
    const { data } = await базаCare()
      .from('shortlist_items')
      .select('position')
      .eq('shortlist_id', подборка)
      .order('position')

    const места = (data ?? []).map((с) => Number(с.position))
    expect(места).toEqual(места.map((_, и) => и))
  })

  it('явно назначенное место база не переписывает — на этом держится перестановка', async () => {
    // «Выше/ниже» меняет позиции двух строк двумя запросами. Если бы триггер
    // трогал и явные значения, перестановка не работала бы вовсе.
    const { data } = await базаCare()
      .from('shortlist_items')
      .insert({
        shortlist_id: подборка,
        position: 42,
        program_ref: { вуз: 'Вуз Д', программа: 'тест', ссылка: 'https://example.org/p' },
      })
      .select('id, position')
      .single()
    вставленные.push(data!.id as string)
    expect(Number(data!.position)).toBe(42)
  })
})
