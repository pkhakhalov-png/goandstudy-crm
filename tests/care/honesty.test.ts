/**
 * T20: пустое «что проверить» не должно врать клиенту.
 *
 * ЧТО ВИДИТ КЛИЕНТ. На странице подборки под каждой программой есть строка
 * «Уточняем: …». Когда её нет, человек читает это как «здесь всё проверено» —
 * и подаёт документы, считает деньги, отказывается от других вариантов.
 *
 * КОГДА ЭТО НЕПРАВДА. Строка попадает в подборку с пустым списком, если модель
 * при поиске не назвала, что осталось выяснить. Проверка требований при этом не
 * запускалась, подтверждённых записей по программе нет — а карточка выглядит
 * чистой. Такая ошибка не ломается, она врёт, и заметить её нельзя ниоткуда.
 *
 * ЧЕГО ПРОВЕРКА НЕ ДЕЛАЕТ. Не трогает строки, у которых проверка правда была:
 * иначе пометка появилась бы у всех и перестала что-либо значить.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { обеспечитьЧестность, ПОМЕТКА } from '@/lib/care/honesty'

const КЛИЕНТ = -990_781
const ССЫЛКА_ПРОВЕРЕННОЙ = 'https://example.org/проверенная-программа'

let дело: string
let подборка: string

async function строкой(вуз: string, ссылка: string | null, unresolved: string[], status = 'active') {
  const { data, error } = await базаCare()
    .from('shortlist_items')
    .insert({
      shortlist_id: подборка,
      program_ref: { вуз, программа: 'тест', ссылка },
      unresolved,
      status,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data!.id as string
}

async function пометки(id: string): Promise<string[]> {
  const { data } = await базаCare().from('shortlist_items').select('unresolved').eq('id', id).single()
  return (data!.unresolved ?? []) as string[]
}

beforeEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  await базаCare().from('program_requirements').delete().contains('program_ref', { ссылка: ССЫЛКА_ПРОВЕРЕННОЙ })

  const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
  const { data: д, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      owner_member_id: у!.id,
      is_synthetic: true,
      synthetic_name: 'ТЕСТ честности',
      automation_owner: 'v2',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  дело = д!.id as string

  const { data: п } = await базаCare()
    .from('shortlists')
    .insert({ case_id: дело, version: 1, status: 'curator_review' })
    .select('id')
    .single()
  подборка = п!.id as string
})

afterEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  await базаCare().from('program_requirements').delete().contains('program_ref', { ссылка: ССЫЛКА_ПРОВЕРЕННОЙ })
})

describe('пустое «что проверить» обеспечено или помечено', () => {
  it('строка без пометок и без проверки получает пометку', async () => {
    const id = await строкой('Вуз без проверки', 'https://example.org/непроверенная', [])

    const итог = await обеспечитьЧестность(подборка)

    expect(итог.исправлено).toBe(1)
    expect(await пометки(id)).toEqual([ПОМЕТКА])
  })

  it('строка с настоящей проверкой пометку не получает', async () => {
    // Иначе пометка появилась бы у всех и перестала что-либо значить.
    await базаCare().from('program_requirements').insert({
      program_ref: { ссылка: ССЫЛКА_ПРОВЕРЕННОЙ, вуз: 'Проверенный вуз' },
      requirement_type: 'deadline',
      value: { текст: '15 января' },
      source_url: ССЫЛКА_ПРОВЕРЕННОЙ,
      excerpt: 'Application deadline: 15 January',
      checked_at: new Date().toISOString(),
      status: 'confirmed',
    })
    const id = await строкой('Проверенный вуз', ССЫЛКА_ПРОВЕРЕННОЙ, [])

    const итог = await обеспечитьЧестность(подборка)

    expect(итог.исправлено).toBe(0)
    expect(await пометки(id)).toEqual([])
  })

  it('не найденное на странице — это тоже не подтверждение', async () => {
    // `not_found` означает «искали и не нашли». Утверждать по нему, что всё
    // выяснено, нельзя: как раз и не выяснено.
    await базаCare().from('program_requirements').insert({
      program_ref: { ссылка: ССЫЛКА_ПРОВЕРЕННОЙ, вуз: 'Вуз с пустой проверкой' },
      requirement_type: 'deadline',
      value: {},
      source_url: ССЫЛКА_ПРОВЕРЕННОЙ,
      checked_at: new Date().toISOString(),
      status: 'not_found',
    })
    const id = await строкой('Вуз с пустой проверкой', ССЫЛКА_ПРОВЕРЕННОЙ, [])

    const итог = await обеспечитьЧестность(подборка)

    expect(итог.исправлено).toBe(1)
    expect(await пометки(id)).toEqual([ПОМЕТКА])
  })

  it('строка без ссылки помечается всегда', async () => {
    // Страницу программы мы не открывали по определению — проверять было нечего.
    const id = await строкой('Вуз без ссылки', null, [])

    await обеспечитьЧестность(подборка)

    expect(await пометки(id)).toEqual([ПОМЕТКА])
  })

  it('уже помеченное не переписывается', async () => {
    const id = await строкой('Вуз со своими пометками', 'https://example.org/иная', [
      'стоимость не подтверждена',
    ])

    const итог = await обеспечитьЧестность(подборка)

    expect(итог.исправлено).toBe(0)
    expect(await пометки(id)).toEqual(['стоимость не подтверждена'])
  })

  it('убранные строки не трогаются — клиент их не видит', async () => {
    const id = await строкой('Убранный вуз', null, [], 'removed')

    const итог = await обеспечитьЧестность(подборка)

    expect(итог.исправлено).toBe(0)
    expect(await пометки(id)).toEqual([])
  })

  it('названия исправленных перечисляются поимённо', async () => {
    // Куратору нужно знать, у каких именно: по ним он решает, запускать ли
    // проверку требований или публиковать как есть.
    await строкой('Первый вуз', null, [])
    await строкой('Второй вуз', null, [])

    const итог = await обеспечитьЧестность(подборка)

    expect(итог.исправлено).toBe(2)
    expect(итог.названия.join(' ')).toContain('Первый вуз')
    expect(итог.названия.join(' ')).toContain('Второй вуз')
  })
})
