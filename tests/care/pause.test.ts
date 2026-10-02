/**
 * «Я ответил сам» — пауза автонапоминаний по делу.
 *
 * ОТКУДА ЭТО. Правило напоминаний читало событие `answered_manually`, а
 * записать его было нечем: ни кнопки, ни инструмента, ни скрипта. То есть
 * пауза, описанная в плане, не могла сработать ни разу — куратор пишет клиенту
 * руками, и через час система присылает то же самое от своего имени. Два
 * сообщения об одном от разных отправителей читаются как давление, а не как
 * забота, и именно по таким мелочам человек решает, что им занимается конвейер.
 *
 * ЧТО ПРОВЕРЯЕМ ОТДЕЛЬНО. Что пауза кончается сама и что её можно снять
 * раньше. Вечная пауза хуже отсутствующей: дело, по которому куратор однажды
 * ответил сам, замолчало бы навсегда — и никто бы не заметил, потому что
 * молчание выглядит как отсутствие поводов.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import {
  отметитьОтвет,
  снятьПаузу,
  состояниеПаузы,
  делаНаПаузе,
  разобратьСобытия,
  ОТМЕТКА,
  СНЯТИЕ,
} from '@/lib/care/pause'

const КЛИЕНТ = -990_787
let дело: string
let участник: string

beforeEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
  участник = у!.id as string

  const { data, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      intake_term: 'тест-пауза',
      owner_member_id: участник,
      is_synthetic: true,
      synthetic_name: 'ТЕСТ паузы',
      automation_owner: 'v2',
      status: 'active',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  дело = data!.id as string
})

afterEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
})

const час = (назад: number) => new Date(Date.now() - назад * 3_600_000).toISOString()

describe('разбор событий паузы', () => {
  it('без событий паузы нет', () => {
    expect(разобратьСобытия([], 48).наПаузе).toBe(false)
  })

  it('свежая отметка ставит паузу и называет срок', () => {
    const с = разобратьСобытия([{ action: ОТМЕТКА, created_at: час(1) }], 48)
    expect(с.наПаузе).toBe(true)
    // Без «до когда» куратор гадает, вернутся ли напоминания вообще.
    expect(с.до).toBeTruthy()
  })

  it('отметка старше срока паузу не держит', () => {
    // Через двое суток молчание перестаёт быть вежливостью: если клиент так и
    // не ответил, напомнить надо.
    expect(разобратьСобытия([{ action: ОТМЕТКА, created_at: час(50) }], 48).наПаузе).toBe(false)
  })

  it('снятие после отметки отменяет паузу', () => {
    const с = разобратьСобытия(
      [
        { action: ОТМЕТКА, created_at: час(3) },
        { action: СНЯТИЕ, created_at: час(1) },
      ],
      48
    )
    expect(с.наПаузе).toBe(false)
  })

  it('новая отметка после снятия снова ставит паузу', () => {
    // Куратор ответил, вернул напоминания, потом написал ещё раз — порядок
    // важнее количества.
    const с = разобратьСобытия(
      [
        { action: ОТМЕТКА, created_at: час(5) },
        { action: СНЯТИЕ, created_at: час(3) },
        { action: ОТМЕТКА, created_at: час(1) },
      ],
      48
    )
    expect(с.наПаузе).toBe(true)
  })

  it('чужие события не считаются', () => {
    expect(разобратьСобытия([{ action: 'task_created', created_at: час(1) }], 48).наПаузе).toBe(false)
  })
})

describe('отметка и снятие в базе', () => {
  it('отметка ставит паузу по делу', async () => {
    const итог = await отметитьОтвет(дело, участник)
    expect(итог.ok).toBe(true)

    const с = await состояниеПаузы(дело)
    expect(с.наПаузе).toBe(true)
  })

  it('снятие возвращает напоминания', async () => {
    await отметитьОтвет(дело, участник)
    const итог = await снятьПаузу(дело, участник)
    expect(итог.ok).toBe(true)

    expect((await состояниеПаузы(дело)).наПаузе).toBe(false)
  })

  it('снимать нечего — так и сказано', async () => {
    const итог = await снятьПаузу(дело, участник)
    expect(итог.ok).toBe(false)
  })

  it('пауза видна в списке дел одним запросом', async () => {
    // Правило напоминаний спрашивает состояние сразу по всем делам: запрос на
    // дело в цикле по сотне клиентов — это сотня запросов на каждый прогон.
    await отметитьОтвет(дело, участник)

    const карта = await делаНаПаузе([дело])

    expect(карта.has(дело)).toBe(true)
    expect(карта.get(дело)!.до).toBeTruthy()
  })

  it('дело без отметки в списке паузы не числится', async () => {
    expect((await делаНаПаузе([дело])).has(дело)).toBe(false)
  })
})

describe('правило напоминаний уважает паузу', () => {
  it('по делу на паузе напоминание не готовится', async () => {
    // Собственно то, ради чего всё: куратор написал клиенту сам, и система
    // молчит, а не присылает следом то же самое.
    const { data: к } = await базаCare()
      .from('contacts')
      .insert({ case_id: дело, kind: 'student', name: 'Тестов', tg_chat_id: -500_001, can_decide: true })
      .select('id')
      .single()
    expect(к).toBeTruthy()

    await базаCare().from('tasks').insert({
      case_id: дело,
      title: 'ТЕСТ паузы: диплом',
      waiting_on: 'client',
      status: 'waiting',
      due_on: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      assignee_member_id: участник,
    })

    await отметитьОтвет(дело, участник)

    const { подготовитьНапоминания } = await import('@/lib/care/jobs/reminders')
    const итог = await подготовитьНапоминания()

    const { data: предложения } = await базаCare()
      .from('proposals')
      .select('id')
      .eq('case_id', дело)
      .eq('kind', 'reminder')

    expect(предложения).toHaveLength(0)
    expect(итог.причины.join(' ')).toContain('отвечал сам')
  }, 120_000)
})
