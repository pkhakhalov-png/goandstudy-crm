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
 */
import { базаCare } from '@/lib/care/db'
import { сессияКонтура } from '@/lib/care/session'
import { флагВключён } from '@/lib/care/flags'
import { делоДоступно } from '@/lib/care/access'
import { спросить } from '@/lib/care/ai/assistant'

export type ОтветЭкрану =
  | { ok: true; текст: string; долларов: number; шагов: number }
  | { ok: false; ошибка: string }

export async function спроситьПомощника(
  вопрос: string,
  caseId: string | null
): Promise<ОтветЭкрану> {
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
    if (текстВопроса.length > 2000) {
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
      })
      .select('id')
      .throwOnError()
      .then((р) => [(р.data ?? [])[0]])

    const ответ = await спросить(
      участник,
      caseId ? { все: false, caseId } : { все: true },
      текстВопроса
    )

    await базаCare()
      .from('assignments')
      .update({
        status: ответ.отказ ? 'failed' : 'done',
        cost_ledger: {
          модель: ответ.расходы[0]?.модель ?? null,
          шагов: ответ.шагов,
          вызовы: ответ.расходы,
          итого_долларов: ответ.итогоДолларов,
        },
      })
      .eq('id', поручение.id)

    await базаCare().from('events').insert({
      actor_kind: 'member',
      actor_id: участник.id,
      case_id: caseId,
      action: 'assistant_asked',
      after: { шагов: ответ.шагов, долларов: ответ.итогоДолларов },
      source: { assignment_id: поручение.id },
      reason: текстВопроса.slice(0, 200),
    })

    return { ok: true, текст: ответ.текст, долларов: ответ.итогоДолларов, шагов: ответ.шагов }
  } catch (e) {
    const текст = e instanceof Error ? e.message : String(e)
    console.error('[care помощник]', текст)
    return { ok: false, ошибка: текст }
  }
}
