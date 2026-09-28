/**
 * Кто какие дела видит. Приёмочные T01, T02, T11.
 *
 * Самый важный набор этапа 1. Ошибка здесь не «показали лишний столбец», а
 * «куратор прочитал переписку чужого клиента» — и узнают об этом не от нас.
 *
 * Проверяется на настоящей базе синтетическими делами с заведомо
 * несуществующими client_id (отрицательные). Так тест не зависит от того, что
 * лежит в рабочих таблицах, и не может задеть настоящего клиента.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { базаCare } from '@/lib/care/db'
import {
  участникПоПользователю,
  видимыеДела,
  делоДоступно,
  требуетсяДоступ,
  type Участник,
} from '@/lib/care/access'

// Отрицательные client_id: в рабочей таблице таких нет и быть не может.
const КЛИЕНТ_А = -900_001
const КЛИЕНТ_Б = -900_002
const ГОД = 2099

const люди: Record<string, Участник> = {}
const дела: Record<string, string> = {}
const заведённые: { members: string[]; cases: string[] } = { members: [], cases: [] }

async function завестиУчастника(роль: Участник['care_role'], руководитель?: string, имя?: string) {
  const { data, error } = await базаCare()
    .from('members')
    .insert({ user_id: randomUUID(), care_role: роль, team_lead_id: руководитель ?? null })
    .select('id, user_id, care_role, team_lead_id, active')
    .single()
  if (error) throw new Error(`${имя ?? роль}: ${error.message}`)
  заведённые.members.push(data.id)
  return data as Участник
}

async function завестиДело(clientId: number, владелец: string) {
  const { data, error } = await базаCare()
    .from('cases')
    .insert({ client_id: clientId, intake_year: ГОД, owner_member_id: владелец })
    .select('id')
    .single()
  if (error) throw new Error(`дело ${clientId}: ${error.message}`)
  заведённые.cases.push(data.id)
  return data.id as string
}

beforeAll(async () => {
  // Руководитель заводится первым: на него ссылаются остальные.
  люди.руководитель = await завестиУчастника('lead')
  люди.кураторА = await завестиУчастника('curator', люди.руководитель.id)
  люди.кураторБ = await завестиУчастника('curator', люди.руководитель.id)
  // Заместитель вне команды: проверяем, что его пускает только приглашение,
  // а не принадлежность к кому-либо.
  люди.заместитель = await завестиУчастника('deputy')
  // Однофамилец: в контуре личность определяется идентификатором, а не именем.
  // Тест существует, чтобы это осталось правдой после любой правки.
  люди.однофамилец = await завестиУчастника('curator', люди.руководитель.id)

  дела.А = await завестиДело(КЛИЕНТ_А, люди.кураторА.id)
  дела.Б = await завестиДело(КЛИЕНТ_Б, люди.кураторБ.id)

  const через30дней = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
  const вчера = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  await базаCare()
    .from('case_members')
    .insert([
      // Действующее приглашение на дело А.
      { case_id: дела.А, member_id: люди.заместитель.id, role: 'виза', valid_to: через30дней },
      // Истёкшее приглашение на дело Б: доступ должен закончиться сам.
      { case_id: дела.Б, member_id: люди.заместитель.id, role: 'виза', valid_to: вчера },
    ])
    .throwOnError()
})

afterAll(async () => {
  // Дела сносят своих участников каскадом, поэтому порядок именно такой.
  if (заведённые.cases.length) {
    await базаCare().from('cases').delete().in('id', заведённые.cases)
  }
  if (заведённые.members.length) {
    await базаCare().from('members').delete().in('id', заведённые.members)
  }
})

describe('T01 — куратор не видит чужого', () => {
  it('видит своё дело', async () => {
    const область = await видимыеДела(люди.кураторА)
    expect(область.дела).toContain(дела.А)
  })

  it('НЕ видит дело другого куратора', async () => {
    const область = await видимыеДела(люди.кураторА)
    expect(область.дела).not.toContain(дела.Б)
  })

  it('прямая проверка чужого дела отказывает', async () => {
    expect(await делоДоступно(люди.кураторА, дела.Б)).toBe(false)
  })

  it('однофамилец не получает чужих дел', async () => {
    // У однофамильца роль и руководитель те же, что у куратора А, и отличается
    // он только идентификатором. Если где-то сравнение пойдёт по имени —
    // сломается здесь.
    const область = await видимыеДела(люди.однофамилец)
    expect(область.дела).not.toContain(дела.А)
    expect(область.дела).not.toContain(дела.Б)
    expect(область.пусто).toBe(true)
  })
})

describe('T02 — руководитель видит команду', () => {
  it('видит дела обоих своих кураторов', async () => {
    const область = await видимыеДела(люди.руководитель)
    expect(область.дела).toContain(дела.А)
    expect(область.дела).toContain(дела.Б)
  })

  it('прямая проверка дела подчинённого проходит', async () => {
    expect(await делоДоступно(люди.руководитель, дела.А)).toBe(true)
  })

  it('не видит дел чужой команды', async () => {
    const чужой = await завестиУчастника('lead')
    const область = await видимыеДела(чужой)
    expect(область.дела).not.toContain(дела.А)
    expect(область.дела).not.toContain(дела.Б)
  })
})

describe('приглашение действует только пока действует', () => {
  it('заместитель видит дело с незакончившимся приглашением', async () => {
    const область = await видимыеДела(люди.заместитель)
    expect(область.дела).toContain(дела.А)
  })

  it('НЕ видит дело с истёкшим приглашением', async () => {
    const область = await видимыеДела(люди.заместитель)
    expect(область.дела).not.toContain(дела.Б)
    expect(await делоДоступно(люди.заместитель, дела.Б)).toBe(false)
  })

  it('своих дел у заместителя нет', async () => {
    const область = await видимыеДела(люди.заместитель)
    expect(область.дела).toHaveLength(1)
  })
})

describe('T11 — передача дела', () => {
  it('новый ведущий получает дело, прежний теряет', async () => {
    const дело = await завестиДело(-900_003, люди.кураторА.id)

    expect(await делоДоступно(люди.кураторА, дело)).toBe(true)
    expect(await делоДоступно(люди.кураторБ, дело)).toBe(false)

    await базаCare()
      .from('cases')
      .update({ owner_member_id: люди.кураторБ.id })
      .eq('id', дело)
      .throwOnError()

    expect(await делоДоступно(люди.кураторБ, дело)).toBe(true)
    expect(await делоДоступно(люди.кураторА, дело)).toBe(false)
  })

  it('закрытое приглашение перестаёт давать доступ сразу', async () => {
    const дело = await завестиДело(-900_004, люди.кураторА.id)
    await базаCare()
      .from('case_members')
      .insert({ case_id: дело, member_id: люди.заместитель.id, role: 'виза' })
      .throwOnError()

    expect(await делоДоступно(люди.заместитель, дело)).toBe(true)

    // Передача дела закрывает прежние приглашения: valid_to = сейчас.
    await базаCare()
      .from('case_members')
      .update({ valid_to: new Date().toISOString() })
      .eq('case_id', дело)
      .throwOnError()

    expect(await делоДоступно(люди.заместитель, дело)).toBe(false)
  })
})

describe('участник вне контура', () => {
  it('незнакомый пользователь — не участник', async () => {
    expect(await участникПоПользователю(randomUUID())).toBeNull()
  })

  it('требуетсяДоступ бросает, а не возвращает false', async () => {
    await expect(требуетсяДоступ(null, дела.А)).rejects.toThrow('не заведён')
    await expect(требуетсяДоступ(люди.кураторА, дела.Б)).rejects.toThrow('Нет доступа')
  })
})
