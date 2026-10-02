'use server'

/**
 * Вопрос помощнику.
 *
 * Устройство то же, что у прочих операций контура: кто это → можно ли ему
 * сюда → работа → запись в журнал. Разница в одном — здесь ещё и расход:
 * вызов модели стоит денег, и расход, которого не видно, никто не
 * контролирует.
 *
 * Флаг `ai` проверяется отдельно от `ui`. Кабинет можно открыть куратору, не
 * включая ему помощника: смотреть на данные и тратить на них деньги — разные
 * решения.
 *
 * ПОЧЕМУ ОТВЕТ НЕ ЖДУТ. Подбор программ идёт до полутора минут. Всё это время
 * запрос висел открытым, и закрытая вкладка или обновление страницы обрывали
 * его: работа шла, деньги тратились, а куратор видел пустоту и спрашивал
 * заново — второй раз за те же деньги.
 *
 * Теперь вопрос заводится поручением и сразу возвращает его номер, а работа
 * продолжается в `after` — после того, как ответ ушёл в браузер. Панель
 * спрашивает состояние по номеру; переживёт это и обновление, и закрытую
 * вкладку, потому что состояние лежит в базе, а не в соединении.
 */
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { базаCare } from '@/lib/care/db'
import { сессияКонтура } from '@/lib/care/session'
import { флагВключён } from '@/lib/care/flags'
import { делоДоступно, type Участник } from '@/lib/care/access'
import { спросить } from '@/lib/care/ai/assistant'

export type ОтветЭкрану =
  | { ok: true; текст: string; долларов: number; шагов: number }
  | { ok: false; ошибка: string }

export type Запуск =
  | { ok: true; id: string }
  | { ok: false; ошибка: string }

/** Состояние одного разговора: то, что панель показывает и обновляет. */
export type ХодРазговора = {
  id: string
  вопрос: string
  статус: 'идёт' | 'готово' | 'сорвалось'
  шаги: string[]
  ответ: string | null
  долларов: number | null
}

const ПРЕДЕЛ_ВОПРОСА = 2000

/**
 * Задать вопрос. Возвращает номер поручения сразу, не дожидаясь ответа.
 */
export async function начатьВопрос(вопрос: string, caseId: string | null): Promise<Запуск> {
  try {
    const сессия = await сессияКонтура()
    if (!сессия?.участник || !сессия.интерфейсОткрыт) {
      return { ok: false, ошибка: 'Кабинет недоступен' }
    }
    const участник = сессия.участник

    if (!(await флагВключён('ai', { memberId: участник.id }))) {
      return { ok: false, ошибка: 'Помощник вам ещё не включён' }
    }

    const текстВопроса = вопрос.trim()
    if (!текстВопроса) return { ok: false, ошибка: 'Вопрос пустой' }
    if (текстВопроса.length > ПРЕДЕЛ_ВОПРОСА) {
      return { ok: false, ошибка: 'Вопрос длиннее двух тысяч знаков — сократите' }
    }

    // Область приходит с клиента, поэтому проверяется здесь заново. Внутри
    // инструментов она проверится ещё раз — это не дублирование, а два
    // рубежа: здесь отказ виден человеку, там он защищает данные.
    if (caseId && !(await делоДоступно(участник, caseId))) {
      return { ok: false, ошибка: 'Нет доступа к этому делу' }
    }

    // Поручение заводится до вызова модели: если процесс умрёт на середине,
    // должен остаться след, что деньги тратились.
    const [поручение] = await базаCare()
      .from('assignments')
      .insert({
        initiator_member_id: участник.id,
        scope: caseId ? { case_ids: [caseId] } : { все_мои: true },
        prompt: текстВопроса,
        status: 'running',
        progress: [],
      })
      .select('id')
      .throwOnError()
      .then((р) => [(р.data ?? [])[0]])

    const id = поручение.id as string

    // Работа после ответа: браузер получает номер поручения сразу и начинает
    // показывать ход, а модель работает своё время.
    after(async () => {
      await выполнить(id, участник, caseId, текстВопроса)
    })

    return { ok: true, id }
  } catch (e) {
    const текст = e instanceof Error ? e.message : String(e)
    console.error('[care помощник: запуск]', текст)
    return { ok: false, ошибка: текст }
  }
}

/**
 * Сама работа. Идёт вне запроса: её никто не ждёт и некому прервать.
 *
 * Ошибки здесь не всплывают наверх — наверху уже никого нет. Поэтому любая
 * беда записывается в само поручение: иначе оно осталось бы «идёт» навсегда,
 * и панель крутила бы ход работы над мёртвым разговором.
 */
async function выполнить(
  id: string,
  участник: Участник,
  caseId: string | null,
  текстВопроса: string
): Promise<void> {
  try {
    const шаги: string[] = []

    const { можноТратить, записатьРасход } = await import('@/lib/care/ai/budget')

    // Потолок спрашиваем до вызова: помощник — самый дорогой путь в кабинете,
    // и до сих пор он был единственным, который ничем не ограничивался.
    const потолок = await можноТратить('assistant')
    if (!потолок.можно) {
      await базаCare()
        .from('assignments')
        .update({ status: 'failed', answer: `Помощник не отвечает: ${потолок.почему}` })
        .eq('id', id)
      return
    }

    const ответ = await спросить(
      участник,
      caseId ? { все: false, caseId } : { все: true },
      текстВопроса,
      async (шаг) => {
        шаги.push(шаг)
        // Пишем на каждом шаге, а не в конце: весь смысл в том, чтобы это
        // было видно, пока работа идёт.
        await базаCare()
          .from('assignments')
          .update({ progress: шаги.map((ш) => ({ шаг: ш })) })
          .eq('id', id)
      }
    )

    // Расход — в общий журнал, а не только в поручение. В поручении он лежит
    // для истории разговора; потолок и экран расхода читают `care.ai_spend`, и
    // пока записи там не было, самая дорогая часть кабинета была невидимой.
    for (const р of ответ.расходы) {
      await записатьРасход('assistant', р, {
        caseId,
        пометка: `помощник: ${текстВопроса}`.slice(0, 120),
      })
    }

    await базаCare()
      .from('assignments')
      .update({
        status: ответ.отказ ? 'failed' : 'done',
        // Ответ сохраняется вместе со стоимостью. Без него разговор жил только
        // в браузере: обновил страницу — и нет ни вопроса, ни ответа, за
        // который уже заплачено.
        answer: ответ.текст,
        cost_ledger: {
          модель: ответ.расходы[0]?.модель ?? null,
          шагов: ответ.шагов,
          вызовы: ответ.расходы,
          итого_долларов: ответ.итогоДолларов,
        },
      })
      .eq('id', id)

    await базаCare().from('events').insert({
      actor_kind: 'member',
      actor_id: участник.id,
      case_id: caseId,
      action: 'assistant_asked',
      after: { шагов: ответ.шагов, долларов: ответ.итогоДолларов },
      source: { assignment_id: id },
      reason: текстВопроса.slice(0, 200),
    })

    // Помощник умеет собрать подборку, и она ложится в карточку. Без этого
    // куратор читает «подборка собрана», смотрит на ту же страницу и не видит
    // её: серверная часть страницы осталась прежней.
    if (caseId) revalidatePath(`/care/cases/${caseId}`)
    revalidatePath('/care')
  } catch (e) {
    const текст = e instanceof Error ? e.message : String(e)
    console.error('[care помощник: работа]', текст)
    await базаCare()
      .from('assignments')
      .update({ status: 'failed', answer: `Сорвалось: ${текст}` })
      .eq('id', id)
  }
}

function разобрать(з: {
  id: unknown
  prompt: unknown
  answer: unknown
  status: unknown
  progress: unknown
  cost_ledger: unknown
}): ХодРазговора {
  const шаги = Array.isArray(з.progress)
    ? (з.progress as { шаг?: string }[]).map((ш) => String(ш.шаг ?? '')).filter(Boolean)
    : []
  return {
    id: з.id as string,
    вопрос: з.prompt as string,
    статус: з.status === 'done' ? 'готово' : з.status === 'running' ? 'идёт' : 'сорвалось',
    шаги,
    ответ: (з.answer as string | null) ?? null,
    долларов: Number((з.cost_ledger as { итого_долларов?: number } | null)?.итого_долларов ?? 0) || null,
  }
}

/**
 * Состояние названных разговоров.
 *
 * Панель спрашивает это раз в полторы секунды, пока хоть один идёт. Полтора —
 * чтобы шаги появлялись похоже на живые, а не чтобы успеть за моделью: шаг
 * длится секунды, и чаще спрашивать значит греть базу впустую.
 */
export async function ходРазговоров(ids: string[]): Promise<ХодРазговора[]> {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) return []
  if (!ids.length || ids.length > 20) return []

  const { data } = await базаCare()
    .from('assignments')
    .select('id, prompt, answer, status, progress, cost_ledger')
    // Чужие разговоры не отдаём даже по точному номеру: номер мог прийти
    // откуда угодно, а поручение — чужое.
    .eq('initiator_member_id', сессия.участник.id)
    .in('id', ids)

  return (data ?? []).map(разобрать)
}

/**
 * Разговоры, которые ещё идут, — чтобы панель подхватила их после перезагрузки.
 *
 * Берём только свежие. Поручение, висящее «идёт» со вчера, — это не работа, а
 * след от упавшего процесса; показывать его бегущим значит обещать ответ,
 * которого не будет.
 */
export async function незаконченные(caseId: string | null): Promise<ХодРазговора[]> {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) return []

  const свежесть = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data } = await базаCare()
    .from('assignments')
    .select('id, prompt, answer, status, progress, cost_ledger, scope, created_at')
    .eq('initiator_member_id', сессия.участник.id)
    .eq('status', 'running')
    .gte('created_at', свежесть)
    .order('created_at')

  return (data ?? [])
    .filter((з) => {
      const область = (з.scope ?? {}) as { case_ids?: string[]; все_мои?: boolean }
      return caseId ? область.case_ids?.includes(caseId) : область.все_мои === true
    })
    .map(разобрать)
}

export type Реплика = {
  id: string
  вопрос: string
  ответ: string
  долларов: number
  когда: string
}

/**
 * Последние разговоры с помощником — чтобы панель переживала обновление страницы.
 *
 * Берём по области: на карточке дела — разговоры об этом деле, на главной —
 * те, что задавались обо всех. Смешивать нельзя: ответ про одного клиента,
 * всплывший в карточке другого, читается как ошибка в данных.
 */
export async function историяПомощника(caseId: string | null, сколько = 12): Promise<Реплика[]> {
  const сессия = await сессияКонтура()
  if (!сессия?.участник || !сессия.интерфейсОткрыт) return []

  const { data } = await базаCare()
    .from('assignments')
    .select('id, prompt, answer, scope, cost_ledger, created_at, status')
    .eq('initiator_member_id', сессия.участник.id)
    .eq('status', 'done')
    .not('answer', 'is', null)
    .order('created_at', { ascending: false })
    .limit(60)

  const свои = (data ?? []).filter((з) => {
    const область = (з.scope ?? {}) as { case_ids?: string[]; все_мои?: boolean }
    return caseId ? область.case_ids?.includes(caseId) : область.все_мои === true
  })

  return свои
    .slice(0, сколько)
    .reverse()
    .map((з) => ({
      id: з.id as string,
      вопрос: з.prompt as string,
      ответ: (з.answer as string) ?? '',
      долларов: Number((з.cost_ledger as { итого_долларов?: number })?.итого_долларов ?? 0),
      когда: з.created_at as string,
    }))
}
