/**
 * Привязка группы Телеграма к делу из кабинета.
 *
 * ЗАЧЕМ. Care-бота нет ни в одной группе клиентов — проверено 02.10.2026, — и
 * ближайшее, что будет делать команда, это добавлять его туда. После добавления
 * группу надо связать с делом, иначе кабинет её не видит: ни переписки, ни
 * адреса для напоминания. До сих пор это умел только скрипт, искавший группу по
 * имени и фамилии в названии: он работает, пока названия аккуратные, и молча не
 * работает, когда нет.
 *
 * ЧТО ЗАЩИЩАЕМ. Ошибка привязки — это напоминание чужому человеку в чужом чате,
 * и отменить его нечем. Поэтому:
 *
 *   — привязать можно только группу, в которой бот действительно побывал;
 *   — занятую другим делом — нельзя;
 *   — личная переписка в кандидаты не попадает вовсе;
 *   — привязка делает обе половины сразу: адрес для отправки и источник для
 *     чтения. Одна без другой даёт дело, где переписка видна, а написать
 *     нельзя, и разбираться в этом придётся в день просроченного срока.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import { базаCare } from '@/lib/care/db'
import { знакомыеГруппы, привязатьГруппу, отвязатьГруппу } from '@/lib/care/chats'

const КЛИЕНТ = -990_785
const ЧАТ = '-5559990001'
const ЛИЧКА = '555000111'

let дело: string
let второеДело: string
let участник: string
const события: string[] = []

async function событие(payload: Record<string, unknown>) {
  const id = `тест-чат-${randomUUID()}`
  await базаCare().from('inbound_events').insert({ channel: 'telegram', external_id: id, payload })
  события.push(id)
}

beforeEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
  участник = у!.id as string

  const завести = async (семестр: string) => {
    const { data, error } = await базаCare()
      .from('cases')
      .insert({
        client_id: КЛИЕНТ,
        intake_year: 2027,
        intake_term: семестр,
        owner_member_id: участник,
        is_synthetic: true,
        synthetic_name: 'ТЕСТ привязки',
        automation_owner: 'v2',
        status: 'active',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return data!.id as string
  }
  дело = await завести('тест-чат-1')
  второеДело = await завести('тест-чат-2')

  await событие({ message: { chat: { id: Number(ЧАТ), type: 'group', title: 'Группа Тестова' }, text: 'привет' } })
})

afterEach(async () => {
  for (const id of события.splice(0)) {
    await базаCare().from('inbound_events').delete().eq('external_id', id)
  }
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
})

describe('какие группы бот знает', () => {
  it('группа из входящего сообщения попадает в список с названием', async () => {
    const группы = await знакомыеГруппы()
    const наша = группы.find((г) => г.chatId === ЧАТ)

    expect(наша).toBeTruthy()
    // Название обязательно: номер чата — минусовое число в тринадцать цифр,
    // по нему куратор группу не узнает.
    expect(наша!.название).toBe('Группа Тестова')
    expect(наша!.занятаДелом).toBeNull()
  })

  it('добавление бота в группу тоже делает её знакомой', async () => {
    // Куратор добавил бота и ничего не написал — группа всё равно должна
    // появиться, иначе придётся объяснять, что надо «написать что-нибудь».
    const чат = '-5559990002'
    await событие({
      my_chat_member: {
        chat: { id: Number(чат), type: 'supergroup', title: 'Только что добавили' },
        new_chat_member: { status: 'member' },
      },
    })

    const группы = await знакомыеГруппы()
    expect(группы.find((г) => г.chatId === чат)?.название).toBe('Только что добавили')
  })

  it('личная переписка в кандидаты не попадает', async () => {
    // Привязать дело к личке сотрудника — верный способ написать не туда.
    await событие({ message: { chat: { id: Number(ЛИЧКА), type: 'private' }, text: 'привет' } })

    const группы = await знакомыеГруппы()
    expect(группы.find((г) => г.chatId === ЛИЧКА)).toBeUndefined()
  })

  it('привязанная группа помечена делом, а не спрятана', async () => {
    // «Эта группа у Иванова» — ответ на вопрос куратора; пустой список на него
    // не отвечает.
    await привязатьГруппу(дело, ЧАТ, участник)

    const группы = await знакомыеГруппы()
    expect(группы.find((г) => г.chatId === ЧАТ)?.занятаДелом).toBe(дело)
  })
})

describe('привязка группы к делу', () => {
  it('заводит адрес для отправки и источник для чтения разом', async () => {
    const итог = await привязатьГруппу(дело, ЧАТ, участник)
    expect(итог.ok).toBe(true)

    const { data: контакты } = await базаCare()
      .from('contacts')
      .select('tg_chat_id')
      .eq('case_id', дело)
      .not('tg_chat_id', 'is', null)
    const { data: источники } = await базаCare()
      .from('sources')
      .select('ref')
      .eq('case_id', дело)
      .eq('kind', 'message')

    expect(контакты).toHaveLength(1)
    expect(String(контакты![0].tg_chat_id)).toBe(ЧАТ)
    // Без источника переписка в кабинете не видна, даже когда адрес уже есть.
    expect((источники ?? []).some((и) => (и.ref as { chat_id?: string }).chat_id === ЧАТ)).toBe(true)
  })

  it('чужую группу не отдаёт', async () => {
    // Одна группа на два дела — это чужое напоминание в чужом чате.
    await привязатьГруппу(дело, ЧАТ, участник)

    const итог = await привязатьГруппу(второеДело, ЧАТ, участник)

    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.ошибка).toContain('другому делу')
  })

  it('незнакомый номер не привязывает', async () => {
    // Набранный руками номер однажды уведёт напоминание неизвестно куда.
    const итог = await привязатьГруппу(дело, '-9999999999', участник)

    expect(итог.ok).toBe(false)
    if (!итог.ok) expect(итог.ошибка).toContain('не знает')
  })

  it('повторная привязка той же группы к тому же делу проходит', async () => {
    // Куратор нажал дважды — это не ошибка и не повод показывать отказ.
    await привязатьГруппу(дело, ЧАТ, участник)
    expect((await привязатьГруппу(дело, ЧАТ, участник)).ok).toBe(true)

    const { data } = await базаCare()
      .from('sources')
      .select('id')
      .eq('case_id', дело)
      .eq('kind', 'message')
    // И источник не задваивается.
    expect((data ?? []).length).toBe(1)
  })

  it('привязка записана в журнал дела', async () => {
    await привязатьГруппу(дело, ЧАТ, участник)

    const { data } = await базаCare()
      .from('events')
      .select('action')
      .eq('case_id', дело)
      .eq('action', 'chat_linked')

    expect((data ?? []).length).toBe(1)
  })
})

describe('отвязка', () => {
  it('снимает адрес, но оставляет прошлую переписку', async () => {
    await привязатьГруппу(дело, ЧАТ, участник)

    const итог = await отвязатьГруппу(дело, участник)
    expect(итог.ok).toBe(true)

    const { data: контакты } = await базаCare()
      .from('contacts')
      .select('tg_chat_id')
      .eq('case_id', дело)
      .not('tg_chat_id', 'is', null)
    const { data: источники } = await базаCare()
      .from('sources')
      .select('id')
      .eq('case_id', дело)
      .eq('kind', 'message')

    expect(контакты).toHaveLength(0)
    // Писать по нему всё равно нельзя, а прошлая переписка — свидетельство.
    expect((источники ?? []).length).toBe(1)
  })

  it('отвязывать нечего — так и сказано', async () => {
    const итог = await отвязатьГруппу(дело, участник)
    expect(итог.ok).toBe(false)
  })
})
