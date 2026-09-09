import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { runStep } from '@/lib/seo/steps'

// Воркер SEO-очереди (PRD 10.3). Вызывается pg_cron через pg_net раз в минуту.
// Тики МОГУТ пересекаться — конкуренция регулируется в БД (claim_jobs, SKIP LOCKED).
export const runtime = 'nodejs'
export const maxDuration = 300

const TIME_BUDGET_MS = 240_000   // ≤240 c, остаток возвращаем в pending
const BATCH = 5

export async function POST(req: NextRequest) {
  const secret = process.env.SEO_TICK_SECRET
  if (!secret || req.headers.get('x-seo-tick-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const workerId = `w_${Math.random().toString(36).slice(2, 10)}`
  const sb = await createAdminClient()
  const seo = sb.schema('seo')

  let processed = 0
  let released = 0

  // Само-обновление: раз в ~сутки ставим цепочку пересчёта (данные живут без ручных прогонов).
  // Шаги идемпотентны, порядок не критичен (самовыравнивается за сутки). Не дублируем уже стоящие.
  try {
    const { data: mk } = await seo.from('settings').select('value').eq('key', 'last_auto_refresh').maybeSingle()
    const lastAt = (mk?.value as any)?.at ? Date.parse((mk!.value as any).at) : 0
    if (Date.now() - lastAt > 20 * 3600 * 1000) {
      const steps = [
        { step: 'gsc_import', lane: 'gsc', priority: 90, payload: {} },
        { step: 'cluster_pages', lane: 'findings', priority: 80, payload: {} },
        { step: 'findings_inventory', lane: 'findings', priority: 70, payload: {} },
        { step: 'technical_findings', lane: 'findings', priority: 60, payload: { origin: 'https://goandstudy.com' } },
        { step: 'findings_gsc', lane: 'gsc', priority: 50, payload: {} },
        { step: 'compute_opportunities', lane: 'findings', priority: 40, payload: {} },
        { step: 'generate_schema', lane: 'findings', priority: 30, payload: {} },
      ]
      const { data: ex } = await seo.from('jobs').select('step').in('step', steps.map((s) => s.step)).in('status', ['pending', 'running', 'waiting'])
      const have = new Set((ex ?? []).map((e: any) => e.step))
      const toAdd = steps.filter((s) => !have.has(s.step))
      if (toAdd.length) await seo.from('jobs').insert(toAdd)
      await seo.from('settings').upsert({ key: 'last_auto_refresh', value: { at: new Date().toISOString() } }, { onConflict: 'key' })
    }
  } catch { /* авто-обновление не критично для обработки очереди */ }

  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data: jobs, error } = await seo.rpc('claim_jobs', { p_worker: workerId, p_limit: BATCH })
    if (error) return NextResponse.json({ error: error.message, processed }, { status: 500 })
    if (!jobs || jobs.length === 0) break

    for (const job of jobs as any[]) {
      // Кончилось время — вернуть остаток в pending, не выполнять
      if (Date.now() - started >= TIME_BUDGET_MS) {
        await seo.rpc('complete_job', { p_job_id: job.id, p_outcome: 'released', p_result: {} })
        released++
        continue
      }
      try {
        const outcome = await runStep(job, seo)   // { outcome, result }
        await seo.rpc('complete_job', { p_job_id: job.id, p_outcome: outcome.outcome, p_result: outcome.result ?? {} })
      } catch (e: any) {
        await seo.rpc('complete_job', {
          p_job_id: job.id, p_outcome: 'retry',
          p_result: { error: (e?.message ?? 'step error').slice(0, 500) },
        })
      }
      processed++
    }
  }

  return NextResponse.json({ ok: true, worker: workerId, processed, released, ms: Date.now() - started })
}
