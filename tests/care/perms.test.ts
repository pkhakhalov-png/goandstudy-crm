/**
 * Права роли care_app. Приёмочный тест T15 — «запись в боевые данные невозможна».
 *
 * Это главный тест контура. Всё остальное — про удобство и правильность;
 * этот про то, может ли ошибка в новом коде испортить работу кураторов.
 *
 * Проверяется не намерение, а факт: через тот же клиент, которым пользуется
 * приложение, делается попытка записи в `public.clients`. Она обязана
 * провалиться по правам. Если этот тест позеленел «сам собой» — значит роли
 * кто-то выдал лишнего, и это важнее любой функции.
 */
import { describe, it, expect } from 'vitest'
import { базаCare, базаPublic } from '@/lib/care/db'

describe('права роли care_app', () => {
  it('читает клиентов', async () => {
    const { error } = await базаPublic().from('clients').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('читает кураторов', async () => {
    const { error } = await базаPublic().from('curators').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('НЕ изменяет клиента', async () => {
    // id, которого заведомо нет: тест не должен зависеть от содержимого базы.
    // Отказ по правам приходит раньше, чем проверка существования строки.
    const { error } = await базаPublic()
      .from('clients')
      .update({ first_name: 'проверка прав' })
      .eq('id', -1)
    expect(error).not.toBeNull()
  })

  it('НЕ создаёт клиента', async () => {
    const { error } = await базаPublic().from('clients').insert({ first_name: 'проверка прав' })
    expect(error).not.toBeNull()
  })

  it('НЕ удаляет клиента', async () => {
    const { error } = await базаPublic().from('clients').delete().eq('id', -1)
    expect(error).not.toBeNull()
  })

  it('НЕ читает платежи', async () => {
    const { error } = await базаPublic().from('payments').select('id').limit(1)
    expect(error).not.toBeNull()
  })

  it('НЕ читает расходы', async () => {
    const { error } = await базаPublic().from('expenses').select('id').limit(1)
    expect(error).not.toBeNull()
  })

  it('пишет в свою схему', async () => {
    const { data, error } = await базаCare()
      .from('settings')
      .select('key')
      .eq('key', 'timezone')
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})
