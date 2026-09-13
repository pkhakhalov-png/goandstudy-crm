import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Кто сейчас смотрит: пользователь и его профиль.
 *
 * Зачем обёртка. Оболочка раздела (`layout.tsx`) и сама страница рисуются в
 * одном запросе, и обеим нужно одно и то же: имя для сайдбара и роль для
 * проверки доступа. Без общей функции это два одинаковых похода в базу подряд,
 * а поход стоит около сотни миллисекунд — ровно та цена, которую мы только что
 * убирали с экранов.
 *
 * `cache` из React запоминает результат на время одного запроса: layout
 * спросит, страница получит уже посчитанное. Между запросами ничего не
 * сохраняется — это не кеш данных, а защита от повторного вопроса.
 */
export const viewer = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null }

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  return { user, profile }
})

/** Инициалы для аватара. Пусто — значит покажем две буквы по умолчанию. */
export function initialsOf(name: string | null | undefined, email: string | null | undefined, fallback = 'АБ'): string {
  return (name || email || fallback)
    .split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}
