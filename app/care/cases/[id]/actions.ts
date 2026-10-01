'use server'

/**
 * Ручные операции над делом.
 *
 * Общее устройство у всех одинаковое и нарушать его нельзя:
 *
 *   1. кто это           — сессия контура
 *   2. можно ли ему сюда — требуетсяДоступ, который бросает, а не возвращает false
 *   3. что меняем        — одна запись
 *   4. чем объясняем     — строка в журнале, всегда, без исключений
 *
 * Четвёртый шаг не украшение. Дело ведут несколько человек, кураторы
 * меняются, а на вопрос «кто закрыл эту задачу и почему» приходится отвечать
 * через месяцы. Операция без записи в журнал — это изменение, которое никому
 * не объяснить.
 *
 * Возвращают `{ ok }` вместо исключения наружу: форма должна показать причину,
 * а не белый экран. Исключение остаётся внутри и попадает в журнал сервера.
 */
import { revalidatePath } from 'next/cache'
import { базаCare } from '@/lib/care/db'
import { требуетсяДоступ } from '@/lib/care/access'
import { сессияКонтура } from '@/lib/care/session'
import { разобратьЗначение } from '@/lib/care/facts'

type Итог = { ok: true } | { ok: false; ошибка: string }

/** Общее начало всех операций: кто и можно ли ему. */
async function подготовить(caseId: string) {
  const сессия = await сессияКонтура()
  if (!сессия?.интерфейсОткрыт) throw new Error('Кабинет недоступен')
  const участник = await требуетсяДоступ(сессия.участник, caseId)
  return { участник, база: базаCare() }
}

async function записатьВЖурнал(
  caseId: string,
  участникId: string,
  действие: string,
  было: unknown,
  стало: unknown,
  причина?: string | null
) {
  await базаCare()
    .from('events')
    .insert({
      actor_kind: 'member',
      actor_id: участникId,
      case_id: caseId,
      action: действие,
      before: было ?? null,
      after: стало ?? null,
      source: { ui: 'app/care/cases/[id]' },
      reason: причина ?? null,
    })
}

function обработать(e: unknown): Итог {
  const текст = e instanceof Error ? e.message : String(e)
  console.error('[care операция]', текст)
  return { ok: false, ошибка: текст }
}

// ── Задачи ───────────────────────────────────────────────────────────────────

export async function создатьЗадачу(caseId: string, данные: FormData): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const название = String(данные.get('title') ?? '').trim()
    if (!название) return { ok: false, ошибка: 'Название задачи пустое' }

    const срок = String(данные.get('due_on') ?? '').trim() || null
    const ждём = String(данные.get('waiting_on') ?? 'none')

    const { data, error } = await база
      .from('tasks')
      .insert({
        case_id: caseId,
        title: название,
        due_on: срок,
        waiting_on: ждём,
        // Задача без исполнителя — задача ничья. По умолчанию берёт тот, кто
        // её завёл: так у неё сразу есть хозяин, а переназначить можно потом.
        assignee_member_id: участник.id,
        status: ждём === 'none' ? 'todo' : 'waiting',
      })
      .select('id, title')
      .single()

    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'task_created', null, data)
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

export async function изменитьСтатусЗадачи(
  caseId: string,
  taskId: string,
  статус: string
): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    // Читаем «до» ради журнала: запись «статус изменён» без прежнего значения
    // отвечает на вопрос «что стало», но не на «что было».
    const { data: было } = await база
      .from('tasks')
      .select('id, status, waiting_on')
      .eq('id', taskId)
      .eq('case_id', caseId)
      .maybeSingle()

    if (!было) return { ok: false, ошибка: 'Задача не найдена в этом деле' }

    const закрыта = статус === 'done' || статус === 'failed'
    const { error } = await база
      .from('tasks')
      .update({
        status: статус,
        closed_at: закрыта ? new Date().toISOString() : null,
        // Закрытая задача никого не ждёт. Иначе она останется висеть в
        // счётчиках ожидания и будет врать про загрузку куратора.
        waiting_on: закрыта ? 'none' : было.waiting_on,
      })
      .eq('id', taskId)
      .eq('case_id', caseId)

    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'task_status_changed', было, { id: taskId, status: статус })
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Кого ждём по задаче и до какого числа.
 *
 * ПОЧЕМУ ЭТА ОПЕРАЦИЯ ВАЖНЕЕ, ЧЕМ ВЫГЛЯДИТ. Правило напоминаний ищет задачи с
 * `waiting_on = 'client'` и сроком — больше ни по какому признаку оно клиента
 * не трогает. Перенос из старой CRM такой пометки не принёс, потому что там
 * этого различия нет: все 73 задачи приехали с `none`, `specialist`,
 * `university` или `review`. Пока сменить пометку было нельзя, напоминания на
 * настоящих делах не могли появиться в принципе — а выглядело бы это как
 * «автоматика не работает».
 *
 * Срок меняется здесь же и не случайно: напоминание без срока правило не
 * создаёт, а подстановка в шаблон без даты не проходит проверку. Просить
 * человека заполнить две вещи в двух местах — способ получить половину.
 *
 * Пустое поле даты оставляет прежний срок. Стереть срок случайно должно быть
 * труднее, чем поставить: пустое поле — это «не трогай», а не «убери».
 */
const ОЖИДАНИЯ = ['none', 'client', 'university', 'specialist', 'review'] as const

export async function изменитьОжидание(
  caseId: string,
  taskId: string,
  данные: FormData
): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const ждём = String(данные.get('waiting_on') ?? '')
    if (!(ОЖИДАНИЯ as readonly string[]).includes(ждём)) {
      return { ok: false, ошибка: 'Непонятно, кого ждём' }
    }
    const срок = String(данные.get('due_on') ?? '').trim()

    const { data: было } = await база
      .from('tasks')
      .select('id, status, waiting_on, due_on')
      .eq('id', taskId)
      .eq('case_id', caseId)
      .maybeSingle()

    if (!было) return { ok: false, ошибка: 'Задача не найдена в этом деле' }
    if (было.status === 'done' || было.status === 'failed') {
      return { ok: false, ошибка: 'Закрытая задача никого не ждёт — сначала верните её в работу' }
    }

    const { error } = await база
      .from('tasks')
      .update({
        waiting_on: ждём,
        // Статус идёт за ожиданием: «ждём кого-то» — это `waiting`, иначе
        // задача висела бы в работе, ничего не делая. Обратно — в `todo`, а не
        // в `in_progress`: продолжил ли человек работу, знает только он.
        status: ждём === 'none' ? (было.status === 'waiting' ? 'todo' : было.status) : 'waiting',
        ...(срок ? { due_on: срок } : {}),
      })
      .eq('id', taskId)
      .eq('case_id', caseId)

    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'task_waiting_changed', было, {
      id: taskId,
      waiting_on: ждём,
      due_on: срок || было.due_on,
    })
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

// ── Факты ────────────────────────────────────────────────────────────────────

/**
 * Подтвердить черновик факта.
 *
 * Принятый факт становится текущим, а прежний текущий по тому же полю
 * уходит в `superseded`. Порядок именно такой: сначала снимаем старый, потом
 * ставим новый. В базе на `(case_id, field)` для подтверждённых стоит
 * уникальный индекс, и обратный порядок упёрся бы в него.
 */
export async function подтвердитьФакт(caseId: string, factId: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { data: факт } = await база
      .from('facts')
      .select('id, field, value, status')
      .eq('id', factId)
      .eq('case_id', caseId)
      .maybeSingle()

    if (!факт) return { ok: false, ошибка: 'Факт не найден в этом деле' }
    if (факт.status !== 'draft') return { ok: false, ошибка: `Подтвердить можно только черновик, а этот — «${факт.status}»` }

    const { data: прежний } = await база
      .from('facts')
      .select('id')
      .eq('case_id', caseId)
      .eq('field', факт.field)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (прежний) {
      const { error } = await база.from('facts').update({ status: 'superseded' }).eq('id', прежний.id)
      if (error) return { ok: false, ошибка: `не удалось снять прежний факт: ${error.message}` }
    }

    const { error } = await база
      .from('facts')
      .update({
        status: 'confirmed',
        confirmed_by: участник.id,
        confirmed_at: new Date().toISOString(),
        supersedes: прежний?.id ?? null,
      })
      .eq('id', factId)

    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'fact_confirmed', прежний ?? null, факт)
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Вписать свой вариант вместо предложенного моделью.
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ОПЕРАЦИЯ, А НЕ «ОТКЛОНИТЬ И ЗАВЕСТИ ЗАНОВО». Отклонение
 * без своего варианта — тупик: модель ошиблась, куратор это знает, а поле
 * осталось пустым. Правильное значение у человека в голове уже есть, и просить
 * его завести факт заново другим путём значит терять его ровно там, где он
 * готов был его отдать.
 *
 * Модельный черновик при этом не исчезает: он уходит в `rejected` с причиной
 * «куратор вписал свой вариант» и остаётся в истории. Через полгода на вопрос
 * «откуда взялось это значение» ответ должен быть «его вписал такой-то», а не
 * «оно просто такое».
 *
 * Свой вариант — не из разговора, поэтому цитаты у него нет и не должно быть.
 * Говорящий — `curator`: это и есть источник.
 */
export async function исправитьФакт(
  caseId: string,
  factId: string,
  данные: FormData
): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const введено = String(данные.get('value') ?? '')
    const введенаВалюта = String(данные.get('currency') ?? '')

    const { data: черновик } = await база
      .from('facts')
      .select('id, field, value, currency, unit, period, is_plan, status')
      .eq('id', factId)
      .eq('case_id', caseId)
      .maybeSingle()

    if (!черновик) return { ok: false, ошибка: 'Факт не найден в этом деле' }
    if (черновик.status !== 'draft') {
      return { ok: false, ошибка: `Исправить можно только черновик, а этот — «${черновик.status}»` }
    }

    const разбор = разобратьЗначение(черновик.field, введено, введенаВалюта)
    if (!разбор.ok) return { ok: false, ошибка: разбор.почему }

    const { data: прежний } = await база
      .from('facts')
      .select('id')
      .eq('case_id', caseId)
      .eq('field', черновик.field)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (прежний) {
      const { error } = await база.from('facts').update({ status: 'superseded' }).eq('id', прежний.id)
      if (error) return { ok: false, ошибка: `не удалось снять прежний факт: ${error.message}` }
    }

    const { data: новый, error } = await база
      .from('facts')
      .insert({
        case_id: caseId,
        field: черновик.field,
        value: разбор.значение,
        currency: разбор.валюта,
        unit: черновик.unit,
        period: черновик.period,
        // Намерение или результат решает не куратор в этой форме: если модель
        // опознала «буду сдавать», а куратор правит саму цифру, признак
        // остаётся прежним.
        is_plan: черновик.is_plan,
        speaker: 'curator',
        status: 'confirmed',
        confirmed_by: участник.id,
        confirmed_at: new Date().toISOString(),
        supersedes: прежний?.id ?? null,
      })
      .select('id, field, value, currency')
      .single()

    if (error) return { ok: false, ошибка: error.message }

    const { error: ошибкаЧерновика } = await база
      .from('facts')
      .update({ status: 'rejected', reject_reason: 'куратор вписал свой вариант' })
      .eq('id', factId)
    if (ошибкаЧерновика) return { ok: false, ошибка: ошибкаЧерновика.message }

    await записатьВЖурнал(caseId, участник.id, 'fact_corrected', черновик, новый, 'куратор вписал свой вариант')
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

export async function отклонитьФакт(caseId: string, factId: string, причина: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)
    if (!причина.trim()) return { ok: false, ошибка: 'Нужна причина отклонения' }

    const { data: было } = await база
      .from('facts')
      .select('id, field, value, status')
      .eq('id', factId)
      .eq('case_id', caseId)
      .maybeSingle()
    if (!было) return { ok: false, ошибка: 'Факт не найден в этом деле' }

    const { error } = await база
      .from('facts')
      .update({ status: 'rejected', reject_reason: причина.trim() })
      .eq('id', factId)
    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'fact_rejected', было, null, причина.trim())
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Снять с факта пометку «намерение»: клиент определился.
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ОПЕРАЦИЯ. «Хотелось бы во Франции» и «едем во Францию»
 * — разные вещи, и разбор переписки правильно помечает первое намерением.
 * Но когда клиент решил, кто-то должен это записать: иначе факт остаётся
 * подтверждённым намерением навсегда, а подбор по нему не работает и работать
 * не должен.
 *
 * Обратной кнопки нет намеренно: пометить решение обратно намерением — это
 * уже не уточнение, а смена сведений, и для неё есть «Исправить».
 */
export async function этоРешение(caseId: string, factId: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { data: было } = await база
      .from('facts')
      .select('id, field, value, is_plan, status')
      .eq('id', factId)
      .eq('case_id', caseId)
      .maybeSingle()

    if (!было) return { ok: false, ошибка: 'Факт не найден в этом деле' }
    if (!было.is_plan) return { ok: false, ошибка: 'Этот факт и так не помечен намерением' }

    const { error } = await база.from('facts').update({ is_plan: false }).eq('id', factId)
    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'fact_became_decision', было, {
      id: factId,
      field: было.field,
      value: было.value,
    })
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

// ── Подборка и стратегия ─────────────────────────────────────────────────────

/**
 * Собрать подборку программ по делу.
 *
 * Долгая операция: поиск ходит по сайтам вузов и читает страницы. Куратор
 * нажимает и ждёт — это честнее, чем вернуть «поставлено в очередь» и оставить
 * его гадать, случилось ли что-нибудь.
 *
 * Расход пишется внутри задания. Здесь остаётся только журнал: через месяц на
 * вопрос «откуда взялась эта подборка» должен быть ответ.
 */
export async function собратьПодборкуДела(caseId: string): Promise<Итог> {
  try {
    const { участник } = await подготовить(caseId)
    const { собратьПодборку } = await import('@/lib/care/jobs/shortlist')

    const итог = await собратьПодборку(caseId)

    await записатьВЖурнал(
      caseId,
      участник.id,
      'shortlist_requested',
      null,
      { программ: итог.программ, откуда: итог.откуда, долларов: итог.долларов },
      итог.причины.join('; ') || null
    )
    revalidatePath(`/care/cases/${caseId}`)

    if (!итог.программ) {
      // Пустая подборка — не сбой, а ответ. Причины показываем словами: без
      // них куратор нажмёт ту же кнопку ещё раз и получит то же самое.
      return { ok: false, ошибка: итог.причины.join('; ') || 'ничего не нашлось' }
    }
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Написать стратегию поступления.
 *
 * Ложится черновиком в предложения: стратегия — обещание клиенту от лица
 * компании, и подписывает его куратор, а не помощник.
 */
export async function написатьСтратегиюДела(caseId: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)
    const { написатьСтратегию } = await import('@/lib/care/ai/strategy')
    const { можноТратить, записатьРасход } = await import('@/lib/care/ai/budget')
    const { подписьПоля, подписьЗначения, подписьОжидания, подписьСтатуса } = await import('@/lib/care/labels')
    const { имяКлиентаДела } = await import('@/lib/care/jobs/shortlist')

    const потолок = await можноТратить('review')
    if (!потолок.можно) return { ok: false, ошибка: потолок.почему }

    const [{ data: факты }, { data: задачи }, { data: подборки }] = await Promise.all([
      база.from('facts').select('field, value, currency, is_plan').eq('case_id', caseId).eq('status', 'confirmed'),
      база.from('tasks').select('title, due_on, waiting_on, status').eq('case_id', caseId).not('status', 'in', '("done","failed")'),
      база.from('shortlists').select('id').eq('case_id', caseId).order('version', { ascending: false }).limit(1),
    ])

    let подборка: { вуз: string; программа: string; страна: string; стоимость: string; ссылка: string }[] = []
    if ((подборки ?? [])[0]) {
      const { data: строки } = await база
        .from('shortlist_items')
        .select('program_ref, tuition_amount, currency')
        .eq('shortlist_id', подборки![0].id)
        .order('position')
      подборка = (строки ?? []).map((с) => {
        const ref = с.program_ref as Record<string, string>
        return {
          вуз: ref.вуз ?? '',
          программа: ref.программа ?? '',
          страна: ref.страна ?? '',
          стоимость: с.tuition_amount ? `${с.tuition_amount} ${с.currency ?? ''}`.trim() : 'не указана',
          ссылка: ref.ссылка ?? '',
        }
      })
    }

    const итог = await написатьСтратегию({
      клиент: await имяКлиентаДела(caseId),
      факты: (факты ?? []).map((ф) => ({
        поле: подписьПоля(ф.field as string),
        значение: `${подписьЗначения(ф.field as string, ф.value)}${ф.currency ? ` ${ф.currency}` : ''}`,
        намерение: ф.is_plan as boolean,
      })),
      задачи: (задачи ?? []).map((з) => ({
        название: з.title as string,
        срок: (з.due_on as string | null) ?? null,
        ждём: подписьОжидания(з.waiting_on as string),
        статус: подписьСтатуса(з.status as string),
      })),
      подборка,
      изПереписки: [],
    })

    if (итог.расход) await записатьРасход('review', итог.расход, { caseId, пометка: 'стратегия поступления' })
    if (итог.ошибка || !итог.текст) return { ok: false, ошибка: итог.ошибка ?? 'помощник не написал стратегию' }

    await база.from('proposals').insert({
      case_id: caseId,
      kind: 'other',
      payload: { вид: 'strategy', текст: итог.текст },
      payload_hash: String(итог.текст.length),
      data_version: new Date().toISOString().slice(0, 10),
      status: 'pending',
    })

    await записатьВЖурнал(caseId, участник.id, 'strategy_written', null, { знаков: итог.текст.length }, null)
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Проверить требования программ подборки на сайтах вузов.
 *
 * Отдельная кнопка, а не часть подбора: подбор должен отвечать быстро, а
 * чтение шести вопросов по пяти страницам занимает минуты и стоит дороже.
 * Куратор решает, по каким подборкам это стоит делать.
 */
export async function проверитьТребованияДела(caseId: string, shortlistId: string): Promise<Итог> {
  try {
    const { участник } = await подготовить(caseId)
    const { проверитьТребованияПодборки } = await import('@/lib/care/jobs/requirements')

    const итог = await проверитьТребованияПодборки(shortlistId)

    await записатьВЖурнал(caseId, участник.id, 'requirements_checked', null, {
      программ: итог.программ,
      проверено: итог.проверено,
      не_нашлось: итог.неНашлось,
      долларов: итог.долларов,
    })
    revalidatePath(`/care/cases/${caseId}`)

    if (!итог.программ) {
      return { ok: false, ошибка: итог.причины.join('; ') || 'проверять нечего' }
    }
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Принять подборку и собрать страницу для клиента.
 *
 * ПОЧЕМУ ЭТО ОДНА ОПЕРАЦИЯ, А НЕ ДВЕ. «Принять» и «опубликовать» различались бы
 * только в голове у того, кто писал код: куратор принимает подборку ровно
 * затем, чтобы показать её клиенту. Два шага означали бы принятые подборки,
 * которые никто не показал, и вопрос «а почему он её не отправил».
 *
 * Вступление пишет помощник, но названия, цены и ссылки в страницу
 * подставляются из строк подборки механически. Модель не должна иметь
 * возможности назвать программу, которой нет: проверять это будет клиент.
 */
export async function опубликоватьПодборку(caseId: string, shortlistId: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)
    const { новыйТокен } = await import('@/lib/care/share')
    const { написатьВступление } = await import('@/lib/care/ai/intro')
    const { можноТратить, записатьРасход } = await import('@/lib/care/ai/budget')

    const { data: подборка } = await база
      .from('shortlists')
      .select('id, case_id, status, share_token')
      .eq('id', shortlistId)
      .eq('case_id', caseId)
      .maybeSingle()
    if (!подборка) return { ok: false, ошибка: 'Подборка не найдена в этом деле' }

    const { data: строки } = await база
      .from('shortlist_items')
      .select('program_ref, tuition_amount, currency, unresolved')
      .eq('shortlist_id', shortlistId)
      .order('position')
    if (!(строки ?? []).length) return { ok: false, ошибка: 'В подборке нет ни одной программы' }

    // Вступление необязательно: без модели страница остаётся полезной, а
    // список вузов — тем же самым. Падать из-за украшения было бы неверно.
    let вступление: string | null = null
    const потолок = await можноТратить('review')
    if (потолок.можно) {
      const итог = await написатьВступление(
        (строки ?? []).map((с) => {
          const ref = (с.program_ref ?? {}) as Record<string, string>
          return {
            вуз: ref.вуз ?? '',
            программа: ref.программа ?? '',
            страна: ref.страна ?? '',
            стоимость: с.tuition_amount ? `${с.tuition_amount} ${с.currency ?? ''}`.trim() : null,
            проверить: (с.unresolved ?? []) as string[],
          }
        })
      )
      if (итог.расход) await записатьРасход('review', итог.расход, { caseId, пометка: 'вступление к подборке' })
      вступление = итог.текст || null
    }

    // Прежний секрет сохраняем: у клиента ссылка уже может быть на руках, и
    // новая при каждой правке означала бы, что он однажды откроет мёртвую.
    const токен = (подборка.share_token as string | null) ?? новыйТокен()

    const { error } = await база
      .from('shortlists')
      .update({
        status: 'published',
        reviewed_by: участник.id,
        reviewed_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        share_token: токен,
        intro: вступление,
      })
      .eq('id', shortlistId)
    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'shortlist_published', null, {
      shortlist_id: shortlistId,
      программ: (строки ?? []).length,
    })
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Отозвать ссылку.
 *
 * Нужно ровно тогда, когда ссылка ушла не туда или подборка устарела
 * настолько, что показывать её нельзя. Следующий запрос по старому адресу
 * получает «ссылка не действует» — и это честнее, чем оставить страницу жить.
 */
export async function отозватьСсылку(caseId: string, shortlistId: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { error } = await база
      .from('shortlists')
      .update({ share_token: null, status: 'curator_review', published_at: null })
      .eq('id', shortlistId)
      .eq('case_id', caseId)
    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'shortlist_unpublished', null, { shortlist_id: shortlistId })
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

// ── Правка подборки ──────────────────────────────────────────────────────────

/**
 * Убрать программу из подборки.
 *
 * Не удаление: строка остаётся в деле со статусом `removed` и причиной. Через
 * месяц возникает вопрос «а почему мы не рассматривали Мюнхен», и ответ
 * «убрали тогда-то, дорого» лучше, чем отсутствие строки.
 */
export async function убратьПрограмму(caseId: string, itemId: string, причина: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { data: строка } = await база
      .from('shortlist_items')
      .select('id, shortlist_id, program_ref')
      .eq('id', itemId)
      .maybeSingle()
    if (!строка) return { ok: false, ошибка: 'Программа не найдена' }

    const { error } = await база
      .from('shortlist_items')
      .update({ status: 'removed', removed_reason: причина.trim() || null })
      .eq('id', itemId)
    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'shortlist_item_removed', строка.program_ref, null, причина.trim() || null)
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/** Вернуть убранную программу обратно в подборку. */
export async function вернутьПрограмму(caseId: string, itemId: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { error } = await база
      .from('shortlist_items')
      .update({ status: 'active', removed_reason: null })
      .eq('id', itemId)
    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(caseId, участник.id, 'shortlist_item_restored', null, { id: itemId })
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Переставить программу выше или ниже.
 *
 * Порядок — это высказывание: список, который начинается с четвёртого по
 * важности варианта, читается как «нам всё равно». Клиент увидит его в том же
 * порядке, в каком его оставил куратор.
 */
export async function переставитьПрограмму(
  caseId: string,
  itemId: string,
  куда: 'вверх' | 'вниз'
): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { data: строка } = await база
      .from('shortlist_items')
      .select('id, shortlist_id, position')
      .eq('id', itemId)
      .maybeSingle()
    if (!строка) return { ok: false, ошибка: 'Программа не найдена' }

    // Соседа ищем среди непрокинутых: переставлять через убранную строку
    // значит сделать «вверх» без видимого следствия.
    const { data: соседи } = await база
      .from('shortlist_items')
      .select('id, position')
      .eq('shortlist_id', строка.shortlist_id)
      .neq('status', 'removed')
      .order('position')

    const список = соседи ?? []
    const где = список.findIndex((с) => с.id === itemId)
    const сосед = куда === 'вверх' ? список[где - 1] : список[где + 1]
    if (!сосед) return { ok: true } // край списка — не ошибка, просто некуда

    await база.from('shortlist_items').update({ position: сосед.position }).eq('id', строка.id)
    await база.from('shortlist_items').update({ position: строка.position }).eq('id', сосед.id)

    await записатьВЖурнал(caseId, участник.id, 'shortlist_reordered', null, { id: itemId, куда })
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

/**
 * Отметить, что клиент выбрал эту программу.
 *
 * Сейчас отмечает куратор со слов клиента. Когда появится кабинет клиента,
 * отмечать будет он сам — поле то же, переносить ничего не придётся.
 */
export async function клиентВыбрал(caseId: string, itemId: string): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { data: строка } = await база
      .from('shortlist_items')
      .select('id, status, program_ref')
      .eq('id', itemId)
      .maybeSingle()
    if (!строка) return { ok: false, ошибка: 'Программа не найдена' }

    const новый = строка.status === 'chosen' ? 'active' : 'chosen'
    const { error } = await база.from('shortlist_items').update({ status: новый }).eq('id', itemId)
    if (error) return { ok: false, ошибка: error.message }

    await записатьВЖурнал(
      caseId,
      участник.id,
      новый === 'chosen' ? 'shortlist_item_chosen' : 'shortlist_item_unchosen',
      null,
      строка.program_ref
    )
    revalidatePath(`/care/cases/${caseId}`)
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}

// ── Передача дела ────────────────────────────────────────────────────────────

/**
 * Передать дело другому куратору.
 *
 * Вместе с владельцем закрываются прежние приглашения: человек, позванный
 * помочь прошлому куратору, не должен автоматически оставаться при новом.
 * Нужен — позовут заново, и это будет видно в журнале.
 */
export async function передатьДело(
  caseId: string,
  новыйУчастникId: string,
  причина: string
): Promise<Итог> {
  try {
    const { участник, база } = await подготовить(caseId)

    const { data: принимающий } = await база
      .from('members')
      .select('id, active')
      .eq('id', новыйУчастникId)
      .maybeSingle()

    if (!принимающий) return { ok: false, ошибка: 'Такого сотрудника в контуре нет' }
    if (!принимающий.active) return { ok: false, ошибка: 'Сотрудник отключён — передавать ему нельзя' }

    const { data: было } = await база
      .from('cases')
      .select('id, owner_member_id')
      .eq('id', caseId)
      .maybeSingle()

    const { error } = await база
      .from('cases')
      .update({ owner_member_id: новыйУчастникId })
      .eq('id', caseId)
    if (error) return { ok: false, ошибка: error.message }

    const сейчас = new Date().toISOString()
    await база
      .from('case_members')
      .update({ valid_to: сейчас })
      .eq('case_id', caseId)
      .is('valid_to', null)

    await записатьВЖурнал(
      caseId,
      участник.id,
      'case_transferred',
      было,
      { owner_member_id: новыйУчастникId },
      причина.trim() || null
    )
    revalidatePath(`/care/cases/${caseId}`)
    revalidatePath('/care/cases')
    return { ok: true }
  } catch (e) {
    return обработать(e)
  }
}
