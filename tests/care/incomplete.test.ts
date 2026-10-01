/**
 * Дело, которое не работает, должно быть видно — этап 2 плана, три состояния.
 *
 * ЧТО БЫЛО. Дело без привязанного чата не попадало на главную вовсе: причин у
 * него нет, а лента показывает только дела с причинами. Написать такому клиенту
 * нельзя ни одним способом — напоминание уйдёт в никуда, — и узнать об этом
 * можно было, только открыв карточку и не найдя контакта.
 *
 * ЧТО ПРОВЕРЯЕМ ОТДЕЛЬНО. Что признак не горит у всех. Первый прогон правила
 * пометил 36 дел из 39: у дел прежнего кабинета чата в нашем контуре нет по
 * устройству, и это не поломка. Признак, который горит у всех, не признак —
 * его перестают замечать ровно так же, как отсутствующий.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { главная } from '@/lib/care/cases'
import type { Участник } from '@/lib/care/access'

const КЛИЕНТ = -990_783
let участник: Участник

async function дело(ч: { наV2: boolean; чат?: boolean; источник?: boolean; имя: string }) {
  const { data: д, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      intake_term: ч.имя,
      owner_member_id: участник.id,
      is_synthetic: true,
      synthetic_name: ч.имя,
      automation_owner: ч.наV2 ? 'v2' : 'legacy',
      status: 'active',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const id = д!.id as string

  await базаCare().from('contacts').insert({
    case_id: id,
    kind: 'student',
    name: 'Проверочный контакт',
    tg_chat_id: ч.чат ? 1234567 : null,
    can_decide: true,
  })

  if (ч.источник) {
    const { data: и } = await базаCare()
      .from('sources')
      .insert({ case_id: id, kind: 'meeting', note: 'проверка' })
      .select('id')
      .single()
    await базаCare().from('facts').insert({
      case_id: id,
      field: 'country.target',
      value: 'Германия',
      status: 'confirmed',
      is_plan: false,
      source_id: и!.id,
    })
  }

  // Хоть одна причина сверх неполноты: иначе благополучное дело не попадёт в
  // ленту и проверить на нём «не помечено» будет нечем.
  await базаCare().from('tasks').insert({
    case_id: id,
    title: 'Проверочная задача',
    waiting_on: 'client',
    status: 'waiting',
    due_on: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
  })

  return id
}

beforeEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  const { data: у } = await базаCare()
    .from('members')
    .select('id, user_id, care_role, team_lead_id, active')
    .eq('care_role', 'lead')
    .single()
  участник = у as unknown as Участник
})

afterEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
})

async function строкой(id: string) {
  const г = await главная(участник)
  return г.лента.find((с) => с.caseId === id)
}

describe('дело без чата видно на главной', () => {
  it('дело нового кабинета без чата помечено и названо словами', async () => {
    const id = await дело({ наV2: true, чат: false, источник: true, имя: 'ТЕСТ без чата' })

    const с = await строкой(id)
    expect(с, 'дело не попало в ленту вовсе').toBeTruthy()
    expect(с!.уровень).toBe('неполное')
    expect(с!.причины.map((п) => п.текст).join(' ')).toContain('чат')
    // Действие другое: «напомнить» по делу, которому некуда писать, —
    // предложение, которое не исполнится.
    expect(с!.действие).toBe('Достроить')
  })

  it('дело прежнего кабинета без чата не помечается', async () => {
    // Самая важная проверка здесь. Без неё правило пометило 36 дел из 39 — то
    // есть не сказало ничего.
    const id = await дело({ наV2: false, чат: false, источник: false, имя: 'ТЕСТ старого кабинета' })

    const с = await строкой(id)
    expect(с?.уровень).not.toBe('неполное')
  })

  it('дело без единого сведения с источником помечено', async () => {
    // Подбор не на чем строить, подтверждать нечего: дело выглядит заведённым,
    // а работать по нему нельзя.
    const id = await дело({ наV2: true, чат: true, источник: false, имя: 'ТЕСТ без источника' })

    const с = await строкой(id)
    expect(с!.уровень).toBe('неполное')
    expect(с!.причины.map((п) => п.текст).join(' ')).toContain('источник')
  })

  it('полное дело не помечается', async () => {
    const id = await дело({ наV2: true, чат: true, источник: true, имя: 'ТЕСТ полное' })

    const с = await строкой(id)
    expect(с?.уровень).not.toBe('неполное')
  })

  it('неполные стоят выше просроченных', async () => {
    // По просроченному хотя бы понятно, что делать; по делу без чата любое
    // действие упрётся в ту же стену.
    const неполное = await дело({ наV2: true, чат: false, источник: true, имя: 'ТЕСТ неполное' })
    const просроченное = await дело({ наV2: true, чат: true, источник: true, имя: 'ТЕСТ просроченное' })
    await базаCare()
      .from('tasks')
      .update({ due_on: '2026-01-01' })
      .eq('case_id', просроченное)

    const г = await главная(участник)
    const где = (id: string) => г.лента.findIndex((с) => с.caseId === id)

    expect(где(неполное)).toBeGreaterThanOrEqual(0)
    expect(где(просроченное)).toBeGreaterThanOrEqual(0)
    expect(где(неполное)).toBeLessThan(где(просроченное))
  })
})
