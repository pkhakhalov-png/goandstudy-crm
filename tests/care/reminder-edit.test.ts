/**
 * Правка текста напоминания перед отправкой.
 *
 * ЗАЧЕМ. У куратора было два ответа: отправить как есть или пропустить с
 * причиной. Если в тексте одно слово не то — «справка» вместо «справки о
 * доходах», обращение не то, — выбор между «отправить неточное» и «не отправить
 * ничего». На практике выбирают второе и пишут сами, а тогда контур перестаёт
 * экономить время, ради чего строится.
 *
 * ЧТО ЗАЩИЩАЕМ. Правка не должна становиться дырой:
 *
 *   — решённое не правится: отправленное уже у человека, отклонённое решено;
 *   — пустое и чрезмерное не сохраняется;
 *   — хэш payload пересчитывается, иначе он врёт о том, что описывает;
 *   — прежний текст остаётся в журнале. Правки — единственная обратная связь
 *     о шаблонах: правят обращение — шаблон не тот, правят название
 *     документа — задача названа неудачно. Без прежнего текста сравнивать не с
 *     чем.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { исправитьТекст } from '@/lib/care/reminder-edit'

const КЛИЕНТ = -990_792
let дело: string
let участник: string
let предложение: string

const ИСХОДНЫЙ = 'Алиса, напоминаем про справку. Срок — 15 января.'

async function завестиПредложение(статус = 'pending') {
  const { data, error } = await базаCare()
    .from('proposals')
    .insert({
      case_id: дело,
      kind: 'reminder',
      payload: { текст: ИСХОДНЫЙ, task_id: null },
      payload_hash: 'исходный',
      data_version: 'тест',
      status: статус,
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

  const { data, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      intake_term: 'тест-правка',
      owner_member_id: участник,
      is_synthetic: true,
      synthetic_name: 'ТЕСТ правки',
      automation_owner: 'v2',
      status: 'active',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  дело = data!.id as string
  предложение = await завестиПредложение()
})

afterEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
})

async function текущий() {
  const { data } = await базаCare()
    .from('proposals')
    .select('payload, payload_hash')
    .eq('id', предложение)
    .single()
  return data!
}

describe('правка текста', () => {
  it('сохранённый текст заменяет прежний', async () => {
    const новый = 'Алиса, напоминаем про справку о доходах. Срок — 15 января.'

    const итог = await исправитьТекст(предложение, новый, участник)
    expect(итог.ok).toBe(true)

    const п = await текущий()
    expect((п.payload as { текст?: string }).текст).toBe(новый)
  })

  it('хэш payload пересчитывается', async () => {
    // Он описывает payload, и оставить прежний значило бы соврать о нём.
    await исправитьТекст(предложение, 'Другой текст напоминания целиком', участник)

    const п = await текущий()
    expect(п.payload_hash).not.toBe('исходный')
    expect(String(п.payload_hash).length).toBeGreaterThan(8)
  })

  it('правка помечена в payload', async () => {
    // Чтобы в журнале отправок и в разборе было видно: это писал человек.
    await исправитьТекст(предложение, 'Поправленный текст напоминания', участник)

    const п = await текущий()
    expect((п.payload as { правлено_человеком?: boolean }).правлено_человеком).toBe(true)
  })

  it('прежний текст остаётся в журнале', async () => {
    const новый = 'Совсем другое напоминание для клиента'
    await исправитьТекст(предложение, новый, участник)

    const { data } = await базаCare()
      .from('events')
      .select('before, after')
      .eq('case_id', дело)
      .eq('action', 'reminder_edited')
      .single()

    expect((data!.before as { текст?: string }).текст).toBe(ИСХОДНЫЙ)
    expect((data!.after as { текст?: string }).текст).toBe(новый)
  })

  it('пустой текст не сохраняется', async () => {
    const итог = await исправитьТекст(предложение, '   ', участник)

    expect(итог.ok).toBe(false)
    expect((await текущий()).payload).toMatchObject({ текст: ИСХОДНЫЙ })
  })

  it('слишком длинный не сохраняется', async () => {
    // Напоминание читают с экрана телефона: простыня там не читается вовсе.
    const итог = await исправитьТекст(предложение, 'а'.repeat(1001), участник)

    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.ошибка).toContain('знаков')
  })

  it('решённое не правится', async () => {
    // Отправленное уже у человека, отклонённое решено: правка здесь меняла бы
    // запись о прошлом.
    const решённое = await завестиПредложение('accepted')

    const итог = await исправитьТекст(решённое, 'Поздняя правка текста', участник)

    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.ошибка).toContain('уже приняли решение')
  })

  it('тот же текст журнал не засоряет', async () => {
    // Куратор открыл правку, ничего не изменил и сохранил.
    const итог = await исправитьТекст(предложение, ИСХОДНЫЙ, участник)
    expect(итог.ok).toBe(true)

    const { data } = await базаCare()
      .from('events')
      .select('id')
      .eq('case_id', дело)
      .eq('action', 'reminder_edited')

    expect((data ?? []).length).toBe(0)
  })

  it('чужой вид предложения не правится', async () => {
    const { data } = await базаCare()
      .from('proposals')
      .insert({
        case_id: дело,
        kind: 'other',
        payload: { текст: 'не напоминание' },
        payload_hash: 'иное',
        data_version: 'тест',
        status: 'pending',
      })
      .select('id')
      .single()

    const итог = await исправитьТекст(data!.id as string, 'Попытка правки чужого', участник)
    expect(итог.ok).toBe(false)
  })
})
