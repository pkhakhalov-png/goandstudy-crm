/**
 * Разрешение флагов: клиент → куратор → все, ближайший побеждает.
 *
 * Правило простое на словах и легко ломается незаметно: достаточно поменять
 * порядок проверок местами, и запрет для одного клиента перестанет
 * перебивать общее разрешение. Заметят это на клиенте, которому не следовало
 * ничего отправлять.
 *
 * Отдельно проверяется умолчание: нет записи — выключено. Это самая важная
 * строка файла, и она должна оставаться правдой после любой правки.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { базаCare } from '@/lib/care/db'
import { флагВключён } from '@/lib/care/flags'

const КЛИЕНТ = '-990001'
const СОТРУДНИК = '00000000-0000-4000-8000-00000000f1a6'

async function убрать() {
  await базаCare().from('feature_flags').delete().eq('scope_id', КЛИЕНТ)
  await базаCare().from('feature_flags').delete().eq('scope_id', СОТРУДНИК)
  // Общие записи трогаем только те, что завели сами: флаг 'ai' в этих тестах
  // больше нигде не используется.
  await базаCare().from('feature_flags').delete().eq('scope', 'all').eq('flag', 'ai')
}

afterEach(убрать)

async function завести(scope: string, scope_id: string | null, flag: string, enabled: boolean) {
  await базаCare().from('feature_flags').insert({ scope, scope_id, flag, enabled }).throwOnError()
}

describe('умолчание', () => {
  it('нет записи — выключено', async () => {
    expect(await флагВключён('ai', { clientId: КЛИЕНТ, memberId: СОТРУДНИК })).toBe(false)
  })

  it('выключено даже когда не про кого спрашивать', async () => {
    expect(await флагВключён('ai')).toBe(false)
  })
})

describe('ближайший побеждает', () => {
  it('общее разрешение работает', async () => {
    await завести('all', null, 'ai', true)
    expect(await флагВключён('ai', { clientId: КЛИЕНТ })).toBe(true)
  })

  it('запрет по сотруднику перебивает общее разрешение', async () => {
    await завести('all', null, 'ai', true)
    await завести('curator', СОТРУДНИК, 'ai', false)
    expect(await флагВключён('ai', { memberId: СОТРУДНИК })).toBe(false)
    // Другому сотруднику общее разрешение по-прежнему действует.
    expect(await флагВключён('ai', {})).toBe(true)
  })

  it('запрет по клиенту перебивает разрешение по сотруднику', async () => {
    await завести('all', null, 'ai', true)
    await завести('curator', СОТРУДНИК, 'ai', true)
    await завести('client', КЛИЕНТ, 'ai', false)
    expect(await флагВключён('ai', { clientId: КЛИЕНТ, memberId: СОТРУДНИК })).toBe(false)
  })

  it('разрешение по клиенту перебивает общий запрет', async () => {
    await завести('all', null, 'ai', false)
    await завести('client', КЛИЕНТ, 'ai', true)
    expect(await флагВключён('ai', { clientId: КЛИЕНТ })).toBe(true)
    // Пилот на одном клиенте — ровно этот случай: всем нельзя, этому можно.
    expect(await флагВключён('ai', { clientId: '-990002' })).toBe(false)
  })
})

describe('ограничения базы', () => {
  it('две записи «для всех» по одному флагу завести нельзя', async () => {
    await завести('all', null, 'ai', true)
    const { error } = await базаCare()
      .from('feature_flags')
      .insert({ scope: 'all', scope_id: null, flag: 'ai', enabled: false })
    // Иначе появились бы два противоречащих ответа на один вопрос, и какой
    // из них победит, зависело бы от порядка строк.
    expect(error).not.toBeNull()
  })

  it('запись «для всех» с адресатом завести нельзя', async () => {
    const { error } = await базаCare()
      .from('feature_flags')
      .insert({ scope: 'all', scope_id: КЛИЕНТ, flag: 'ai', enabled: true })
    expect(error).not.toBeNull()
  })
})
