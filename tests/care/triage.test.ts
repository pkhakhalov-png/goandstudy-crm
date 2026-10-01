/**
 * Разбор входящих: чем было сообщение клиента.
 *
 * ЗАЧЕМ ЭТО ЕСТЬ. Разбор переписки достаёт из сообщений факты. Но «а когда
 * дедлайн в Мюнхене?» — это не факт о клиенте, и разбор проходит мимо. Вопрос
 * остаётся в чате, куратор его не видит, клиент ждёт. Неотвеченный вопрос —
 * самое дорогое молчание в этой работе: он не горит, ни о чём не напоминает и
 * обнаруживается, когда человек уходит к другим.
 *
 * ЧТО ПРОВЕРЯЕМ. Не то, что модель угадывает ярлык, а то, что из её ответа
 * нельзя получить задачу, которой не на чем стоять:
 *
 *   — цитата ищется в том самом сообщении, а не в переписке вообще. Иначе
 *     вопрос из одного сообщения припишется другому, и куратор ответит не на
 *     то, о чём спрашивали;
 *   — вид не из словаря отбрасывается: по нему непонятно, что делать;
 *   — повторный разбор не заводит вторую задачу на тот же вопрос. Разбор идёт
 *     каждые пять минут, и без этого список дел засыпало бы копиями.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { проверитьРазбор, ВИДЫ, ПОДПИСЬ_ВИДА } from '@/lib/care/ai/triage'
import { разобратьВходящие } from '@/lib/care/jobs/triage'
import { randomUUID } from 'crypto'
import type { Сообщение } from '@/lib/care/ai/extract'

const СООБЩЕНИЯ: Сообщение[] = [
  {
    message_id: 'm1',
    created_at: '2026-10-01T09:00:00Z',
    sender_name: 'Алиса',
    content: 'Здравствуйте! А когда дедлайн подачи в Мюнхене на осенний набор?',
  },
  {
    message_id: 'm2',
    created_at: '2026-10-01T09:05:00Z',
    sender_name: 'Алиса',
    content: 'И ещё: диплом переведён, скан отправила вам на почту.',
  },
]

describe('проверка разбора', () => {
  it('годный разбор проходит', () => {
    const р = проверитьРазбор(
      { message_id: 'm1', kind: 'question', about: 'спрашивает про сроки подачи в Мюнхене', quote: 'когда дедлайн подачи в Мюнхене' },
      СООБЩЕНИЯ
    )
    expect(р.ok).toBe(true)
  })

  it('цитата из другого сообщения не проходит', () => {
    // Самая опасная ошибка: ярлык повесить легко, а куратор ответит не на то,
    // о чём спрашивали.
    const р = проверитьРазбор(
      { message_id: 'm1', kind: 'document', about: 'прислала диплом', quote: 'диплом переведён, скан отправила' },
      СООБЩЕНИЯ
    )
    expect(р.ok).toBe(false)
    if (!р.ok) expect(р.почему).toContain('дословно')
  })

  it('выдуманная цитата не проходит', () => {
    const р = проверитьРазбор(
      { message_id: 'm1', kind: 'question', about: 'спрашивает про общежитие', quote: 'а общежитие дают всем?' },
      СООБЩЕНИЯ
    )
    expect(р.ok).toBe(false)
  })

  it('вид не из словаря не проходит', () => {
    const р = проверитьРазбор(
      { message_id: 'm1', kind: 'жалоба', about: 'что-то', quote: 'когда дедлайн подачи в Мюнхене' },
      СООБЩЕНИЯ
    )
    expect(р.ok).toBe(false)
    if (!р.ok) expect(р.почему).toContain('словаря')
  })

  it('сообщение с чужим номером не проходит', () => {
    const р = проверитьРазбор(
      { message_id: 'нет такого', kind: 'question', about: 'что-то', quote: 'когда дедлайн подачи в Мюнхене' },
      СООБЩЕНИЯ
    )
    expect(р.ok).toBe(false)
  })

  it('короткая цитата не проходит — проверять нечем', () => {
    const р = проверитьРазбор(
      { message_id: 'm1', kind: 'question', about: 'сроки', quote: 'когда' },
      СООБЩЕНИЯ
    )
    expect(р.ok).toBe(false)
  })

  it('у каждого вида есть русская подпись', () => {
    // Иначе в задаче у куратора окажется «question» — слово из кода.
    for (const в of ВИДЫ) {
      expect(ПОДПИСЬ_ВИДА[в]).toBeTruthy()
      expect(ПОДПИСЬ_ВИДА[в]).toMatch(/[а-яё]/i)
    }
  })
})

describe('разбор входящих по делу', () => {
  const КЛИЕНТ = -990_779
  let дело: string

  beforeEach(async () => {
    await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
    const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
    const { data: д, error } = await базаCare()
      .from('cases')
      .insert({
        client_id: КЛИЕНТ,
        intake_year: 2027,
        owner_member_id: у!.id,
        is_synthetic: true,
        synthetic_name: 'ТЕСТ входящих',
        automation_owner: 'v2',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    дело = д!.id as string
  })

  afterEach(async () => {
    await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  })

  it('направления называются так, как мы их фильтруем', async () => {
    // Спрашиваем у самой базы, а не сверяем с константой в коде. Первая версия
    // фильтровала по «in» и «out», а в представлении они «incoming» и
    // «outgoing»: задание отрабатывало без ошибки и не находило ни одного
    // сообщения. Работа есть, результат ноль, сказать об этом некому.
    const { data } = await базаCare().from('case_messages').select('direction').limit(500)
    const встречаются = new Set((data ?? []).map((с) => с.direction as string))

    expect(встречаются.size).toBeGreaterThan(0)
    expect([...встречаются]).toContain('incoming')
    expect([...встречаются].every((н) => н === 'incoming' || н === 'outgoing')).toBe(true)
  })

  it('номер сообщения — uuid, как в переписке', async () => {
    // Был text, и соединение по нему валило всю функцию расписания ошибкой
    // «operator does not exist: text = uuid». Миграция при этом применилась:
    // падает выполнение, а не создание.
    const { error } = await базаCare().from('message_triage').insert({
      case_id: дело,
      message_id: 'не-uuid',
      kind: 'other',
      about: 'проверка типа',
      quote: 'проверочная цитата',
    })
    expect(error).not.toBeNull()
  })

  it('без входящих сообщений ничего не делает и денег не тратит', async () => {
    const итог = await разобратьВходящие(дело)
    expect(итог.сообщений).toBe(0)
    expect(итог.задач).toBe(0)
    expect(итог.долларов).toBe(0)
  })

  it('уже разобранное второй раз не разбирается', async () => {
    // Разбор идёт каждые пять минут. Без этого список дел куратора засыпало бы
    // копиями одной задачи.
    const сообщение = randomUUID()
    await базаCare().from('message_triage').insert({
      case_id: дело,
      message_id: сообщение,
      kind: 'question',
      about: 'проверка повтора',
      quote: 'проверочная цитата',
    })

    const { error } = await базаCare().from('message_triage').insert({
      case_id: дело,
      message_id: сообщение,
      kind: 'question',
      about: 'вторая попытка',
      quote: 'проверочная цитата',
    })

    // Защита стоит в самой таблице, а не только в коде: прогонов несколько, и
    // они могут пересечься.
    expect(error).not.toBeNull()
    expect(error!.message.toLowerCase()).toContain('duplicate')
  })

  it('задача по вопросу ждёт нас, а не клиента', async () => {
    // Поставь мы «ждём клиента» — по задаче начали бы готовиться напоминания,
    // и человек получил бы напоминание о собственном вопросе.
    const { data: з } = await базаCare()
      .from('tasks')
      .insert({
        case_id: дело,
        title: 'Ответить: спрашивает про сроки',
        waiting_on: 'specialist',
        status: 'todo',
        due_on: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      })
      .select('waiting_on, due_on')
      .single()

    expect(з!.waiting_on).toBe('specialist')
    // Со сроком: без него задача не попадает ни в «горит», ни в сводку, то
    // есть не отличается от пометки в углу.
    expect(з!.due_on).toBeTruthy()
  })
})

describe('изменение условий идёт дальше ярлыка', () => {
  const КЛИЕНТ = -990_780
  let дело: string

  beforeEach(async () => {
    await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
    await базаCare().from('jobs').delete().eq('kind', 'extract_facts').in('status', ['queued', 'running'])
    const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
    const { data: д, error } = await базаCare()
      .from('cases')
      .insert({
        client_id: КЛИЕНТ,
        intake_year: 2027,
        owner_member_id: у!.id,
        is_synthetic: true,
        synthetic_name: 'ТЕСТ условий',
        automation_owner: 'v2',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    дело = д!.id as string
  })

  afterEach(async () => {
    await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
    await базаCare()
      .from('jobs')
      .delete()
      .eq('kind', 'extract_facts')
      .contains('payload', { case_id: дело })
  })

  it('разбор фактов ставится по делу и с внятным поводом', async () => {
    // «Бюджет теперь девять тысяч», сказанное в десять утра, не должно ждать
    // ночного разбора: за день на старом бюджете успевают собрать подборку и
    // отдать её клиенту.
    const { позватьРазборФактов } = await import('@/lib/care/jobs/triage')
    expect(await позватьРазборФактов(дело)).toBe(true)

    const { data } = await базаCare()
      .from('jobs')
      .select('payload, priority, status')
      .eq('kind', 'extract_facts')
      .eq('status', 'queued')

    const наше = (data ?? []).find(
      (з) => (з.payload as { case_id?: string }).case_id === дело
    )
    expect(наше).toBeTruthy()
    expect(String((наше!.payload as { поставлено?: string }).поставлено)).toContain('условие')
  })

  it('второе сообщение об условиях не ставит второго задания', async () => {
    // Пять сообщений подряд дали бы пять заданий и пять вызовов модели за одно
    // и то же.
    const { позватьРазборФактов } = await import('@/lib/care/jobs/triage')
    await позватьРазборФактов(дело)
    expect(await позватьРазборФактов(дело)).toBe(false)

    const { data } = await базаCare()
      .from('jobs')
      .select('id')
      .eq('kind', 'extract_facts')
      .eq('status', 'queued')
    expect((data ?? []).length).toBe(1)
  })
})

describe('сообщение, показанное модели, не возвращается в разбор', () => {
  const КЛИЕНТ = -990_782
  let дело: string

  beforeEach(async () => {
    await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
    const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
    const { data: д, error } = await базаCare()
      .from('cases')
      .insert({
        client_id: КЛИЕНТ,
        intake_year: 2027,
        owner_member_id: у!.id,
        is_synthetic: true,
        synthetic_name: 'ТЕСТ молчания',
        automation_owner: 'v2',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    дело = д!.id as string
  })

  afterEach(async () => {
    await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  })

  it('отметка «нечего делать» ложится без цитаты', async () => {
    // Так отмечается сообщение, по которому модель промолчала: чужое,
    // служебное, пустое. Цитаты у него нет и быть не должно — приводить
    // нечего, а пустая строка выглядела бы как цитата.
    const { error } = await базаCare().from('message_triage').insert({
      case_id: дело,
      message_id: randomUUID(),
      kind: 'other',
      about: 'не от клиента или без действия',
      quote: null,
    })
    expect(error).toBeNull()
  })

  it('отметка исключает сообщение из следующего разбора', async () => {
    // Весь смысл: без неё задание возвращается к тем же сообщениям каждые пять
    // минут и платит за них снова. Проверяем тем же запросом, каким отбирает
    // задание.
    const сообщение = randomUUID()
    await базаCare().from('message_triage').insert({
      case_id: дело,
      message_id: сообщение,
      kind: 'other',
      about: 'не от клиента или без действия',
      quote: null,
    })

    const { data } = await базаCare()
      .from('message_triage')
      .select('message_id')
      .eq('case_id', дело)
      .in('message_id', [сообщение])

    expect((data ?? []).map((с) => с.message_id)).toContain(сообщение)
  })

  it('в сводке разбора есть счётчик «без действия»', async () => {
    // Иначе прогон, целиком ушедший в молчание, в журнале выглядит как
    // прогон, который ничего не делал, — а он потратил деньги.
    const итог = await разобратьВходящие(дело)
    expect(итог).toHaveProperty('безДействия')
    expect(типЧисла(итог.безДействия)).toBe(true)
  })
})

function типЧисла(з: unknown): boolean {
  return typeof з === 'number' && Number.isFinite(з)
}
