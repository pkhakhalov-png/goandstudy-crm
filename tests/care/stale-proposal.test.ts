/**
 * Приёмочный T04 — новые сведения во время выполнения гасят старое решение.
 *
 * Между «помощник подготовил» и «куратор нажал» проходит время, и за это время
 * мир меняется: клиент прислал документ, срок сдвинули, задачу закрыли.
 * Предложение, подготовленное по прежнему состоянию, отправлять нельзя — не
 * потому что это технически опасно, а потому что напоминание о том, что
 * человек уже сделал, обходится дороже, чем пропущенное напоминание.
 *
 * Проверяется вся цепочка последствий, а не только флаг в базе:
 *   · слепок данных разошёлся → предложение получает `expired`;
 *   · погасшее предложение ворота не пропускают вообще;
 *   · попытка отправить его оставляет строку отказа с причиной, а не тишину;
 *   · правило не подкладывает вместо него второе такое же.
 *
 * Рубильник `external_sends` при этом остаётся выключенным: проверка свежести
 * вызывается той же функцией, которой её вызывают ворота.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { базаCare } from '@/lib/care/db'
import { свежесть, воротаОтправки, поставитьВОчередь } from '@/lib/care/gate/outbound'
import { подготовитьНапоминания } from '@/lib/care/jobs/reminders'

let участникId = ''
let делоId = ''
let задачаId = ''
let предложениеId = ''

const черезДва = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
const черезДесять = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

beforeAll(async () => {
  const { data: у } = await базаCare()
    .from('members')
    .insert({ user_id: randomUUID(), care_role: 'curator' })
    .select('id')
    .single()
    .throwOnError()
  участникId = у!.id

  const { data: д } = await базаCare()
    .from('cases')
    .insert({
      client_id: -900_702,
      intake_year: 2099,
      owner_member_id: участникId,
      is_synthetic: true,
      synthetic_name: 'Устаревашкин',
      automation_owner: 'v2',
    })
    .select('id')
    .single()
    .throwOnError()
  делоId = д!.id

  await базаCare()
    .from('contacts')
    .insert({ case_id: делоId, kind: 'student', name: 'Пётр Тестов', tg_chat_id: -100_502, can_decide: true })
    .throwOnError()

  const { data: з } = await базаCare()
    .from('tasks')
    .insert({
      case_id: делоId,
      title: 'Справка из банка',
      due_on: черезДва,
      waiting_on: 'client',
      status: 'waiting',
    })
    .select('id')
    .single()
    .throwOnError()
  задачаId = з!.id

  await подготовитьНапоминания()

  const { data: п } = await базаCare()
    .from('proposals')
    .select('id, status')
    .eq('case_id', делоId)
    .eq('kind', 'reminder')
    .limit(1)
  предложениеId = (п ?? [])[0]?.id ?? ''
})

afterAll(async () => {
  if (делоId) await базаCare().from('cases').delete().eq('id', делоId)
  if (участникId) await базаCare().from('members').delete().eq('id', участникId)
})

describe('T04 — предложение готово, но данные успели измениться', () => {
  it('предложение подготовлено и ждёт решения', async () => {
    expect(предложениеId).not.toBe('')
    const { data } = await базаCare()
      .from('proposals')
      .select('status, data_version')
      .eq('id', предложениеId)
      .maybeSingle()
    expect(data?.status).toBe('pending')
    expect(data?.data_version).toBeTruthy()
  })

  it('сдвинутый срок расходит слепок и гасит предложение', async () => {
    // Клиент попросил отсрочку, куратор сдвинул срок — тот самый случай,
    // когда старый текст назвал бы неверную дату.
    await базаCare().from('tasks').update({ due_on: черезДесять }).eq('id', задачаId).throwOnError()

    const { data: предложение } = await базаCare()
      .from('proposals')
      .select('id, case_id, payload, data_version')
      .eq('id', предложениеId)
      .single()
      .throwOnError()

    const итог = await свежесть(предложение!)
    expect(итог.свежо).toBe(false)
    if (!итог.свежо) {
      expect(итог.причина).toBe('stale_data')
      expect(итог.объяснение).toContain('Данные изменились')
    }

    const { data: после } = await базаCare()
      .from('proposals')
      .select('status')
      .eq('id', предложениеId)
      .maybeSingle()
    expect(после?.status).toBe('expired')
  })

  it('погасшее предложение ворота не пропускают', async () => {
    const решение = await воротаОтправки(предложениеId)
    expect(решение.разрешено).toBe(false)
    // Не `stale_data`: до третьей проверки дело уже не доходит — предложение
    // больше не ждёт решения, и это первое, что видят ворота.
    if (!решение.разрешено) expect(решение.причина).toBe('not_pending')
  })

  it('попытка отправить погасшее оставляет отказ с причиной, а не тишину', async () => {
    const итог = await поставитьВОчередь(предложениеId, участникId)
    expect(итог.ok).toBe(false)

    const { data: отправка } = await базаCare()
      .from('outbound_actions')
      .select('status, cancel_reason, recipient, external_id, attempts')
      .eq('proposal_id', предложениеId)
      .maybeSingle()

    expect(отправка?.status).toBe('cancelled')
    expect(отправка?.cancel_reason).toBe('not_pending')
    expect(отправка?.recipient).toEqual({})
    // Ничего не уходило: ни идентификатора сообщения, ни попыток.
    expect(отправка?.external_id).toBeNull()
    expect(отправка?.attempts).toBe(0)

    const { data: журнал } = await базаCare()
      .from('events')
      .select('action, reason')
      .eq('case_id', делоId)
      .eq('action', 'outbound_refused')
    expect((журнал ?? []).length).toBeGreaterThan(0)
  })

  it('вместо погасшего правило не подкладывает второе такое же', async () => {
    // Защита от повтора считает предложения по задаче независимо от их
    // статуса. Иначе каждое погасшее предложение возвращалось бы следующим
    // тиком, и клиент получал бы напоминание про то же самое каждый день.
    await подготовитьНапоминания()

    const { data } = await базаCare()
      .from('proposals')
      .select('id, status')
      .eq('case_id', делоId)
      .eq('kind', 'reminder')
    expect((data ?? []).length).toBe(1)
    expect(data![0].status).toBe('expired')
  })
})
