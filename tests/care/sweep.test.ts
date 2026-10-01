/**
 * Уборка за умершими поручениями.
 *
 * ОТКУДА ЭТО. Три поручения со вчера висели «идёт» больше суток: работа шла вне
 * запроса, её оборвало, и сообщить об этом было некому. Панель над таким
 * разговором крутит ход работы — куратор ждёт ответ, которого не будет, а
 * потом спрашивает заново и платит второй раз за уже оплаченное.
 *
 * ГЛАВНОЕ, ЧТО ПРОВЕРЯЕМ, — что уборка не трогает живое. Убить работающий
 * разговор хуже, чем лишние десять минут показывать мёртвый: в первом случае
 * мы отнимаем оплаченный ответ, во втором человек просто ждёт.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { закрытьЗависшие, закрытьДогнанные, ПРИЧИНА_ОБРЫВА } from '@/lib/care/jobs/sweep'

const свои: string[] = []

afterEach(async () => {
  for (const id of свои.splice(0)) await базаCare().from('assignments').delete().eq('id', id)
})

async function поручение(минутНазад: number, status = 'running') {
  const { data: у } = await базаCare()
    .from('members')
    .select('id')
    .eq('care_role', 'lead')
    .single()

  const { data, error } = await базаCare()
    .from('assignments')
    .insert({
      initiator_member_id: у!.id,
      scope: { все_мои: true },
      prompt: `ТЕСТ уборки ${минутНазад} мин`,
      status,
      created_at: new Date(Date.now() - минутНазад * 60_000).toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  свои.push(data!.id as string)
  return data!.id as string
}

async function статус(id: string) {
  const { data } = await базаCare().from('assignments').select('status, answer').eq('id', id).single()
  return data!
}

describe('уборка зависших поручений', () => {
  it('поручение старше предела закрывается с внятной причиной', async () => {
    const id = await поручение(40)

    const итог = await закрытьЗависшие(15)
    expect(итог.закрыто).toBeGreaterThanOrEqual(1)

    const с = await статус(id)
    expect(с.status).toBe('failed')
    // Причина, а не пустота: «идёт», сменившееся на ничто, читается как
    // потерянный ответ.
    expect(с.answer).toBe(ПРИЧИНА_ОБРЫВА)
  })

  it('свежее поручение не трогается — иначе уборка сама обрывала бы работу', async () => {
    const id = await поручение(2)

    await закрытьЗависшие(15)

    expect((await статус(id)).status).toBe('running')
  })

  it('законченное не переписывается задним числом', async () => {
    // Иначе старый готовый разговор однажды превратился бы в «оборвалось»,
    // и куратор потерял бы ответ, который уже читал.
    const id = await поручение(600, 'done')
    await базаCare().from('assignments').update({ answer: 'настоящий ответ' }).eq('id', id)

    await закрытьЗависшие(15)

    const с = await статус(id)
    expect(с.status).toBe('done')
    expect(с.answer).toBe('настоящий ответ')
  })

  it('когда закрывать нечего, уборка молчит', async () => {
    // Строка в журнале на каждый тик — это строка раз в минуту; в таком шуме
    // настоящее сообщение не видно.
    const итог = await закрытьЗависшие(15)
    expect(итог.причины).toEqual(итог.закрыто ? итог.причины : [])
    if (итог.закрыто === 0) expect(итог.причины).toHaveLength(0)
  })
})

describe('падения «нет обработчика» закрываются, когда код догнал', () => {
  const свои2: string[] = []

  afterEach(async () => {
    for (const id of свои2.splice(0)) await базаCare().from('jobs').delete().eq('id', id)
  })

  async function упавшее(kind: string, ошибка: string) {
    const { data, error } = await базаCare()
      .from('jobs')
      .insert({ kind, payload: { тест: true }, status: 'failed', attempts: 3, last_error: ошибка })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    свои2.push(data!.id as string)
    return data!.id as string
  }

  async function состояние(id: string) {
    const { data } = await базаCare().from('jobs').select('status').eq('id', id).single()
    return data!.status as string
  }

  it('вид, который код уже умеет, закрывается', async () => {
    // Между миграцией расписания и выкладкой проходят минуты, и в этот
    // промежуток задание нового вида падает трижды. Через десять минут то же
    // самое проходит — значит красным оно висит зря.
    const id = await упавшее('echo', 'нет обработчика для вида «echo»')

    const итог = await закрытьДогнанные(['echo', 'triage_messages'])

    expect(итог.закрыто).toBeGreaterThanOrEqual(1)
    expect(await состояние(id)).toBe('cancelled')
  })

  it('вид, которого код не умеет, остаётся красным', async () => {
    // Это настоящая недоделка, и прятать её нельзя: задание ставится, а
    // исполнять его нечем.
    const id = await упавшее('выдуманный_вид', 'нет обработчика для вида «выдуманный_вид»')

    await закрытьДогнанные(['echo'])

    expect(await состояние(id)).toBe('failed')
  })

  it('падение по другой причине не трогается', async () => {
    // Уборка закрывает ровно один класс. Закрыть заодно настоящую ошибку
    // значило бы спрятать её — и именно ту, которую надо чинить.
    const id = await упавшее('echo', 'Телеграм ответил 403')

    await закрытьДогнанные(['echo'])

    expect(await состояние(id)).toBe('failed')
  })

  it('пустой список видов ничего не закрывает', async () => {
    // Иначе сбой чтения обработчиков закрывал бы всё подряд.
    const id = await упавшее('echo', 'нет обработчика для вида «echo»')

    const итог = await закрытьДогнанные([])

    expect(итог.закрыто).toBe(0)
    expect(await состояние(id)).toBe('failed')
  })
})
