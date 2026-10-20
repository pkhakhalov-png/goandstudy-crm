import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { повторитьОдну } from '@/lib/zoom/process-recording'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Расшифровка часовой консультации и её разбор — пара минут. Одна запись за вызов.
export const maxDuration = 300

/**
 * Довести упавшие записи звонков без участия человека.
 *
 * Зовётся SEO-тиком раз в десять минут (тот же секрет): отдельного крона
 * заводить незачем, а свой маршрут нужен, чтобы расшифровка не съедала бюджет
 * времени статей. Отвечает сразу, работа идёт в `after` — тику ждать нечего.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SEO_TICK_SECRET
  if (!secret || req.headers.get('x-seo-tick-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  after(async () => {
    const admin = await createAdminClient()
    // Пока есть время — следующую: после простоя распознавателя их бывает много.
    const начало = Date.now()
    while (Date.now() - начало < 60_000) {   // расшифровка часа — до 3 минут, начинать позже нельзя
      const итог = await повторитьОдну(admin)
      console.log(`[zoom retry] ${итог}`)
      // Упала одна — берём следующую: сбой разбора не повод не расшифровать остальные.
      if (итог === 'нечего повторять' || итог === 'запись уже взял другой') break
    }
  })

  return NextResponse.json({ ok: true, accepted: true })
}
