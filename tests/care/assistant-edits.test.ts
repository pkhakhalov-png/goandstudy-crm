/**
 * Правка словами из чата: задачи, поля дела, источники ответа из интернета.
 *
 * ЧТО ИМЕННО ПРОВЕРЯЕМ. Не «инструмент работает», а те его места, где ошибка
 * тихо теряет данные или делает не то:
 *
 *   — правка по неоднозначному названию должна отказывать. Закрыть не ту
 *     задачу — значит перестать ждать от клиента то, чего всё ещё ждут, и
 *     узнать об этом в день дедлайна;
 *   — подробности и заметки дописываются, а не заменяются. В них лежит то, о
 *     чём договорились на встрече, и отменить замену нечем;
 *   — ответ из интернета без ссылки на вуз или ведомство не отдаётся: он
 *     выглядит так же уверенно, как ответ со ссылкой, а проверить его нельзя.
 *
 * Инструменты зовём настоящие, против настоящей базы: между схемой и записью
 * стоят права роли и ограничения таблицы, и ломается обычно там.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { инструменты } from '@/lib/care/ai/tools'
import { годныйИсточник } from '@/lib/care/ai/lookup'
import type { Участник } from '@/lib/care/access'

type Инструмент = { name: string; run: (вход: Record<string, unknown>) => Promise<string> }

let участник: Участник
let дело: string
const созданные: string[] = []
let заметкиБыли: string | null = null

function взять(имя: string): Инструмент {
  const найден = (инструменты(участник, { все: true }) as unknown as Инструмент[]).find(
    (и) => и.name === имя
  )
  if (!найден) throw new Error(`нет инструмента ${имя}`)
  return найден
}

async function завести(title: string, ч: Record<string, unknown> = {}) {
  const { data } = await базаCare()
    .from('tasks')
    .insert({ case_id: дело, title, waiting_on: 'client', status: 'waiting', ...ч })
    .select('id')
    .single()
  созданные.push(data!.id as string)
  return data!.id as string
}

beforeAll(async () => {
  const { data: у } = await базаCare()
    .from('members')
    .select('id, user_id, care_role, team_lead_id, active')
    .eq('care_role', 'lead')
    .single()
  участник = у as unknown as Участник

  const { data: д } = await базаCare()
    .from('cases')
    .select('id, notes')
    .eq('is_synthetic', true)
    .limit(1)
    .single()
  дело = д!.id as string
  заметкиБыли = (д!.notes as string | null) ?? null
})

afterAll(async () => {
  // Свои задачи убираем: тест не должен оставлять в деле куратора мусор, по
  // которому потом готовятся напоминания.
  for (const id of созданные) await базаCare().from('tasks').delete().eq('id', id)
  await базаCare().from('cases').update({ notes: заметкиБыли }).eq('id', дело)
})

describe('правка задач словами из чата', () => {
  it('две подходящие задачи — отказ с перечислением, а не выбор наугад', async () => {
    await завести('ТЕСТ перевод диплома в консульство')
    await завести('ТЕСТ перевод аттестата присяжным')

    const ответ = await взять('edit_task').run({ case_id: дело, task: 'ТЕСТ перевод', action: 'закрыть' })

    expect(ответ).toContain('несколько')
    expect(ответ).toContain('show_tasks')
    // И ничего не закрылось: отказ должен быть отказом, а не «закрыл первую».
    const { data } = await базаCare().from('tasks').select('status').in('id', созданные)
    expect((data ?? []).every((з) => з.status === 'waiting')).toBe(true)
  })

  it('закрытие снимает ожидание — иначе напоминание уйдёт о сделанном', async () => {
    const id = await завести('ТЕСТ справка из банка', { due_on: '2026-12-01' })

    const ответ = await взять('edit_task').run({ case_id: дело, task: 'справка из банка', action: 'закрыть' })
    expect(ответ).toContain('Закрыл')
    // Про напоминание сказать обязательно: иначе куратор пойдёт искать, где
    // отменить его руками, и не найдёт.
    expect(ответ.toLowerCase()).toContain('напоминание')

    const { data } = await базаCare().from('tasks').select('status, waiting_on').eq('id', id).single()
    expect(data!.status).toBe('done')
    expect(data!.waiting_on).toBe('none')
  })

  it('срок не в виде ГГГГ-ММ-ДД отвергается, а не записывается как попало', async () => {
    const id = await завести('ТЕСТ рекомендации от руководителя', { due_on: '2026-11-01' })

    const ответ = await взять('edit_task').run({
      case_id: дело,
      task: 'рекомендации от руководителя',
      action: 'срок',
      value: '20 ноября',
    })
    expect(ответ).toContain('непонятен')

    const { data } = await базаCare().from('tasks').select('due_on').eq('id', id).single()
    expect(data!.due_on).toBe('2026-11-01')
  })

  it('подробности дописываются, прежний текст остаётся', async () => {
    const id = await завести('ТЕСТ медицинская страховка', {
      details: 'Договорились на встрече: оформляет сама до подачи.',
    })

    await взять('edit_task').run({
      case_id: дело,
      task: 'медицинская страховка',
      action: 'подробности',
      value: 'нашла вариант за 90 евро в год',
    })

    const { data } = await базаCare().from('tasks').select('details').eq('id', id).single()
    expect(data!.details).toContain('Договорились на встрече')
    expect(data!.details).toContain('90 евро')
  })

  it('снятие срока прямо говорит, что напоминаний больше не будет', async () => {
    const id = await завести('ТЕСТ загранпаспорт', { due_on: '2026-11-15' })

    const ответ = await взять('edit_task').run({
      case_id: дело,
      task: 'загранпаспорт',
      action: 'срок',
      value: 'нет',
    })
    expect(ответ).toContain('Напоминания')

    const { data } = await базаCare().from('tasks').select('due_on').eq('id', id).single()
    expect(data!.due_on).toBeNull()
  })

  it('чужое дело не правится, даже когда его назвали прямо', async () => {
    const ответ = await взять('edit_task').run({
      case_id: '00000000-0000-0000-0000-000000000000',
      task: '1',
      action: 'закрыть',
    })
    expect(ответ).toContain('нет в вашей области')
  })
})

describe('правка самого дела', () => {
  it('заметка дописывается, прежние заметки остаются', async () => {
    const ответ = await взять('edit_case').run({
      case_id: дело,
      field: 'заметка',
      value: 'мама против Германии, при отказе смотрим Нидерланды',
    })
    expect(ответ).toContain('Прежние заметки на месте')

    const { data } = await базаCare().from('cases').select('notes').eq('id', дело).single()
    expect(data!.notes).toContain('мама против Германии')
    if (заметкиБыли) expect(data!.notes).toContain(заметкиБыли.split('\n')[0])
  })

  it('год набора вне разумного отвергается', async () => {
    const ответ = await взять('edit_case').run({ case_id: дело, field: 'год_набора', value: '2077' })
    expect(ответ).toContain('непохож')
  })

  it('смена года набора предупреждает про подборку', async () => {
    // Сроки подачи и требования собирались под прежний год. Промолчать —
    // оставить куратору подборку под другой год с видом действующей.
    const { data: до } = await базаCare().from('cases').select('intake_year').eq('id', дело).single()
    const год = Number(до!.intake_year)
    try {
      const ответ = await взять('edit_case').run({
        case_id: дело,
        field: 'год_набора',
        value: String(год + 1),
      })
      expect(ответ).toContain('перепроверить')
    } finally {
      await базаCare().from('cases').update({ intake_year: год }).eq('id', дело)
    }
  })
})

describe('ответ из интернета опирается на источник', () => {
  it('страницы вузов и ведомств годятся', () => {
    expect(годныйИсточник('https://www.tum.de/en/studies/degree-programs/data-engineering')).toBe(true)
    expect(годныйИсточник('https://www.auswaertiges-amt.de/en/visa-service')).toBe(true)
  })

  it('агрегаторы и поисковая выдача — не источник', () => {
    // На них устаревает молча: страница живёт, а срок на ней прошлогодний.
    expect(годныйИсточник('https://www.mastersportal.com/studies/12345')).toBe(false)
    expect(годныйИсточник('https://www.topuniversities.com/universities/tum')).toBe(false)
    expect(годныйИсточник('https://www.google.com/search?q=tum+deadline')).toBe(false)
  })

  it('не-веб адреса не проходят вовсе', () => {
    expect(годныйИсточник('javascript:alert(1)')).toBe(false)
    expect(годныйИсточник('не ссылка')).toBe(false)
  })
})
