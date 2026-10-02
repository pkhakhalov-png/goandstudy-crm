/**
 * Весь путь пилота за один проход — от сообщения клиента до строки отправки.
 *
 * ЗАЧЕМ ЭТО СВЕРХ ОСТАЛЬНЫХ ПРОВЕРОК. Каждое звено проверено своим тестом, и
 * каждое работает. Ломались не звенья, а стыки между ними, и находил я это
 * руками, по одному в день:
 *
 *   · переписка care-бота не доходила до разбора — представление читало
 *     таблицу прежнего бота;
 *   · care-бота не было ни в одной группе — чек-лист смотрел на поле, а не
 *     спрашивал Телеграм;
 *   · пауза напоминаний читала событие, которое нечем было записать;
 *   · флаг отправок клиенту не включался ниоткуда.
 *
 * Каждый раз всё выглядело исправным: ошибок нет, прогон зелёный, тишина. Этот
 * тест проходит цепочку целиком и утверждает не «функция вернула», а «следующее
 * звено получило то, что ему нужно».
 *
 * ПОЧЕМУ ОН НЕ ДОХОДИТ ДО НАСТОЯЩЕЙ ОТПРАВКИ. Рубильник контура открыт с
 * 30.09.2026 — владелец разрешил отправки, и это записано в `care.env_marker`.
 * Значит единственная дверь, которая здесь ещё закрыта, — флаг `outbound` по
 * клиенту. Его мы и не открываем: иначе проверка создала бы строку, которую
 * воркер попытался бы отправить в выдуманный чат. Решение ворот при включённом
 * флаге спрашиваем отдельно, не создавая ничего.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { базаCare } from '@/lib/care/db'
import { привязатьГруппу } from '@/lib/care/chats'
import { разрешитьОтправки } from '@/lib/care/sends'
import { подготовитьНапоминания } from '@/lib/care/jobs/reminders'
import { поставитьВОчередь, воротаОтправки, ОБЪЯСНЕНИЕ } from '@/lib/care/gate/outbound'
import { отправки } from '@/lib/care/outbox'
import { отметитьОтвет } from '@/lib/care/pause'

const КЛИЕНТ = -990_791
const ЧАТ = '-5559991111'
const ВОПРОС = 'Здравствуйте! А диплом нужно переводить присяжным переводчиком?'

let дело = ''
let участник = ''
let задача = ''
const события: string[] = []

async function входящее(текст: string) {
  const id = `путь-${randomUUID()}`
  const { error } = await базаCare()
    .from('inbound_events')
    .insert({
      channel: 'telegram',
      external_id: id,
      payload: {
        message: {
          chat: { id: Number(ЧАТ), type: 'group', title: 'Группа Тестова' },
          from: { first_name: 'Алиса' },
          text: текст,
        },
      },
    })
  if (error) throw new Error(error.message)
  события.push(id)
}

beforeAll(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  await базаCare().from('feature_flags').delete().eq('scope', 'client').eq('scope_id', String(КЛИЕНТ))

  const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
  участник = у!.id as string

  const { data: д, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      intake_term: 'тест-путь',
      owner_member_id: участник,
      is_synthetic: true,
      synthetic_name: 'ТЕСТ пути пилота',
      automation_owner: 'v2',
      status: 'active',
      switched_at: new Date(Date.now() - 86_400_000).toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  дело = д!.id as string
})

afterAll(async () => {
  for (const id of события.splice(0)) {
    await базаCare().from('inbound_events').delete().eq('external_id', id)
  }
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  await базаCare().from('feature_flags').delete().eq('scope', 'client').eq('scope_id', String(КЛИЕНТ))
})

describe('путь пилота целиком', () => {
  it('1. клиент написал — кабинет это видит', async () => {
    await входящее(ВОПРОС)
    const привязка = await привязатьГруппу(дело, ЧАТ, участник)
    expect(привязка.ok).toBe(true)

    const { data } = await базаCare()
      .from('case_messages')
      .select('content, direction')
      .eq('case_id', дело)

    // Тот самый стык: событие Телеграма должно дойти до представления, из
    // которого читают разбор входящих и извлечение фактов.
    expect((data ?? []).map((с) => с.content)).toContain(ВОПРОС)
    expect(data![0].direction).toBe('incoming')
  })

  it('2. привязка дала и адрес для отправки, и источник для чтения', async () => {
    const [{ data: контакты }, { data: источники }] = await Promise.all([
      базаCare().from('contacts').select('tg_chat_id').eq('case_id', дело).not('tg_chat_id', 'is', null),
      базаCare().from('sources').select('ref').eq('case_id', дело).eq('kind', 'message'),
    ])

    // Одна половина без другой даёт дело, где переписка видна, а написать
    // нельзя. Разбираться в этом пришлось бы в день просроченного срока.
    expect(String(контакты![0].tg_chat_id)).toBe(ЧАТ)
    expect((источники ?? []).some((и) => (и.ref as { chat_id?: string }).chat_id === ЧАТ)).toBe(true)
  })

  it('3. задача «ждём клиента» со сроком превращается в предложение', async () => {
    const { data: з } = await базаCare()
      .from('tasks')
      .insert({
        case_id: дело,
        title: 'Перевод диплома с апостилем',
        waiting_on: 'client',
        status: 'waiting',
        due_on: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
        assignee_member_id: участник,
      })
      .select('id')
      .single()
    задача = з!.id as string

    const итог = await подготовитьНапоминания()
    expect(итог.создано, итог.причины.join('; ')).toBeGreaterThanOrEqual(1)

    const { data: предложения } = await базаCare()
      .from('proposals')
      .select('id, payload, status')
      .eq('case_id', дело)
      .eq('kind', 'reminder')

    expect(предложения).toHaveLength(1)
    // Текст обязан быть про эту задачу, а не про «документы вообще»: иначе
    // клиент получает письмо, которое к нему не относится.
    const payload = предложения![0].payload as { текст?: string; task_id?: string }
    expect(payload.task_id).toBe(задача)
    expect(String(payload.текст)).toMatch(/диплом/i)
  }, 120_000)

  it('4. пауза «я ответил сам» останавливает подготовку следующих', async () => {
    await отметитьОтвет(дело, участник)

    // Вторая задача на том же деле: без паузы по ней подготовилось бы ещё одно.
    await базаCare().from('tasks').insert({
      case_id: дело,
      title: 'Рекомендательное письмо',
      waiting_on: 'client',
      status: 'waiting',
      due_on: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      assignee_member_id: участник,
    })

    await подготовитьНапоминания()

    const { data } = await базаCare()
      .from('proposals')
      .select('id')
      .eq('case_id', дело)
      .eq('kind', 'reminder')

    expect(data).toHaveLength(1)
  }, 120_000)

  it('5. без флага клиента ворота не пропускают', async () => {
    const { data: предложение } = await базаCare()
      .from('proposals')
      .select('id')
      .eq('case_id', дело)
      .eq('kind', 'reminder')
      .single()

    const итог = await поставитьВОчередь(предложение!.id as string, участник)

    // Флаг этому клиенту не включён — и это единственный правильный исход.
    // Включать его здесь нельзя: рубильник контура открыт, и строка в очереди
    // стала бы настоящей попыткой отправки в выдуманный чат.
    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.объяснение).toBe(ОБЪЯСНЕНИЕ.flag_off)

    const { data: отправка } = await базаCare()
      .from('outbound_actions')
      .select('status, recipient')
      .eq('proposal_id', предложение!.id)
      .single()

    expect(отправка!.status).toBe('cancelled')
    // Чужого адреса в строке нет ни в одном исходе — на этом стоит T19.
    expect(JSON.stringify(отправка!.recipient)).not.toContain('99999')
  })

  it('6. с флагом ворота дают адрес из дела, а не из текста', async () => {
    const разрешение = await разрешитьОтправки(дело, true, участник)
    expect(разрешение.ok).toBe(true)

    const { data: предложение } = await базаCare()
      .from('proposals')
      .select('id')
      .eq('case_id', дело)
      .eq('kind', 'reminder')
      .single()

    // Спрашиваем решение, ничего не создавая: строка в очереди здесь была бы
    // настоящей попыткой отправки.
    const решение = await воротаОтправки(предложение!.id as string)

    if (решение.разрешено) {
      // Адрес приходит из care.contacts дела — не из текста сообщения и не из
      // payload предложения.
      expect(String(решение.chatId)).toBe(ЧАТ)
    } else {
      // Вне рабочего времени ворота отказывают тихими часами. Это единственный
      // оставшийся исход, и он тоже верный: проверка не должна зависеть от
      // часа, в который её запустили.
      expect(решение.причина).toBe('quiet_hours')
    }
  })

  it('7. журнал отправок показывает это куратору с причиной', async () => {
    const список = await отправки([дело])

    expect(список.последние).toHaveLength(1)
    expect(список.последние[0].статус).toBe('cancelled')
    // «Отменено» без причины читается как поломка, а это сработавшая защита.
    expect(список.последние[0].причинаОтмены).toBeTruthy()
  })
})
