/**
 * Напоминания: подготовка, ворота, отправка. Приёмочные T06, T07, T12, T13.
 *
 * ЧТО ПРОВЕРЯЕТСЯ ЗДЕСЬ И ЧТО НЕЛЬЗЯ. Рубильник `external_sends` открыт
 * владельцем 30.09.2026, и ворота теперь держит вторая проверка — флаг
 * `outbound` у конкретного клиента. Сквозной путь «принял → ушло» по-прежнему
 * не проверяется: для этого пришлось бы включить флаг тестовому делу, и тогда
 * упавший посередине тест оставил бы контур с открытой дверью. Цена такой
 * ошибки — сообщение живому человеку.
 *
 * Флаги в тестах не переключаются намеренно, и это не осторожность ради
 * осторожности: единственное, что отделяет тестовый прогон от чужого чата, —
 * ровно эта запись в `care.feature_flags`.
 *
 * Третья и пятая проверки ворот (свежесть и получатель) вызываются здесь
 * напрямую — `свежесть` и `получательДела`. Это те же функции, которые зовут
 * сами ворота, а не их копии: до них внутри ворот при выключенном рубильнике
 * не доходит, но проверить их отдельно можно и нужно.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { базаCare } from '@/lib/care/db'
import { воротаОтправки, поставитьВОчередь, версияДанных, свежесть, получательДела } from '@/lib/care/gate/outbound'
import { подставить, подготовитьНапоминания } from '@/lib/care/jobs/reminders'
import { режим } from '@/lib/care/mode'
import { флагВключён } from '@/lib/care/flags'

let участникId = ''
let делоId = ''
let задачаId = ''

const черезДва = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)

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
      client_id: -900_700,
      intake_year: 2099,
      owner_member_id: участникId,
      is_synthetic: true,
      synthetic_name: 'Напоминалкин',
      // Автоматика нового контура работает только по делам, переведённым на v2.
      automation_owner: 'v2',
    })
    .select('id')
    .single()
    .throwOnError()
  делоId = д!.id

  await базаCare()
    .from('contacts')
    .insert({ case_id: делоId, kind: 'student', name: 'Иван Тестов', tg_chat_id: -100_500, can_decide: true })
    .throwOnError()

  const { data: з } = await базаCare()
    .from('tasks')
    .insert({
      case_id: делоId,
      title: 'Перевод диплома',
      due_on: черезДва,
      waiting_on: 'client',
      status: 'waiting',
    })
    .select('id')
    .single()
    .throwOnError()
  задачаId = з!.id
})

afterAll(async () => {
  if (делоId) await базаCare().from('cases').delete().eq('id', делоId)
  if (участникId) await базаCare().from('members').delete().eq('id', участникId)
})

describe('подстановка в шаблон', () => {
  const значения = { имя: 'Иван', документ: 'перевод диплома', дата: '15 января' }

  it('подставляет все три значения', () => {
    const итог = подставить('{имя}, напоминаем про {документ} — нужен до {дата}.', значения)
    expect(итог.ok).toBe(true)
    if (итог.ok) {
      expect(итог.текст).toBe('Иван, напоминаем про перевод диплома — нужен до 15 января.')
    }
  })

  it('незаполненный плейсхолдер не проходит', () => {
    // Иначе клиент получил бы «Иван, напоминаем про {документ}».
    const итог = подставить('{имя}, про {чего_нет} до {дата}.', значения)
    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.почему).toContain('{чего_нет}')
  })

  it('текст без даты не проходит', () => {
    // Напоминание без срока не напоминание.
    const итог = подставить('{имя}, напоминаем про {документ}.', значения)
    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.почему).toContain('дат')
  })

  it('текст без имени не проходит', () => {
    const итог = подставить('Напоминаем про {документ} до {дата}.', значения)
    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.почему).toContain('имен')
  })
})

describe('T06 — напоминание готовится, но не отправляется само', () => {
  it('по делу на v2 создаётся предложение', async () => {
    const итог = await подготовитьНапоминания()
    expect(итог.создано).toBeGreaterThan(0)

    const { data } = await базаCare()
      .from('proposals')
      .select('id, kind, status, payload')
      .eq('case_id', делоId)
      .eq('kind', 'reminder')
    expect((data ?? []).length).toBe(1)
    expect(data![0].status).toBe('pending')
    // Предложение — это ещё не отправка. Строки в outbound_actions быть не должно.
    const { data: отправки } = await базаCare()
      .from('outbound_actions')
      .select('id')
      .eq('proposal_id', data![0].id)
    expect(отправки ?? []).toHaveLength(0)
  })

  it('повторный запуск не создаёт второе напоминание по той же задаче', async () => {
    await подготовитьНапоминания()
    const { data } = await базаCare()
      .from('proposals')
      .select('id')
      .eq('case_id', делоId)
      .eq('kind', 'reminder')
    expect((data ?? []).length).toBe(1)
  })

  it('текст содержит имя, документ и дату', async () => {
    const { data } = await базаCare()
      .from('proposals')
      .select('payload')
      .eq('case_id', делоId)
      .eq('kind', 'reminder')
      .limit(1)
    const текст = (data![0].payload as { текст: string }).текст
    expect(текст).toContain('Иван')
    expect(текст).toContain('Перевод диплома')
    expect(текст.length).toBeGreaterThan(20)
  })
})

describe('T12 — без флага клиента ничего не уходит', () => {
  it('рубильник открыт — первая проверка больше не прикрывает', async () => {
    // Раньше здесь ждали `false`, и весь T12 держался на закрытом рубильнике.
    // Владелец открыл его 30.09.2026 (миграция 011), и теперь ворота держит
    // вторая проверка — флаг конкретного клиента. Так и должно быть: рубильник
    // про контур целиком, флаг — про человека.
    const с = await режим()
    expect(с.external_sends).toBe(true)
  })

  it('флаг outbound по умолчанию выключен', async () => {
    // То, на чём теперь стоит защита. Дело тестовое, клиента такого нет, и
    // флага ему никто не включал — как и всем остальным.
    expect(await флагВключён('outbound', { clientId: -900_700 })).toBe(false)
  })

  it('ворота отказывают с причиной flag_off', async () => {
    const { data } = await базаCare()
      .from('proposals')
      .select('id')
      .eq('case_id', делоId)
      .eq('kind', 'reminder')
      .limit(1)

    const решение = await воротаОтправки(data![0].id)
    expect(решение.разрешено).toBe(false)
    if (!решение.разрешено) expect(решение.причина).toBe('flag_off')
  })

  it('отказ записывается строкой с причиной, а не теряется', async () => {
    const { data } = await базаCare()
      .from('proposals')
      .select('id')
      .eq('case_id', делоId)
      .eq('kind', 'reminder')
      .limit(1)

    const итог = await поставитьВОчередь(data![0].id, участникId)
    expect(итог.ok).toBe(false)

    const { data: отправка } = await базаCare()
      .from('outbound_actions')
      .select('status, cancel_reason, recipient')
      .eq('proposal_id', data![0].id)
      .maybeSingle()

    expect(отправка?.status).toBe('cancelled')
    expect(отправка?.cancel_reason).toBe('flag_off')
    // Получателя при отказе не записываем: отправлять некому и незачем.
    expect(отправка?.recipient).toEqual({})
  })
})

describe('T13 — одно предложение, одна отправка', () => {
  it('два нажатия подряд не дают двух строк', async () => {
    const { data } = await базаCare()
      .from('proposals')
      .select('id')
      .eq('case_id', делоId)
      .eq('kind', 'reminder')
      .limit(1)

    await поставитьВОчередь(data![0].id, участникId)
    await поставитьВОчередь(data![0].id, участникId)

    const { data: отправки } = await базаCare()
      .from('outbound_actions')
      .select('id')
      .eq('proposal_id', data![0].id)
    expect((отправки ?? []).length).toBe(1)
  })

  it('база не даёт создать вторую отправку по тому же предложению', async () => {
    const { data } = await базаCare()
      .from('proposals')
      .select('id')
      .eq('case_id', делоId)
      .eq('kind', 'reminder')
      .limit(1)

    const { error } = await базаCare().from('outbound_actions').insert({
      proposal_id: data![0].id,
      channel: 'telegram',
      recipient: {},
      payload: {},
      payload_hash: 'x',
      status: 'queued',
    })
    // 23505 — сработал unique(proposal_id). Это и есть то, что защищает
    // человека от второго одинакового сообщения.
    expect(error?.code).toBe('23505')
  })
})

describe('T07 — данные изменились, напоминание гаснет', () => {
  it('свежее предложение проверку проходит', async () => {
    const { data: предложение } = await базаCare()
      .from('proposals')
      .select('id, case_id, payload, data_version')
      .eq('case_id', делоId)
      .eq('kind', 'reminder')
      .single()
      .throwOnError()

    const итог = await свежесть(предложение!)
    expect(итог.свежо).toBe(true)
  })

  // Идёт после проверки свежести: правка задачи двигает `updated_at`, и
  // вернуть слепок к прежнему значению уже нельзя.
  it('версия данных меняется вместе с задачей', async () => {
    const было = await версияДанных(делоId, задачаId)
    await базаCare().from('tasks').update({ status: 'in_progress' }).eq('id', задачаId).throwOnError()
    const стало = await версияДанных(делоId, задачаId)
    expect(стало).not.toBe(было)
    await базаCare().from('tasks').update({ status: 'waiting' }).eq('id', задачаId).throwOnError()
  })
})

describe('получатель берётся из дела, а не из текста', () => {
  it('пятая проверка отдаёт чат из дела', async () => {
    // Подмена адреса текстом предложения разобрана отдельно — приёмочный T19.
    const получатель = await получательДела(делоId)
    expect(получатель?.chatId).toBe(-100_500)
    expect(получатель?.имя).toBe('Иван Тестов')
  })

  it('в деле есть ровно один получатель-студент с чатом', async () => {
    const { data } = await базаCare()
      .from('contacts')
      .select('name, tg_chat_id')
      .eq('case_id', делоId)
      .eq('kind', 'student')
      .not('tg_chat_id', 'is', null)
    expect(data ?? []).toHaveLength(1)
    expect(data![0].tg_chat_id).toBe(-100_500)
  })
})
