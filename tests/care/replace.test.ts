/**
 * «Найти замену»: подборка собрана при одном бюджете, бюджет стал другим.
 *
 * ЧТО ИМЕННО ЗАЩИЩАЕМ. Не то, что замена работает, а то, что она не уносит
 * лишнего:
 *
 *   — выбранное клиентом не трогается никогда. Отменить чужой выбор может
 *     только человек, который с этим клиентом разговаривает;
 *   — то, что всё ещё подходит, остаётся вместе с порядком: в нём работа
 *     куратора, а не случайность;
 *   — строка без цены не выбрасывается. У немецких государственных её часто
 *     просто нет, и «не знаем» — не то же самое, что «дорого»;
 *   — разные валюты не сравниваются. Курс мы не знаем и выдумывать не станем.
 *
 * Снимок основания проверяем отдельно: если расхождение померещится там, где
 * его нет, куратор перестанет верить предупреждению — и пропустит настоящее.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { состояниеОснования, найтиЗамену, чтоНеПодходит } from '@/lib/care/replace'
import { основаниеПодбора } from '@/lib/care/jobs/shortlist'

let дело: string
let подборка: string
const фактыСвои: string[] = []

async function фактом(field: string, value: unknown, currency: string | null = null) {
  const { data, error } = await базаCare()
    .from('facts')
    .insert({ case_id: дело, field, value, currency, status: 'confirmed', is_plan: false })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  фактыСвои.push(data!.id as string)
  return data!.id as string
}

async function строкой(
  вуз: string,
  цена: number | null,
  валюта: string | null,
  страна: string,
  status = 'active'
) {
  const { data, error } = await базаCare()
    .from('shortlist_items')
    .insert({
      shortlist_id: подборка,
      program_ref: { вуз, программа: 'тест', страна, ссылка: 'https://example.org/p' },
      tuition_amount: цена,
      currency: валюта,
      status,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data!.id as string
}

/**
 * Номер клиента свой и постоянный: по нему убирается и то, что осталось от
 * прерванного прогона. Без этой уборки весь файл краснеет от первого же
 * убитого по таймауту запуска — дело остаётся в базе, и вставка натыкается на
 * «такой набор у клиента уже есть». Проверка, падающая от прошлого запуска,
 * ничего не проверяет.
 */
const КЛИЕНТ = -990_777

beforeEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)

  // Своё дело, а не демонстрационное: тест меняет факты и выбрасывает
  // программы, и делать это в деле, которое смотрит куратор, нельзя.
  const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
  const { data: д, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      intake_term: 'fall',
      owner_member_id: у!.id,
      is_synthetic: true,
      synthetic_name: 'ТЕСТ замены',
      automation_owner: 'v2',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  дело = д!.id as string

  const { data: п } = await базаCare()
    .from('shortlists')
    .insert({
      case_id: дело,
      version: 1,
      status: 'curator_review',
      basis: { страна: 'Германия', направление: 'анализ данных', уровень: 'магистратура', бюджет: 12000, валюта: 'EUR' },
    })
    .select('id')
    .single()
  подборка = п!.id as string

  await фактом('country.target', 'Германия')
  await фактом('program.field', 'анализ данных')
  await фактом('education.level_target', 'магистратура')
})

afterEach(async () => {
  фактыСвои.splice(0)
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
})

describe('расхождение основания', () => {
  it('пока решения те же — молчит', async () => {
    await фактом('budget.tuition.max', 12000, 'EUR')
    const с = await состояниеОснования(дело)
    expect(с.расхождения).toEqual([])
  })

  it('снизившийся бюджет назван словами: было и стало', async () => {
    await фактом('budget.tuition.max', 9000, 'EUR')
    const с = await состояниеОснования(дело)

    expect(с.расхождения).toHaveLength(1)
    expect(с.расхождения[0].поле).toBe('бюджет на обучение')
    // Без «было → стало» предупреждение бесполезно: непонятно, что
    // перепроверять.
    expect(с.расхождения[0].было).toContain('12000')
    expect(с.расхождения[0].стало).toContain('9000')
  })

  it('стёртый факт не считается сменой решения', async () => {
    // Бюджет не записан вовсе — это не «клиент передумал», а дырка в карточке.
    // Звать на замену по ней нельзя: подбирать было бы не по чему.
    const с = await состояниеОснования(дело)
    expect(с.расхождения.find((р) => р.поле === 'бюджет на обучение')).toBeUndefined()
  })

  it('подборка без снимка не объявляется устаревшей', async () => {
    // Собранные до появления снимка сравнивать не с чем, и «основание
    // изменилось» без «на что» хуже молчания.
    await базаCare().from('shortlists').update({ basis: {} }).eq('id', подборка)
    await фактом('budget.tuition.max', 9000, 'EUR')

    const с = await состояниеОснования(дело)
    expect(с.расхождения).toEqual([])
  })
})

describe('замена под новое основание', () => {
  // Правила отбора проверяются `чтоНеПодходит` — счётом, без поиска замены.
  // Раньше каждая такая проверка три минуты ходила в веб и платила за него
  // ради проверки арифметики, а однажды сорвалась по таймауту. Поиск замены
  // проверяется отдельно и один раз, ниже.
  it('дорогое не подходит, подходящее остаётся, выбор клиента не трогается', async () => {
    const дорогая = await строкой('Дорогой вуз', 20000, 'EUR', 'Германия')
    await строкой('Подходящий вуз', 8000, 'EUR', 'Германия')
    await строкой('Выбранный вуз', 25000, 'EUR', 'Германия', 'chosen')
    await фактом('budget.tuition.max', 9000, 'EUR')

    const негодные = await чтоНеПодходит(подборка, await основаниеПодбора(дело))

    // Выбранное клиентом дороже нового бюджета — и всё равно не в списке:
    // этот разговор ведёт человек, а не код.
    expect(негодные.map((н) => н.id)).toEqual([дорогая])
    expect(негодные[0].почему).toContain('бюджет')
  })

  it('строку без цены не выбрасывает', async () => {
    // У немецких государственных стоимости часто нет вовсе. «Не знаем» — не
    // то же самое, что «дорого»: выбросив, мы потеряем именно бесплатное.
    const безЦены = await строкой('Вуз без цены', null, null, 'Германия')
    await фактом('budget.tuition.max', 9000, 'EUR')

    const негодные = await чтоНеПодходит(подборка, await основаниеПодбора(дело))

    expect(негодные.map((н) => н.id)).not.toContain(безЦены)
  })

  it('цену в другой валюте не сравнивает с бюджетом', async () => {
    // Курса мы не знаем, и выдумывать его нельзя: по выдуманному выбросим
    // программу, которая на самом деле дешевле.
    const вДолларах = await строкой('Вуз в долларах', 11000, 'USD', 'Германия')
    await фактом('budget.tuition.max', 9000, 'EUR')

    const негодные = await чтоНеПодходит(подборка, await основаниеПодбора(дело))

    expect(негодные.map((н) => н.id)).not.toContain(вДолларах)
  })

  it('чужая страна не подходит независимо от цены', async () => {
    const вИталии = await строкой('Итальянский вуз', 1000, 'EUR', 'Италия')
    await фактом('budget.tuition.max', 12000, 'EUR')

    const негодные = await чтоНеПодходит(подборка, await основаниеПодбора(дело))

    expect(негодные.map((н) => н.id)).toContain(вИталии)
    expect(негодные[0].почему).toContain('страна')
  })

  it('убранное руками в список не попадает — его уже убрали', async () => {
    const убранная = await строкой('Убранный вуз', 30000, 'EUR', 'Германия', 'removed')
    await фактом('budget.tuition.max', 9000, 'EUR')

    const негодные = await чтоНеПодходит(подборка, await основаниеПодбора(дело))

    expect(негодные.map((н) => н.id)).not.toContain(убранная)
  })

  it('дорогое действительно убирается с причиной — весь путь целиком', async () => {
    // Единственная проверка, которая ходит в поиск: всё остальное про отбор
    // уже проверено счётом выше.
    const дорогая = await строкой('Дорогой вуз', 20000, 'EUR', 'Германия')
    const норм = await строкой('Подходящий вуз', 8000, 'EUR', 'Германия')
    await фактом('budget.tuition.max', 9000, 'EUR')

    const итог = await найтиЗамену(дело)

    const { data } = await базаCare()
      .from('shortlist_items')
      .select('id, status, removed_reason')
      .eq('shortlist_id', подборка)
    const по = new Map((data ?? []).map((с) => [с.id as string, с]))

    expect(по.get(дорогая)!.status).toBe('removed')
    expect(String(по.get(дорогая)!.removed_reason)).toContain('бюджет')
    expect(по.get(норм)!.status).toBe('active')
    expect(итог.убрано).toBe(1)
  }, 240_000)

  it('когда всё подходит — ничего не трогает и говорит об этом', async () => {
    await строкой('Дешёвый вуз', 5000, 'EUR', 'Германия')
    await фактом('budget.tuition.max', 12000, 'EUR')

    const итог = await найтиЗамену(дело)

    expect(итог.убрано).toBe(0)
    expect(итог.добавлено).toBe(0)
    expect(итог.причины.join(' ')).toContain('по-прежнему подходит')
  }, 180_000)
})
