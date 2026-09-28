/**
 * Повторная доставка события не создаёт вторую запись.
 *
 * Телеграм повторяет доставку при любом таймауте, и это штатно. Цена ошибки
 * здесь не «лишняя строка в таблице», а лишнее напоминание клиенту — то есть
 * ровно то, чего система не должна делать никогда.
 *
 * Дедуп проверяется на уровне базы, а не кода: ограничение unique нельзя
 * обойти новым маршрутом, а проверку в коде — можно.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { базаCare } from '@/lib/care/db'

// Помечаем свои строки, чтобы уборка не задела настоящие события.
const МЕТКА = `test_dedup_${Date.now()}`

afterAll(async () => {
  await базаCare().from('inbound_events').delete().like('external_id', `${МЕТКА}%`)
})

describe('приём входящих событий', () => {
  it('одно и то же событие записывается один раз', async () => {
    const событие = { channel: 'telegram', external_id: `${МЕТКА}_1`, payload: { update_id: 1 } }

    const первая = await базаCare().from('inbound_events').insert(событие)
    expect(первая.error).toBeNull()

    const вторая = await базаCare().from('inbound_events').insert(событие)
    expect(вторая.error).not.toBeNull()
    // 23505 — нарушение уникальности. Именно этот код обработчик вебхука
    // трактует как «повтор» и отвечает 200.
    expect(вторая.error?.code).toBe('23505')

    const { data } = await базаCare()
      .from('inbound_events')
      .select('id')
      .eq('external_id', `${МЕТКА}_1`)
    expect(data).toHaveLength(1)
  })

  it('разные события с одного канала записываются оба', async () => {
    await базаCare().from('inbound_events').insert([
      { channel: 'telegram', external_id: `${МЕТКА}_2`, payload: { update_id: 2 } },
      { channel: 'telegram', external_id: `${МЕТКА}_3`, payload: { update_id: 3 } },
    ])
    const { data } = await базаCare()
      .from('inbound_events')
      .select('id')
      .like('external_id', `${МЕТКА}_%`)
    expect((data ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('одинаковый идентификатор в разных каналах — разные события', async () => {
    const { error } = await базаCare()
      .from('inbound_events')
      .insert({ channel: 'manual', external_id: `${МЕТКА}_1`, payload: {} })
    // Уникальность составная: канал плюс идентификатор. Совпадение только по
    // идентификатору столкновением не считается.
    expect(error).toBeNull()
  })
})
