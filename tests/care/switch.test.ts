/**
 * Перевод клиента на новый кабинет и возврат — раздел 5 плана.
 *
 * ПОЧЕМУ ЭТО ПРОВЕРЯЕТСЯ ОТДЕЛЬНО. Перевод решает, какая система ведёт живого
 * человека. Переведённый без привязанного чата клиент просто перестаёт получать
 * что-либо: напоминания готовятся, уходить им некуда, и заметить это можно
 * только по тишине — через неделю, когда человек сам напишет «а что там?».
 *
 * Поэтому непройденный пункт чек-листа — отказ, а не предупреждение. И поэтому
 * один и тот же чек-лист у экрана и у скрипта: разъедутся — и экран однажды
 * переведёт того, кого скрипт переводить отказался.
 *
 * ВОЗВРАТ ПРОВЕРЯЕТСЯ ПО ПОСЛЕДСТВИЯМ. Он не переключатель вида: отменяет
 * задания, гасит предложения, чистит очередь отправки. Если что-то из этого не
 * сработает, по вернувшемуся клиенту продолжит работать автоматика, которую
 * никто уже не смотрит.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { готовность, перевестиНаV2, вернутьНаLegacy, ктоГде } from '@/lib/care/switch'

const КЛИЕНТ = -990_784
let дело: string
let владелец: string
// Набор уникален по (клиент, год, семестр), а дел в одном тесте бывает два.
// Счётчик даёт каждому свой семестр — выдумывать «осень/весна» здесь не о чем.
let счётчик = 0

async function завести(ч: { наV2?: boolean; synthetic?: boolean; владелец?: boolean } = {}) {
  счётчик += 1
  const тестовое = ч.synthetic !== false
  const { data, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      intake_term: `тест-${счётчик}`,
      owner_member_id: ч.владелец === false ? null : владелец,
      is_synthetic: тестовое,
      // Имя разрешено только тестовым делам — ограничение таблицы следит, чтобы
      // настоящий клиент не оказался подписан выдуманным именем.
      synthetic_name: тестовое ? 'ТЕСТ переключения' : null,
      automation_owner: ч.наV2 ? 'v2' : 'legacy',
      status: 'active',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data!.id as string
}

async function кабинет(id: string) {
  const { data } = await базаCare().from('cases').select('automation_owner, switched_at').eq('id', id).single()
  return data!
}

beforeEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  счётчик = 0
  const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
  владелец = у!.id as string
  дело = await завести()
})

afterEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
})

describe('чек-лист включения', () => {
  it('дело без владельца не готово, и сказано почему', async () => {
    const без = await завести({ владелец: false })

    const г = await готовность(без)

    expect(г!.готово).toBe(false)
    const пункт = г!.пункты.find((п) => п.пункт.includes('владелец'))
    expect(пункт!.ok).toBe(false)
    // Отказ без подсказки читается как поломка кнопки.
    expect(пункт!.подсказка).toBeTruthy()
  })

  it('у тестового дела чат и история не спрашиваются', async () => {
    // Чата у них нет по построению, и переписываться там не с кем.
    const г = await готовность(дело)
    expect(г!.пункты.some((п) => п.пункт.includes('чат Телеграма'))).toBe(false)
  })

  it('у настоящего дела без чата и истории — два отказа с командами', async () => {
    const настоящее = await завести({ synthetic: false })

    const г = await готовность(настоящее)

    const чат = г!.пункты.find((п) => п.пункт.includes('чат Телеграма'))
    const история = г!.пункты.find((п) => п.пункт.includes('история'))
    expect(чат!.ok).toBe(false)
    expect(история!.ok).toBe(false)
    expect(чат!.подсказка).toContain('link-chats')
    expect(история!.подсказка).toContain('import-history')
  })

  it('номера несуществующего дела нет', async () => {
    expect(await готовность('00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})

describe('перевод на новый кабинет', () => {
  it('непройденный чек-лист — отказ, и кабинет не меняется', async () => {
    const настоящее = await завести({ synthetic: false })

    const итог = await перевестиНаV2(настоящее, { actor_kind: 'system', откуда: 'тест' })

    expect(итог.ok).toBe(false)
    expect((await кабинет(настоящее)).automation_owner).toBe('legacy')
  })

  it('пройденный — переводит и ставит дату', async () => {
    const итог = await перевестиНаV2(дело, { actor_kind: 'system', откуда: 'тест' })
    expect(итог.ok).toBe(true)

    const к = await кабинет(дело)
    expect(к.automation_owner).toBe('v2')
    expect(к.switched_at).toBeTruthy()
  })

  it('второй перевод не меняет дату — две вкладки, два нажатия', async () => {
    await перевестиНаV2(дело, { actor_kind: 'system', откуда: 'тест' })
    const была = (await кабинет(дело)).switched_at

    const второй = await перевестиНаV2(дело, { actor_kind: 'system', откуда: 'тест' })

    expect(второй.ok).toBe(false)
    expect((await кабинет(дело)).switched_at).toBe(была)
  })

  it('перевод записан в журнал дела', async () => {
    // Без записи «кто и когда» спор «почему этот клиент на новом кабинете»
    // упирается в догадки.
    await перевестиНаV2(дело, { actor_kind: 'system', откуда: 'тест' })

    const { data } = await базаCare()
      .from('events')
      .select('action, source')
      .eq('case_id', дело)
      .eq('action', 'switched_to_v2')

    expect((data ?? []).length).toBe(1)
  })
})

describe('возврат старому кабинету', () => {
  it('отменяет задания, гасит предложения и чистит очередь отправки', async () => {
    const наV2 = await завести({ наV2: true })

    const { data: з } = await базаCare()
      .from('jobs')
      .insert({ kind: 'echo', case_id: наV2, payload: {}, status: 'queued' })
      .select('id')
      .single()
    const { data: п } = await базаCare()
      .from('proposals')
      .insert({
        case_id: наV2,
        kind: 'other',
        payload: { тест: true },
        payload_hash: 'тест',
        data_version: 'тест',
        status: 'pending',
      })
      .select('id')
      .single()

    const итог = await вернутьНаLegacy(наV2, { actor_kind: 'system', откуда: 'тест' })
    expect(итог.ok).toBe(true)

    const { data: задание } = await базаCare().from('jobs').select('status').eq('id', з!.id).single()
    const { data: предложение } = await базаCare()
      .from('proposals')
      .select('status')
      .eq('id', п!.id)
      .single()

    // Иначе по вернувшемуся клиенту продолжит работать автоматика, которую
    // уже никто не смотрит.
    expect(задание!.status).toBe('cancelled')
    expect(предложение!.status).toBe('expired')
    expect((await кабинет(наV2)).automation_owner).toBe('legacy')
  })

  it('дело старого кабинета вернуть нельзя — возвращать нечего', async () => {
    const итог = await вернутьНаLegacy(дело, { actor_kind: 'system', откуда: 'тест' })
    expect(итог.ok).toBe(false)
  })
})

describe('кто где', () => {
  it('показывает кабинет по каждому делу области', async () => {
    const наV2 = await завести({ наV2: true })

    const строки = await ктоГде([дело, наV2])

    expect(строки.find((с) => с.caseId === наV2)!.наV2).toBe(true)
    expect(строки.find((с) => с.caseId === дело)!.наV2).toBe(false)
  })

  it('пустой области — пустой ответ, а не запрос ко всей базе', async () => {
    expect(await ктоГде([])).toEqual([])
  })
})
