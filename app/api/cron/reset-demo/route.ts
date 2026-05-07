/**
 * Часовой Vercel cron: сбрасывает демо-клиента к чистому seed-состоянию.
 * Любые правки демо-юзера (заполнение мотивашки, удаление вуза и т.п.) откатятся.
 *
 * Vercel автоматически вызывает этот endpoint по расписанию из vercel.json
 * (с заголовком x-vercel-cron). Для ручных тестов — секрет в CRON_SECRET env.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resetDemoClient } from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') !== null
  const manualSecret = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
    && !!process.env.CRON_SECRET
  if (!isVercelCron && !manualSecret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sb = await createAdminClient()
    const result = await resetDemoClient(sb as any)
    return NextResponse.json({ ok: true, ...result, ts: new Date().toISOString() })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown'
    console.error('[cron/reset-demo]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
