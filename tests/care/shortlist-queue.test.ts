/**
 * Очередь проверки подборок.
 *
 * Проверяется то, что решает, попадёт подборка к куратору или нет: область
 * видимости и статус. Ошибка здесь тихая в обе стороны — чужая подборка в
 * очереди или своя, которая туда не попала и о которой все забыли.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { базаCare } from '@/lib/care/db'
import { очередьПодборок } from '@/lib/care/cases'
import type { Участник } from '@/lib/care/access'

let свой: Участник
let чужой: Участник
let своёДело = ''
let чужоеДело = ''
const подборки: string[] = []

async function завестиУчастника(): Promise<Участник> {
  const { data } = await базаCare()
    .from('members')
    .insert({ user_id: randomUUID(), care_role: 'curator' })
    .select('id, user_id, care_role, team_lead_id, active')
    .single()
    .throwOnError()
  return data as Участник
}

async function завестиДело(владелец: string, имя: string): Promise<string> {
  const { data } = await базаCare()
    .from('cases')
    .insert({
      client_id: -901_000 - Math.floor(Math.random() * 1000),
      intake_year: 2099,
      owner_member_id: владелец,
      is_synthetic: true,
      synthetic_name: имя,
    })
    .select('id')
    .single()
    .throwOnError()
  return data!.id as string
}

async function завестиПодборку(caseId: string, статус: string, версия = 1): Promise<string> {
  const { data } = await базаCare()
    .from('shortlists')
    .insert({ case_id: caseId, version: версия, status: статус })
    .select('id')
    .single()
    .throwOnError()
  подборки.push(data!.id as string)

  await базаCare()
    .from('shortlist_items')
    .insert({
      shortlist_id: data!.id,
      program_ref: { вуз: 'Тестовый университет', программа: 'Биология', ссылка: 'https://example.edu/bio' },
      tuition_amount: 3000,
      currency: 'EUR',
      fit_notes: {
        почему: 'подходит по направлению',
        сверка: [{ вид: 'language_of_instruction', вывод: 'не подходит', объяснение: 'обучение на чешском' }],
      },
      unresolved: ['сроки подачи'],
      position: 0,
    })
    .throwOnError()

  return data!.id as string
}

beforeAll(async () => {
  свой = await завестиУчастника()
  чужой = await завестиУчастника()
  своёДело = await завестиДело(свой.id, 'Очередников')
  чужоеДело = await завестиДело(чужой.id, 'Чужой')
})

afterAll(async () => {
  for (const id of [своёДело, чужоеДело]) if (id) await базаCare().from('cases').delete().eq('id', id)
  for (const у of [свой, чужой]) if (у?.id) await базаCare().from('members').delete().eq('id', у.id)
})

describe('в очередь попадает только своё и только ждущее решения', () => {
  it('подборка на проверке своего дела видна', async () => {
    const id = await завестиПодборку(своёДело, 'curator_review')
    const очередь = await очередьПодборок(свой)
    expect(очередь.map((п) => п.id)).toContain(id)
  })

  it('чужая подборка не видна', async () => {
    // Та же проверка, что у дел и напоминаний: область считается в одном
    // месте, но ошибиться можно в каждом запросе отдельно.
    await завестиПодборку(чужоеДело, 'curator_review')
    const очередь = await очередьПодборок(свой)
    expect(очередь.every((п) => п.caseId !== чужоеДело)).toBe(true)
  })

  it('принятая и отклонённая в очереди не висят', async () => {
    await завестиПодборку(своёДело, 'published', 2)
    await завестиПодборку(своёДело, 'rejected', 3)
    const очередь = await очередьПодборок(свой)
    const свои = очередь.filter((п) => п.caseId === своёДело)
    expect(свои).toHaveLength(1)
    expect(свои[0].version).toBe(1)
  })

  it('строка приносит с собой сверку и непроверенное', async () => {
    // Без них карточка в очереди превращается в список названий, а решать
    // куратору надо именно по несходящемуся.
    const очередь = await очередьПодборок(свой)
    const строка = очередь.find((п) => п.caseId === своёДело)!.строки[0]
    expect(строка.сверка[0].вывод).toBe('не подходит')
    expect(строка.unresolved).toContain('сроки подачи')
    expect(строка.ссылка).toBe('https://example.edu/bio')
  })
})
