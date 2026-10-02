/**
 * Правки в прежнем кабинете по переведённому клиенту.
 *
 * ЗАЧЕМ ЭТО ЕСТЬ. Клиента перевели на новый кабинет, но прежний показывать его
 * не перестал: мы старый кабинет не меняли, и запрет там — дисциплина, а не
 * замок. Куратор по привычке правит этап в старом окне, новый кабинет об этом
 * не знает и месяцами работает на своих сведениях. Заметно это становится,
 * когда клиент говорит «я же вам писал».
 *
 * ЧТО ЗАЩИЩАЕМ ОСОБЕННО. Первую сверку. Если бы она считала расхождением всё
 * подряд, в день включения загорелись бы все одиннадцать дел разом — и сигнал,
 * который горит у всех, перестают читать в тот же день. Сравнивать не с чем —
 * значит молчать и запомнить.
 *
 * Отпечаток и сравнение проверяются без базы: это чистый счёт, и гонять ради
 * него запросы значит платить временем за то же самое.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { отпечаток, чтоИзменилось, недавниеПравки, ПОЛЯ } from '@/lib/care/legacy'

const клиент = (ч: Record<string, unknown> = {}) => ({
  current_stage_code: 'docs',
  status: 'active',
  curator_id: 'к-1',
  university: 'TUM',
  country: 'Германия',
  months: 6,
  service_type: 'full',
  roadmap_data: { шаги: ['один', 'два'] },
  project_data: null,
  ...ч,
})

describe('отпечаток клиента', () => {
  it('одинаковые значения дают одинаковый отпечаток', () => {
    expect(отпечаток(клиент())).toEqual(отпечаток(клиент()))
  })

  it('пустое и отсутствующее — одно и то же', () => {
    // Иначе появление столбца со значением null читалось бы как правка.
    const без = отпечаток(клиент({ project_data: undefined }))
    const сПустым = отпечаток(клиент({ project_data: null }))
    expect(без.project_data).toBe(сПустым.project_data)
  })

  it('значений в отпечатке нет — только хэши', () => {
    // `roadmap_data` это большой документ клиента, и держать его копию в
    // контуре значит хранить рабочие данные там, где они не нужны.
    const о = отпечаток(клиент())
    expect(JSON.stringify(о)).not.toContain('TUM')
    expect(JSON.stringify(о)).not.toContain('шаги')
  })

  it('отпечаток покрывает все объявленные поля', () => {
    const о = отпечаток(клиент())
    for (const { поле } of ПОЛЯ) expect(о[поле], `нет хэша поля ${поле}`).toBeTruthy()
  })
})

describe('что изменилось', () => {
  it('первая сверка расхождений не заявляет', () => {
    // Сравнивать не с чем. Иначе в день включения загорелись бы все дела разом.
    expect(чтоИзменилось(null, отпечаток(клиент()))).toEqual([])
  })

  it('без изменений — пусто', () => {
    expect(чтоИзменилось(отпечаток(клиент()), отпечаток(клиент()))).toEqual([])
  })

  it('изменённое поле названо по-человечески, а не именем столбца', () => {
    // «Изменили current_stage_code» ничего не говорит куратору.
    const было = отпечаток(клиент())
    const стало = отпечаток(клиент({ current_stage_code: 'offer' }))

    expect(чтоИзменилось(было, стало)).toEqual(['этап'])
  })

  it('несколько полей перечисляются все', () => {
    const было = отпечаток(клиент())
    const стало = отпечаток(клиент({ current_stage_code: 'offer', roadmap_data: { шаги: ['три'] } }))

    const изменилось = чтоИзменилось(было, стало)
    expect(изменилось).toContain('этап')
    expect(изменилось).toContain('дорожная карта')
  })

  it('поле, которого не было в прежнем отпечатке, изменением не считается', () => {
    // Это мы расширили список полей, а не куратор что-то поправил. Иначе
    // каждое расширение разом объявляло бы правками все дела.
    const было = { current_stage_code: отпечаток(клиент()).current_stage_code }
    const стало = отпечаток(клиент())

    expect(чтоИзменилось(было, стало)).toEqual([])
  })
})

describe('правки в ленте внимания', () => {
  const КЛИЕНТ = -990_790
  let дело = ''

  afterEach(async () => {
    if (дело) await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
    дело = ''
  })

  async function завести() {
    const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
    const { data, error } = await базаCare()
      .from('cases')
      .insert({
        client_id: КЛИЕНТ,
        intake_year: 2027,
        intake_term: 'тест-прежний',
        owner_member_id: у!.id,
        is_synthetic: true,
        synthetic_name: 'ТЕСТ прежнего кабинета',
        automation_owner: 'v2',
        status: 'active',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    дело = data!.id as string
    return дело
  }

  it('свежая правка видна с перечнем полей', async () => {
    const id = await завести()
    await базаCare().from('events').insert({
      actor_kind: 'system',
      case_id: id,
      action: 'legacy_write_detected',
      after: { поля: ['этап', 'дорожная карта'] },
      source: { тест: true },
    })

    const карта = await недавниеПравки([id])

    expect(карта.get(id)).toEqual(['этап', 'дорожная карта'])
  })

  it('старая правка из ленты уходит', async () => {
    // Строка, висящая месяцами, перестаёт читаться, а разбираться с правкой
    // месячной давности уже поздно.
    const id = await завести()
    await базаCare().from('events').insert({
      actor_kind: 'system',
      case_id: id,
      action: 'legacy_write_detected',
      after: { поля: ['этап'] },
      source: { тест: true },
      created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    })

    expect((await недавниеПравки([id])).has(id)).toBe(false)
  })

  it('пустая область не идёт в базу', async () => {
    expect((await недавниеПравки([])).size).toBe(0)
  })
})
