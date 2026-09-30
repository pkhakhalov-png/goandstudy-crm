/**
 * Правило `reminder_document_due`: заметить, что клиент тянет с документом.
 *
 * Работает только по делам с `automation_owner = 'v2'`. Пока дело ведёт
 * старый контур, автоматика нового молчит — иначе клиент получил бы
 * напоминание дважды, от двух систем сразу.
 *
 * ПОЧЕМУ ПОДСТАНОВКА МЕХАНИЧЕСКАЯ, А НЕ МОДЕЛЬЮ. План допускал, что имя,
 * документ и дату в шаблон подставляет модель, а результат проверяется
 * регулярками. Подстановка трёх значений — работа, где модель может только
 * ошибиться: она ничего не решает, но может переписать формулировку, изменить
 * дату или добавить подробность, которой не было. Механическая подстановка
 * бесплатна, повторяема и не выдумывает. Проверка регулярками остаётся —
 * вторым рубежом, а не единственным.
 *
 * Модель понадобится там, где есть что решать: какие факты извлечь из
 * встречи, какие вузы подходят. Здесь решать нечего.
 */
import { createHash } from 'crypto'
import { базаCare } from '../db'
import { версияДанных } from '../gate/outbound'

export type Заготовка = {
  caseId: string
  taskId: string
  клиент: string
  документ: string
  дата: string
  текст: string
  шаблон: string
}

type Настройки = {
  окноДней: number
  повторДней: number
  паузаЧасов: number
  шаблоны: Record<string, { название: string; текст: string; подстановки: string[] }>
}

async function настройки(): Promise<Настройки> {
  const { data } = await базаCare()
    .from('settings')
    .select('key, value')
    .in('key', ['reminder_window_days', 'reminder_repeat_days', 'reminder_pause_hours', 'templates'])

  const м = new Map((data ?? []).map((с) => [с.key as string, с.value]))
  return {
    окноДней: Number(м.get('reminder_window_days') ?? 3),
    повторДней: Number(м.get('reminder_repeat_days') ?? 4),
    паузаЧасов: Number(м.get('reminder_pause_hours') ?? 48),
    шаблоны: (м.get('templates') ?? {}) as Настройки['шаблоны'],
  }
}

/**
 * Подставить значения в шаблон и убедиться, что получилось то, что задумано.
 *
 * Проверок три, и каждая ловит свою беду:
 *   · остался ли плейсхолдер — значит подстановка не сработала и клиент
 *     получил бы «{имя}, напоминаем про {документ}»;
 *   · есть ли дата в тексте — напоминание без срока бессмысленно;
 *   · есть ли имя — обращение без имени звучит как рассылка.
 */
export function подставить(
  шаблон: string,
  значения: { имя: string; документ: string; дата: string }
): { ok: true; текст: string } | { ok: false; почему: string } {
  const текст = шаблон
    .replaceAll('{имя}', значения.имя)
    .replaceAll('{документ}', значения.документ)
    .replaceAll('{дата}', значения.дата)

  const остаток = текст.match(/\{[а-яёa-z_]+\}/i)
  if (остаток) return { ok: false, почему: `в тексте остался незаполненный ${остаток[0]}` }
  if (!текст.includes(значения.дата)) return { ok: false, почему: 'в тексте нет даты' }
  if (!текст.includes(значения.имя)) return { ok: false, почему: 'в тексте нет имени' }

  return { ok: true, текст }
}

/** Дата по-русски: «15 января». Год не пишем — напоминание про ближайшее. */
function датаСловами(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

/**
 * Пройти по делам и подготовить напоминания.
 *
 * Ничего не отправляет: создаёт предложения. Отправка — отдельный шаг после
 * решения куратора, через ворота `lib/care/gate/outbound.ts`.
 */
export async function подготовитьНапоминания(): Promise<{ создано: number; пропущено: number; причины: string[] }> {
  const н = await настройки()
  const сегодня = new Date().toISOString().slice(0, 10)
  const граница = new Date(Date.now() + н.окноДней * 86_400_000).toISOString().slice(0, 10)
  const причины: string[] = []

  // Только дела, переведённые на новый контур.
  const { data: дела } = await базаCare()
    .from('cases')
    .select('id, client_id, is_synthetic')
    .eq('automation_owner', 'v2')
    .eq('status', 'active')

  const идентификаторы = (дела ?? []).map((д) => д.id)
  if (!идентификаторы.length) {
    return { создано: 0, пропущено: 0, причины: ['нет дел с automation_owner = v2'] }
  }

  const [{ data: задачи }, { data: контакты }, { data: предложения }, { data: события }] = await Promise.all([
    базаCare()
      .from('tasks')
      .select('id, case_id, title, due_on, waiting_on, status, updated_at')
      .in('case_id', идентификаторы)
      .eq('waiting_on', 'client')
      .not('status', 'in', '("done","failed")')
      .not('due_on', 'is', null)
      .lte('due_on', граница),
    базаCare().from('contacts').select('case_id, name, tg_chat_id').in('case_id', идентификаторы).eq('kind', 'student'),
    базаCare()
      .from('proposals')
      .select('case_id, payload, created_at, status')
      .in('case_id', идентификаторы)
      .eq('kind', 'reminder'),
    базаCare()
      .from('events')
      .select('case_id, action, created_at')
      .in('case_id', идентификаторы)
      .eq('action', 'answered_manually'),
  ])

  const контактПоДелу = new Map((контакты ?? []).map((к) => [к.case_id as string, к]))
  let создано = 0
  let пропущено = 0

  for (const задача of задачи ?? []) {
    const контакт = контактПоДелу.get(задача.case_id)
    if (!контакт?.name) {
      пропущено += 1
      причины.push(`${задача.case_id}: нет контакта студента`)
      continue
    }

    // Пауза: куратор сам написал клиенту по этому делу недавно. Автомат
    // молчит — два напоминания подряд от разных отправителей читаются как
    // давление, а не как забота.
    const недавно = (события ?? []).some(
      (с) =>
        с.case_id === задача.case_id &&
        Date.now() - new Date(с.created_at).getTime() < н.паузаЧасов * 3_600_000
    )
    if (недавно) {
      пропущено += 1
      причины.push(`${задача.case_id}: куратор отвечал сам за последние ${н.паузаЧасов} ч`)
      continue
    }

    // Не напоминаем чаще, чем раз в reminder_repeat_days по одной задаче.
    const ужеБыло = (предложения ?? []).some((п) => {
      const payload = п.payload as { task_id?: string }
      return (
        payload.task_id === задача.id &&
        Date.now() - new Date(п.created_at).getTime() < н.повторДней * 86_400_000
      )
    })
    if (ужеБыло) {
      пропущено += 1
      continue
    }

    const просрочено = задача.due_on! < сегодня
    const ключШаблона = просрочено ? 'document_overdue' : 'document_due'
    const шаблон = н.шаблоны[ключШаблона]
    if (!шаблон) {
      пропущено += 1
      причины.push(`нет шаблона ${ключШаблона}`)
      continue
    }

    const подстановка = подставить(шаблон.текст, {
      имя: String(контакт.name).split(/\s+/)[0],
      документ: задача.title,
      дата: датаСловами(задача.due_on!),
    })
    if (!подстановка.ok) {
      пропущено += 1
      причины.push(`${задача.case_id}: ${подстановка.почему}`)
      continue
    }

    const payload = {
      task_id: задача.id,
      шаблон: ключШаблона,
      текст: подстановка.текст,
      документ: задача.title,
      срок: задача.due_on,
      просрочено,
    }

    await базаCare().from('proposals').insert({
      case_id: задача.case_id,
      kind: 'reminder',
      payload,
      payload_hash: createHash('sha256').update(подстановка.текст).digest('hex').slice(0, 32),
      data_version: await версияДанных(задача.case_id, задача.id),
      status: 'pending',
    })

    создано += 1
  }

  return { создано, пропущено, причины }
}
