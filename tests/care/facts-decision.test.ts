/**
 * Решения по расхождениям: клиент сказал не то, что записано в карточке.
 *
 * ОТКУДА ЭТО. Разбор переписки находил расхождение, заводил конфликт и
 * предложение — и на этом всё кончалось: показать их было некому, четыре
 * расхождения лежали в базе невидимыми. Механизм, которого никто не видит, —
 * это потраченные деньги и ложное чувство, что всё учтено.
 *
 * ЧТО ИМЕННО ЗАЩИЩАЕМ. Здесь переписывается то, что куратор однажды уже
 * подтвердил, и каждая ошибка тихая:
 *
 *   — прежнее значение не удаляется, а уходит в историю. «Почему у нас было
 *     двенадцать тысяч» — обычный вопрос через месяц;
 *   — отклонение без причины не проходит. Отклонённое больше не предлагается,
 *     и «почему мы это отбросили» не должно упираться в пустоту;
 *   — «уточнить» не принимает ни одно из значений и убирает вопрос из
 *     очереди в задачу. Очередь, где лежит неотвечаемое, перестаёт читаться;
 *   — решённое второй раз не решается: две вкладки, два нажатия;
 *   — состояние, которого нет в ограничении таблицы, не выдаётся за успех.
 *     Первая версия писала `done` и `skipped`, база их отвергала, а экран
 *     отвечал «Принято» — куратор видел бы решение, которого не произошло.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import {
  принятьРасхождение,
  отклонитьРасхождение,
  уточнитьРасхождение,
} from '@/lib/care/facts-decision'
import { очередьРасхождений } from '@/lib/care/cases'
import type { Участник } from '@/lib/care/access'

const КЛИЕНТ = -990_778
const ПОЛЕ = 'budget.tuition.max'

let участник: Участник
let дело: string
let предложение: string
let подтверждённый: string
let черновик: string

beforeEach(async () => {
  // Чистим перед запуском, а не только после: прогон, убитый по таймауту,
  // оставляет дело в базе, и следующий краснеет на вставке.
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)

  const { data: у } = await базаCare()
    .from('members')
    .select('id, user_id, care_role, team_lead_id, active')
    .eq('care_role', 'lead')
    .single()
  участник = у as unknown as Участник

  const { data: д, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      intake_term: 'fall',
      owner_member_id: участник.id,
      is_synthetic: true,
      synthetic_name: 'ТЕСТ расхождений',
      automation_owner: 'v2',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  дело = д!.id as string

  const { data: стар } = await базаCare()
    .from('facts')
    .insert({
      case_id: дело,
      field: ПОЛЕ,
      value: 12000,
      currency: 'EUR',
      status: 'confirmed',
      is_plan: false,
      confirmed_by: участник.id,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  подтверждённый = стар!.id as string

  const { data: нов } = await базаCare()
    .from('facts')
    .insert({
      case_id: дело,
      field: ПОЛЕ,
      value: 9000,
      currency: 'EUR',
      status: 'draft',
      is_plan: false,
      speaker: 'parent',
      quote: 'Девять тысяч, больше не вытянем.',
    })
    .select('id')
    .single()
  черновик = нов!.id as string

  await базаCare().from('fact_conflicts').insert({
    case_id: дело,
    field: ПОЛЕ,
    fact_a: подтверждённый,
    fact_b: черновик,
  })

  const { data: п } = await базаCare()
    .from('proposals')
    .insert({
      case_id: дело,
      kind: 'fact_update',
      payload: { field: ПОЛЕ, было: 12000, стало: 9000, цитата: 'Девять тысяч, больше не вытянем.' },
      payload_hash: 'тест',
      data_version: подтверждённый,
      status: 'pending',
    })
    .select('id')
    .single()
  предложение = п!.id as string
})

afterEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
})

async function фактом(id: string) {
  const { data } = await базаCare().from('facts').select('status').eq('id', id).single()
  return data!.status as string
}

async function предложением() {
  const { data } = await базаCare()
    .from('proposals')
    .select('status, reason')
    .eq('id', предложение)
    .single()
  return data!
}

describe('очередь расхождений', () => {
  it('показывает прежнее, новое, точные слова и кто их сказал', async () => {
    const очередь = await очередьРасхождений(участник)
    const наше = очередь.find((р) => р.proposalId === предложение)

    expect(наше).toBeTruthy()
    // Без любого из четырёх решение принимается вслепую: что меняется, на что,
    // на основании чего и чьё это слово.
    expect(наше!.было).toContain('12000')
    expect(наше!.стало).toContain('9000')
    expect(наше!.цитата).toContain('Девять тысяч')
    expect(наше!.ктоСказал).toBe('parent')
    expect(наше!.подписьПоля).not.toBe(ПОЛЕ)
  })

  it('решённое из очереди уходит', async () => {
    await принятьРасхождение(участник, предложение)
    const очередь = await очередьРасхождений(участник)
    expect(очередь.find((р) => р.proposalId === предложение)).toBeUndefined()
  })
})

describe('принять новое', () => {
  it('новое становится действующим, прежнее уходит в историю, а не стирается', async () => {
    const итог = await принятьРасхождение(участник, предложение)
    expect(итог.ok).toBe(true)

    expect(await фактом(черновик)).toBe('confirmed')
    // Именно superseded, а не удаление: через месяц спросят, почему было
    // двенадцать тысяч, и ответ должен найтись.
    expect(await фактом(подтверждённый)).toBe('superseded')
    expect((await предложением()).status).toBe('accepted')
  })

  it('конфликт закрывается — иначе он останется висеть открытым навсегда', async () => {
    await принятьРасхождение(участник, предложение)

    const { data } = await базаCare()
      .from('fact_conflicts')
      .select('resolved_at')
      .eq('case_id', дело)
    expect((data ?? []).every((к) => к.resolved_at !== null)).toBe(true)
  })

  it('второе нажатие ничего не меняет', async () => {
    // Две вкладки, два нажатия: второе не должно снимать подтверждение с того,
    // что только что приняли.
    await принятьРасхождение(участник, предложение)
    const второй = await принятьРасхождение(участник, предложение)

    expect(второй.ok).toBe(false)
    expect(await фактом(черновик)).toBe('confirmed')
  })
})

describe('отклонить', () => {
  it('без причины не отклоняет и ничего не трогает', async () => {
    const итог = await отклонитьРасхождение(участник, предложение, '   ')

    expect(итог.ok).toBe(false)
    expect(await фактом(черновик)).toBe('draft')
    expect((await предложением()).status).toBe('pending')
  })

  it('с причиной: новое отклонено, прежнее действует, причина сохранена', async () => {
    const итог = await отклонитьРасхождение(участник, предложение, 'мама оговорилась, бюджет прежний')
    expect(итог.ok).toBe(true)

    expect(await фактом(черновик)).toBe('rejected')
    expect(await фактом(подтверждённый)).toBe('confirmed')
    expect((await предложением()).reason).toContain('оговорилась')
  })
})

describe('уточнить у клиента', () => {
  it('заводит задачу «ждём клиента» и убирает вопрос из очереди', async () => {
    const итог = await уточнитьРасхождение(участник, предложение)
    expect(итог.ok).toBe(true)

    const { data: задачи } = await базаCare()
      .from('tasks')
      .select('title, waiting_on, status, details')
      .eq('case_id', дело)

    expect(задачи).toHaveLength(1)
    expect(задачи![0].waiting_on).toBe('client')
    expect(задачи![0].details).toContain('Девять тысяч')
    // Из очереди убрано: вопрос, на который сегодня нельзя ответить, не должен
    // показываться куратору каждый день.
    expect((await предложением()).status).toBe('clarifying')
  })

  it('не принимает ни одно из значений', async () => {
    await уточнитьРасхождение(участник, предложение)

    // Клиент это сказал — стирать его слова мы не вправе; но и действующим
    // новое не становится, пока он не подтвердил.
    expect(await фактом(черновик)).toBe('draft')
    expect(await фактом(подтверждённый)).toBe('confirmed')
  })
})

describe('несостоявшееся решение не выдаётся за успех', () => {
  it('когда предложение исчезло, ответ — отказ, а не «готово»', async () => {
    // Так выглядит гонка двух вкладок и так же выглядела бы любая будущая
    // ошибка записи. Экран обязан сказать правду: он показывает человеку,
    // что решение принято, и по этому показу человек идёт дальше.
    await базаCare().from('proposals').delete().eq('id', предложение)

    const итог = await принятьРасхождение(участник, предложение)
    expect(итог.ok).toBe(false)
  })

  it('состояния, которые мы пишем, разрешены таблицей', async () => {
    // Проверка смотрит в базу, а не в код: ограничение живёт там, и разошлись
    // они однажды молча — запись отвергалась, а действие отвечало «Принято».
    for (const состояние of ['accepted', 'rejected', 'clarifying']) {
      const { error } = await базаCare()
        .from('proposals')
        .update({ status: состояние })
        .eq('id', предложение)
        .select('id')
      expect(error, `состояние «${состояние}» не разрешено таблицей`).toBeNull()
    }
  })
})
