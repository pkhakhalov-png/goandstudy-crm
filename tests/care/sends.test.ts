/**
 * Разрешение писать конкретному клиенту — последняя дверь перед настоящим
 * сообщением.
 *
 * ОТКУДА ЭТО. Флаг `outbound` по клиенту не включался ниоткуда: ни экраном, ни
 * скриптом. Перед первым живым напоминанием владельцу пришлось бы просить
 * правку в базе — то есть меня. Рост пилота упирался бы в это на каждом новом
 * клиенте.
 *
 * ЧЕГО ЗДЕСЬ НЕТ НАРОЧНО. Рубильника контура. `external_sends` меняется
 * миграцией, и это осознанно: предохранитель, который переключается нажатием,
 * однажды переключится по ошибке. Экран его показывает, но не трогает.
 *
 * ЧТО ЗАЩИЩАЕМ. Включение не должно выглядеть как готовность там, где её нет:
 * закрытый контур и недоступная группа означают, что сообщение не уйдёт, и
 * сказать об этом надо в момент нажатия, а не в день просроченного срока.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { картинаОтправок, разрешитьОтправки } from '@/lib/care/sends'
import { флагВключён } from '@/lib/care/flags'

const КЛИЕНТ = -990_788
let дело: string
let наLegacy: string
let участник: string

beforeEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  await базаCare().from('feature_flags').delete().eq('scope', 'client').eq('scope_id', String(КЛИЕНТ))

  const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
  участник = у!.id as string

  const завести = async (семестр: string, владелец: 'v2' | 'legacy') => {
    const { data, error } = await базаCare()
      .from('cases')
      .insert({
        client_id: КЛИЕНТ,
        intake_year: 2027,
        intake_term: семестр,
        owner_member_id: участник,
        is_synthetic: true,
        synthetic_name: 'ТЕСТ отправок',
        automation_owner: владелец,
        status: 'active',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data!.id as string
  }
  дело = await завести('тест-отпр-1', 'v2')
  наLegacy = await завести('тест-отпр-2', 'legacy')
})

afterEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  await базаCare().from('feature_flags').delete().eq('scope', 'client').eq('scope_id', String(КЛИЕНТ))
})

describe('картина отправок', () => {
  it('дело нового кабинета в списке, по умолчанию запрещено', async () => {
    const к = await картинаОтправок([дело, наLegacy])
    const наше = к.строки.find((с) => с.caseId === дело)

    expect(наше).toBeTruthy()
    // Умолчание — «нельзя». Любая неясность в эту сторону.
    expect(наше!.разрешено).toBe(false)
  })

  it('дело прежнего кабинета в список не попадает', async () => {
    // Автоматика его не видит вовсе, и флаг означал бы разрешение, которым
    // некому воспользоваться.
    const к = await картинаОтправок([дело, наLegacy])
    expect(к.строки.find((с) => с.caseId === наLegacy)).toBeUndefined()
  })

  it('непроверенный канал не выдаётся за доступный', async () => {
    // Нет записи о проверке — это незнание, а не готовность.
    const к = await картинаОтправок([дело])
    const наше = к.строки.find((с) => с.caseId === дело)!
    expect(наше.каналДоступен).toBe(false)
    expect(наше.почемуКанал).toContain('не проверялся')
  })

  it('состояние рубильника контура видно', async () => {
    // Без него руководитель включает флаг, ничего не происходит, и причина
    // остаётся невидимой.
    const к = await картинаОтправок([дело])
    expect(typeof к.контурОткрыт).toBe('boolean')
  })
})

describe('разрешение и запрет', () => {
  it('разрешение включает флаг клиента', async () => {
    const итог = await разрешитьОтправки(дело, true, участник)
    expect(итог.ok).toBe(true)

    expect(await флагВключён('outbound', { clientId: КЛИЕНТ })).toBe(true)
  })

  it('разрешение честно называет, почему всё равно не уйдёт', async () => {
    // Контур закрыт и группа не проверена — молчаливое «готово» здесь и есть
    // то, из-за чего потом ищут, почему ничего не ушло.
    const итог = await разрешитьОтправки(дело, true, участник)
    expect(итог.ok).toBe(true)
    if (итог.ok) {
      expect(итог.текст).toMatch(/рубильник|бот писать не может/)
    }
  })

  it('запрет выключает флаг', async () => {
    await разрешитьОтправки(дело, true, участник)
    const итог = await разрешитьОтправки(дело, false, участник)

    expect(итог.ok).toBe(true)
    expect(await флагВключён('outbound', { clientId: КЛИЕНТ })).toBe(false)
  })

  it('дело прежнего кабинета не разрешается', async () => {
    const итог = await разрешитьОтправки(наLegacy, true, участник)
    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.ошибка).toContain('прежний кабинет')
  })

  it('решение записано в журнал дела', async () => {
    // «Кто разрешил писать этому клиенту и когда» — первый вопрос, если
    // сообщение ушло не вовремя или не туда.
    await разрешитьОтправки(дело, true, участник)

    const { data } = await базаCare()
      .from('events')
      .select('action')
      .eq('case_id', дело)
      .eq('action', 'outbound_allowed')

    expect((data ?? []).length).toBe(1)
  })

  it('повторное разрешение не плодит записей флага', async () => {
    await разрешитьОтправки(дело, true, участник)
    await разрешитьОтправки(дело, true, участник)

    const { data } = await базаCare()
      .from('feature_flags')
      .select('id')
      .eq('flag', 'outbound')
      .eq('scope', 'client')
      .eq('scope_id', String(КЛИЕНТ))

    expect((data ?? []).length).toBe(1)
  })
})
