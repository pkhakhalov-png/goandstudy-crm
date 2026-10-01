/**
 * Переписка care-бота видна кабинету наравне с историей прежнего.
 *
 * ЧТО СЛОМАЛОСЬ БЫ БЕЗ ЭТОГО. `care.case_messages` читал только
 * `public.deal_messages` — таблицу прежнего бота. Всё, что приходит care-боту,
 * лежит в `care.inbound_events` и в разбор не попадало.
 *
 * Пока бота нет ни в одной группе клиентов, это незаметно. Но ближайшее дело
 * команды — добавить его туда, и ровно тогда новые сообщения перестали бы
 * доходить до разбора: вопросы клиентов не стали бы задачами, факты не
 * извлеклись бы, «ждём клиента» не погасло бы. Ошибок при этом ни одной —
 * просто тишина, которую легко принять за спокойный день.
 *
 * Поэтому проверяем сквозным путём: событие от Телеграма → привязанная
 * группа → строка в представлении. Любое звено оборвётся — увидим здесь, а не
 * в день, когда у клиента прошёл срок.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import { базаCare } from '@/lib/care/db'
import { привязатьГруппу } from '@/lib/care/chats'

const КЛИЕНТ = -990_786
const ЧАТ = '-5559990777'

let дело: string
let участник: string
const события: string[] = []

async function событие(payload: Record<string, unknown>) {
  const id = `тест-переписка-${randomUUID()}`
  const { error } = await базаCare()
    .from('inbound_events')
    .insert({ channel: 'telegram', external_id: id, payload })
  if (error) throw new Error(error.message)
  события.push(id)
  return id
}

const сообщение = (текст: string, имя = 'Алиса') => ({
  message: {
    chat: { id: Number(ЧАТ), type: 'group', title: 'Группа Тестова' },
    from: { first_name: имя },
    text: текст,
  },
})

beforeEach(async () => {
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
  const { data: у } = await базаCare().from('members').select('id').eq('care_role', 'lead').single()
  участник = у!.id as string

  const { data, error } = await базаCare()
    .from('cases')
    .insert({
      client_id: КЛИЕНТ,
      intake_year: 2027,
      intake_term: 'тест-переписка',
      owner_member_id: участник,
      is_synthetic: true,
      synthetic_name: 'ТЕСТ переписки',
      automation_owner: 'v2',
      status: 'active',
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  дело = data!.id as string
})

afterEach(async () => {
  for (const id of события.splice(0)) {
    await базаCare().from('inbound_events').delete().eq('external_id', id)
  }
  await базаCare().from('cases').delete().eq('client_id', КЛИЕНТ)
})

async function переписка() {
  const { data } = await базаCare()
    .from('case_messages')
    .select('message_id, direction, sender_name, content')
    .eq('case_id', дело)
  return data ?? []
}

describe('переписка care-бота в кабинете', () => {
  it('сообщение из привязанной группы видно как входящее', async () => {
    await событие(сообщение('А когда дедлайн в Мюнхене?'))
    await привязатьГруппу(дело, ЧАТ, участник)

    const строки = await переписка()

    expect(строки).toHaveLength(1)
    expect(строки[0].content).toContain('дедлайн')
    expect(строки[0].direction).toBe('incoming')
    expect(строки[0].sender_name).toBe('Алиса')
  })

  it('без привязанной группы сообщение не видно никому', async () => {
    // Привязка — это и есть разрешение читать: чужая группа, в которую бота
    // добавили по ошибке, не должна проступать ни в одном деле.
    await событие(сообщение('тайное'))

    expect(await переписка()).toHaveLength(0)
  })

  it('служебное обновление без текста в переписку не попадает', async () => {
    // Вход бота в группу, смена прав: события есть, сказать нечего.
    await событие({
      my_chat_member: {
        chat: { id: Number(ЧАТ), type: 'group', title: 'Группа Тестова' },
        new_chat_member: { status: 'member' },
      },
    })
    await привязатьГруппу(дело, ЧАТ, участник)

    expect(await переписка()).toHaveLength(0)
  })

  it('подпись к файлу читается как текст', async () => {
    // «Вот диплом» подписью к скану — обычное дело, и это сообщение клиента.
    await событие({
      message: {
        chat: { id: Number(ЧАТ), type: 'group' },
        from: { first_name: 'Алиса' },
        caption: 'Вот диплом, перевод будет завтра',
        document: { file_id: 'тест' },
      },
    })
    await привязатьГруппу(дело, ЧАТ, участник)

    const строки = await переписка()
    expect(строки).toHaveLength(1)
    expect(строки[0].content).toContain('диплом')
  })

  it('отправитель без имени назван, а не пуст', async () => {
    // Пустое имя в разборе читается как «неизвестно кто», и модель не отличит
    // слова клиента от слов коллеги.
    await событие({
      message: { chat: { id: Number(ЧАТ), type: 'group' }, from: {}, text: 'без имени' },
    })
    await привязатьГруппу(дело, ЧАТ, участник)

    const строки = await переписка()
    expect(строки[0].sender_name).toBeTruthy()
  })

  it('дело вернули прежнему кабинету — переписка скрылась', async () => {
    // Представление для того и смотрит на automation_owner: сняли дело с v2,
    // и контур перестал читать чужую переписку.
    await событие(сообщение('видно сейчас'))
    await привязатьГруппу(дело, ЧАТ, участник)
    expect(await переписка()).toHaveLength(1)

    await базаCare().from('cases').update({ automation_owner: 'legacy' }).eq('id', дело)

    expect(await переписка()).toHaveLength(0)
  })
})
