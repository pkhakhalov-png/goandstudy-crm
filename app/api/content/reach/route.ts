import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Достижимы ли площадки оттуда, где выполняется наш код.
 *
 * Зачем отдельная проверка. Разведка перед подключением площадки обязана
 * отвечать на вопрос «доступно ли», а измерить это с ноутбука разработчика
 * нельзя: ноутбук в Москве и, возможно, за VPN, а публиковать будет сервер в
 * другой стране и без VPN. Это разные сети и разные ответы.
 *
 * Токен не нужен и намеренно не используется: нас интересует, доходит ли
 * запрос вообще. Ответ «401 неверный токен» — это успех проверки: значит,
 * сеть есть, TLS сошёлся, сервис отвечает.
 *
 * Доступ только админу: эндпоинт делает исходящие запросы, и открывать его
 * наружу значило бы отдать чужим свой сервер для проверки чужих адресов.
 */

const ЦЕЛИ = [
  { имя: 'telegram', url: 'https://api.telegram.org/bot0:0/getMe', ожидаем: 'HTTP 401 — сеть есть, токен не тот' },
  { имя: 'vk', url: 'https://api.vk.com/method/users.get?v=5.199', ожидаем: 'JSON с ошибкой 15 «token required» — сеть есть, авторизации нет' },
]

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'не авторизован' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'только админ' }, { status: 403 })

  const результаты = await Promise.all(ЦЕЛИ.map(async (ц) => {
    const t0 = Date.now()
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10_000)
      const res = await fetch(ц.url, { signal: ctrl.signal, cache: 'no-store' })
      clearTimeout(timer)
      const body = (await res.text()).slice(0, 200)
      return {
        площадка: ц.имя,
        достижима: true,
        статус: res.status,
        мс: Date.now() - t0,
        ответ: body,
        ожидали: ц.ожидаем,
      }
    } catch (e: any) {
      // Недостижимость — это результат измерения, а не поломка эндпоинта.
      return {
        площадка: ц.имя,
        достижима: false,
        статус: null,
        мс: Date.now() - t0,
        ошибка: String(e?.name === 'AbortError' ? 'таймаут 10 с' : e?.message ?? e),
        ожидали: ц.ожидаем,
      }
    }
  }))

  return NextResponse.json({
    откуда: {
      площадка_размещения: process.env.VERCEL ? 'vercel' : 'локально',
      регион: process.env.VERCEL_REGION ?? null,
      окружение: process.env.VERCEL_ENV ?? 'development',
    },
    снято: new Date().toISOString(),
    результаты,
  })
}
