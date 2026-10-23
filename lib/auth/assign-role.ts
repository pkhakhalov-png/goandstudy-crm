/**
 * Роль для только что созданного входа (клиент по приглашению, куратор).
 *
 * Зачем отдельная функция. При создании auth.users триггер в базе сам заводит
 * строку public.users — с ролью продажника по умолчанию и email в нижнем
 * регистре. Обе формы приглашений искали эту строку по email с учётом
 * регистра: адрес «Astashkina03@inbox.ru» её не находил, вставка падала на
 * дубле, ошибку глушил warnOnError, и человек входил в CRM продажником. Так с
 * июня прошли семь клиентов, и распределение заявок отдавало им чужие сделки.
 *
 * Поэтому роль ставится по id нового входа, строка ищется без учёта регистра
 * только как запасной путь, а в конце роль перечитывается: если она не та,
 * вход не выполняется — молчать здесь нельзя.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { emailPattern } from '@/lib/email-match'

type Role = 'client' | 'curator'

export async function assignRole(
  admin: SupabaseClient,
  p: { authUserId: string; email: string; role: Role; extra?: Record<string, unknown> },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fields = { role: p.role, ...(p.extra ?? {}) }

  // 1. Строка триггера: тот же id, что у входа
  const { data: byId, error: byIdErr } = await admin
    .from('users').update(fields).eq('id', p.authUserId).select('id')
  if (byIdErr) console.error('[assignRole] update by id:', byIdErr.message)

  if (!byId?.length) {
    // 2. Триггера нет: старая строка с этим email (сид, прежний вход) или новая
    const { data: old } = await admin
      .from('users').select('id').ilike('email', emailPattern(p.email)).maybeSingle()
    const { error } = old
      ? await admin.from('users').update({ id: p.authUserId, ...fields }).eq('id', old.id)
      : await admin.from('users').insert({ id: p.authUserId, email: p.email.toLowerCase(), ...fields })
    if (error) console.error('[assignRole] fallback:', error.message)
  }

  // 3. Проверка: какую роль человек получит при входе
  const { data: check } = await admin.from('users').select('role').eq('id', p.authUserId).maybeSingle()
  if (check?.role !== p.role) {
    console.error('[assignRole] роль не встала:', p.email, 'ожидали', p.role, 'получили', check?.role)
    return { ok: false, error: 'Не удалось настроить доступ к кабинету. Напишите куратору — мы поправим вручную.' }
  }
  return { ok: true }
}
