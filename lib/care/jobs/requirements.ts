/**
 * Проверка требований по строкам подборки — задание очереди.
 *
 * Берёт подборку, идёт по её программам, читает страницы вузов и складывает
 * найденное в `care.program_requirements`: вид требования, значение, цитата,
 * адрес и дата проверки. Затем пересобирает у каждой строки список «что
 * проверить» — ради этого всё и делается.
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНОЕ ЗАДАНИЕ, А НЕ ЧАСТЬ ПОДБОРА. Подбор должен отвечать
 * быстро: куратор нажал и ждёт. Проверка шести вопросов по пяти страницам
 * занимает минуты и стоит дороже. Разделение даёт подборку сразу, а
 * подробности — следом.
 *
 * ПОЧЕМУ ПРОВЕРЕННОЕ ЖИВЁТ ОТДЕЛЬНО ОТ ПОДБОРКИ. Требования относятся к
 * программе, а не к конкретному клиенту: проверив срок подачи для одной
 * подборки, мы знаем его для всех. Повторно платить за то же самое незачем —
 * пока оно не устарело.
 */
import { базаCare } from '../db'
import { проверитьПрограмму, ПОДПИСЬ_ТРЕБОВАНИЯ, type ВидТребования } from '../ai/requirements'
import { можноТратить, записатьРасход } from '../ai/budget'

/** Сколько дней проверенное считается свежим. Меняется строкой в настройках. */
const СВЕЖЕСТЬ_ДНЕЙ_ПО_УМОЛЧАНИЮ = 60

export type ИтогПроверкиТребований = {
  программ: number
  проверено: number
  неНашлось: number
  пропущено: number
  долларов: number
  причины: string[]
}

export async function проверитьТребованияПодборки(
  shortlistId: string
): Promise<ИтогПроверкиТребований> {
  const итог: ИтогПроверкиТребований = {
    программ: 0,
    проверено: 0,
    неНашлось: 0,
    пропущено: 0,
    долларов: 0,
    причины: [],
  }

  const { data: строки } = await базаCare()
    .from('shortlist_items')
    .select('id, program_ref, unresolved')
    .eq('shortlist_id', shortlistId)
    .order('position')

  if (!строки?.length) {
    итог.причины.push('в подборке нет строк')
    return итог
  }

  const { data: настройка } = await базаCare()
    .from('settings')
    .select('value')
    .eq('key', 'requirements_ttl_days')
    .maybeSingle()
  const свежесть = Number(настройка?.value ?? СВЕЖЕСТЬ_ДНЕЙ_ПО_УМОЛЧАНИЮ) || СВЕЖЕСТЬ_ДНЕЙ_ПО_УМОЛЧАНИЮ
  const граница = new Date(Date.now() - свежесть * 86_400_000).toISOString()

  for (const строка of строки) {
    const ref = (строка.program_ref ?? {}) as Record<string, string>
    const ссылка = ref.ссылка
    if (!ссылка) {
      итог.пропущено += 1
      итог.причины.push(`${ref.программа ?? 'программа'}: нет ссылки`)
      continue
    }

    // Уже проверенное и не устаревшее не перепроверяем: требования относятся
    // к программе, а не к клиенту, и платить дважды за одну страницу незачем.
    const { data: было } = await базаCare()
      .from('program_requirements')
      .select('requirement_type, value, excerpt, source_url, status, checked_at')
      .contains('program_ref', { ссылка })
      .gte('checked_at', граница)

    let найденные = было ?? []

    if (!найденные.length) {
      const потолок = await можноТратить('research')
      if (!потолок.можно) {
        итог.причины.push(`остановились: ${потолок.почему}`)
        break
      }

      const подпись = `${ref.вуз ?? ''} — ${ref.программа ?? ''}`.trim()
      const проверка = await проверитьПрограмму(ссылка, подпись)

      if (проверка.расход) {
        await записатьРасход('research', проверка.расход, { пометка: `требования: ${подпись}`.slice(0, 120) })
        итог.долларов += проверка.расход.долларов
      }
      if (проверка.ошибка) {
        итог.причины.push(`${подпись}: ${проверка.ошибка}`)
        continue
      }
      for (const о of проверка.отброшено) итог.причины.push(`${подпись}: отброшено ${о.вид} — ${о.почему}`)

      const строкиДляБазы = проверка.требования.map((т) => ({
        program_ref: { ссылка, вуз: ref.вуз ?? null, программа: ref.программа ?? null },
        requirement_type: т.requirement_type,
        value: т.found ? { текст: т.value } : {},
        source_url: т.found ? т.source_url : ссылка,
        excerpt: т.found ? т.excerpt : null,
        checked_at: new Date().toISOString(),
        // `not_found` — это тоже результат проверки, а не её отсутствие.
        // Разница важна: куратор не пойдёт искать второй раз.
        status: т.found ? 'confirmed' : 'not_found',
      }))

      if (строкиДляБазы.length) {
        const { error } = await базаCare().from('program_requirements').insert(строкиДляБазы)
        if (error) итог.причины.push(`${подпись}: требования не записались — ${error.message}`)
      }

      найденные = строкиДляБазы.map((с) => ({
        requirement_type: с.requirement_type,
        value: с.value,
        excerpt: с.excerpt,
        source_url: с.source_url,
        status: с.status,
        checked_at: с.checked_at,
      }))
    }

    итог.программ += 1
    итог.проверено += найденные.filter((т) => т.status === 'confirmed').length
    итог.неНашлось += найденные.filter((т) => т.status === 'not_found').length

    // Пересобираем «что проверить» по тому, что действительно выяснилось.
    const осталось = найденные
      .filter((т) => т.status !== 'confirmed')
      .map((т) => `${ПОДПИСЬ_ТРЕБОВАНИЯ[т.requirement_type as ВидТребования] ?? т.requirement_type} — на странице не нашлось`)

    const подтверждено = найденные
      .filter((т) => т.status === 'confirmed')
      .map((т) => ({
        вид: ПОДПИСЬ_ТРЕБОВАНИЯ[т.requirement_type as ВидТребования] ?? т.requirement_type,
        значение: (т.value as { текст?: string })?.текст ?? '',
        цитата: т.excerpt,
        источник: т.source_url,
      }))

    await базаCare()
      .from('shortlist_items')
      .update({
        unresolved: осталось,
        fit_notes: {
          ...((строка as { fit_notes?: Record<string, unknown> }).fit_notes ?? {}),
          проверено: подтверждено,
          проверено_когда: new Date().toISOString().slice(0, 10),
        },
      })
      .eq('id', строка.id)
  }

  return итог
}
