/**
 * Журнал отправок: что ушло, что не ушло и что осталось неизвестным.
 *
 * ОТКУДА ЭТО. `неизвестныеИсходы()` была написана и никем не вызывалась —
 * экрана отправок не существовало вовсе. Контур построен на обещании «без
 * человека наружу ничего не уходит», а проверить это обещание в кабинете было
 * нечем: на вопрос «мы точно отправили?» ответа не было ни у куратора, ни у
 * руководителя.
 *
 * ГЛАВНОЕ, ЧТО ЗАЩИЩАЕМ. Отметка исхода — это запись о том, что человек увидел
 * в чате, и только. Ни одного обращения к Телеграму отсюда не идёт: иначе
 * «проверил» однажды стало бы «отправил второй раз». И уже известный исход
 * отметкой не переписывается — вторая вкладка не должна превращать
 * отправленное в неотправленное.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { базаCare } from '@/lib/care/db'
import { отправки, отметитьИсход } from '@/lib/care/outbox'

const КЛИЕНТ = -990_789
let дело: string
let участник: string

/**
 * Своё предложение на каждую отправку: `outbound_actions` уникальна по
 * предложению — одно предложение, одна отправка. На этом стоит T13, и
 * обходить это в фикстуре значило бы проверять то, чего не бывает.
 */
async function своёПредложение() {
  const { data } = await базаCare()
    .from('proposals')
    .insert({
      case_id: дело,
      kind: 'reminder',
      payload: { текст: 'Напоминание о дипломе' },
      payload_hash: `тест-${Math.abs(КЛИЕНТ)}-${счётчик++}`,
      data_version: 'тест',
      status: 'accepted',
    })
    .select('id')
    .single()
  return data!.id as string
}

let счётчик = 0

async function отправка(статус: string, текст = 'Напоминание о дипломе') {
  const { data, error } = await базаCare()
    .from('outbound_actions')
    .insert({
      proposal_id: await своёПредложение(),
      channel: 'telegram',
      recipient: { tg_chat_id: -500_777, name: 'Иван Тестов' },
      payload: { текст },
      payload_hash: 'тест',
      status: статус,
      attempts: 1,
      last_error: статус === 'unknown' ? 'ответ не получен: таймаут' : null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data!.id as string
}

beforeEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
  участник = у!.id as string

  const { data: д, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      intake_term: 'тест-отправки',
      owner_member_id: участник,
      is_synthetic: true,
      synthetic_name: 'ТЕСТ журнала',
      automation_owner: 'v2',
      status: 'active',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  дело = д!.id as string

  счётчик = 0
})

afterEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
})

describe('журнал отправок', () => {
  it('неизвестный исход показывается отдельно от остальных', async () => {
    // Это не история, а работа: пока человек не посмотрел в чат, мы не знаем,
    // получил клиент сообщение или нет.
    await отправка('unknown')
    await отправка('sent', 'уже ушло')

    const список = await отправки([дело])

    expect(список.неизвестные).toHaveLength(1)
    expect(список.последние).toHaveLength(1)
    expect(список.последние[0].статус).toBe('sent')
  })

  it('отправки чужих дел не видны', async () => {
    await отправка('sent')

    const список = await отправки(['00000000-0000-0000-0000-000000000000'])

    expect(список.неизвестные).toHaveLength(0)
    expect(список.последние).toHaveLength(0)
  })

  it('пустая область не идёт в базу за всем подряд', async () => {
    const список = await отправки([])
    expect(список.последние).toHaveLength(0)
  })

  it('причина отмены доходит до экрана', async () => {
    // «Отменено» без причины читается как поломка, а чаще это сработавшая
    // защита: выключенный флаг, изменившиеся данные.
    //
    // Пишем в тот самый столбец, куда её кладут ворота (`cancel_reason`).
    // Первая версия этой проверки писала в `last_error` — туда же, откуда
    // читал код, — и пропустила, что экран молчит о каждой отмене. Фикстура,
    // подыгрывающая коду, проверяет код сам с собой.
    const id = await отправка('cancelled')
    await базаCare()
      .from('outbound_actions')
      .update({ cancel_reason: 'flag_off' })
      .eq('id', id)

    const список = await отправки([дело])
    expect(список.последние[0].причинаОтмены).toBe('flag_off')
  })
})

describe('отметка исхода', () => {
  it('«дошло» делает отправку отправленной', async () => {
    const id = await отправка('unknown')

    const итог = await отметитьИсход(id, true, участник)
    expect(итог.ok).toBe(true)

    const { data } = await базаCare().from('outbound_actions').select('status, sent_at').eq('id', id).single()
    expect(data!.status).toBe('sent')
    expect(data!.sent_at).toBeTruthy()
  })

  it('«не дошло» открывает дорогу новому напоминанию', async () => {
    const id = await отправка('unknown')

    await отметитьИсход(id, false, участник)

    const { data } = await базаCare().from('outbound_actions').select('status, last_error').eq('id', id).single()
    expect(data!.status).toBe('failed')
    expect(String(data!.last_error)).toContain('проверено человеком')
  })

  it('уже известный исход отметкой не переписывается', async () => {
    // Вторая вкладка не должна превращать отправленное в неотправленное.
    const id = await отправка('sent')

    const итог = await отметитьИсход(id, false, участник)

    expect(итог.ok).toBe(false)
    const { data } = await базаCare().from('outbound_actions').select('status').eq('id', id).single()
    expect(data!.status).toBe('sent')
  })

  it('отметка записана в журнал дела', async () => {
    const id = await отправка('unknown')
    await отметитьИсход(id, true, участник)

    const { data } = await базаCare()
      .from('events')
      .select('action')
      .eq('case_id', дело)
      .eq('action', 'outbound_confirmed')

    expect((data ?? []).length).toBe(1)
  })

  it('отметка не обращается к Телеграму', () => {
    // Главное свойство этого пути: «проверил» не должно однажды стать
    // «отправил второй раз». Отправляющие методы Bot API живут в одном файле,
    // и этого среди них нет.
    const текст = fs.readFileSync(path.resolve(process.cwd(), 'lib/care/outbox.ts'), 'utf8')
    expect(текст).not.toContain('api.telegram.org')
    expect(текст).not.toMatch(/\bsend(Message|Photo|Document)\b/)
  })
})
