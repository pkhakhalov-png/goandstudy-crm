import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { runStep, hasStep, registeredSteps } from '@/lib/seo/steps'
import { outcomeFor } from '@/lib/seo/failure'
import '@/lib/seo/steps-article'   // регистрация шагов производства статьи

// Воркер SEO-очереди (PRD 10.3). Вызывается pg_cron через pg_net раз в минуту.
// Тики МОГУТ пересекаться — конкуренция регулируется в БД (claim_jobs, SKIP LOCKED).
export const runtime = 'nodejs'
export const maxDuration = 300

const TIME_BUDGET_MS = 240_000   // ≤240 c, остаток возвращаем в pending
const BATCH = 5

// Шаги производства статьи долгие: замерено на живом прогоне — бриф 122 c,
// черновик 189 c, проверки с починкой 209 c. Начинать такой шаг под конец бюджета
// нельзя: Vercel убьёт функцию на 300 c посреди генерации, задача повиснет
// в running и вернётся в очередь только через десять минут.
const LONG_STEP_MS = 230_000
// Долгие — те, что зовут модель. Проверка индексации это пара запросов к
// Search Console, ей полный запас времени не нужен.
/**
 * Публикация в тему идёт по SSH к серверу, и ключа на Vercel нет — так и задумано.
 * Обработчик у нас формально есть, поэтому проверки «умею ли я» мало: без этого
 * условия задачу первым забирал Vercel и ронял её на отсутствии ssh, хотя рядом
 * стоял агент, который умеет.
 */
const SERVER_ONLY_STEPS = new Set(['article_publish_blog', 'link_insert_theme'])
const canRunHere = (step: string) => !(process.env.VERCEL && SERVER_ONLY_STEPS.has(step))

const QUICK_ARTICLE_STEPS = new Set(['article_index_check', 'article_autostart'])
const isLongStep = (step: string) => step.startsWith('article_') && !QUICK_ARTICLE_STEPS.has(step)

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
        { step: 'article_index_check', lane: 'findings', priority: 20, payload: {} },
      ]
      const { data: ex } = await seo.from('jobs').select('step').in('step', steps.map((s) => s.step)).in('status', ['pending', 'running', 'waiting'])
      const have = new Set((ex ?? []).map((e: any) => e.step))
      const toAdd = steps.filter((s) => !have.has(s.step))
      if (toAdd.length) await seo.from('jobs').insert(toAdd)
      await seo.from('settings').upsert({ key: 'last_auto_refresh', value: { at: new Date().toISOString() } }, { onConflict: 'key' })
    }
  } catch { /* авто-обновление не критично для обработки очереди */ }

  // Поток статей проверяем чаще суточного цикла: при ритме «статья в день»
  // проверка раз в двадцать часов пропускала бы дни. Сам шаг дешёвый и молча
  // ничего не делает, если пауза ещё не вышла.
  try {
    const { data: mk } = await seo.from('settings').select('value').eq('key', 'last_autostart_check').maybeSingle()
    const lastAt = (mk?.value as any)?.at ? Date.parse((mk!.value as any).at) : 0
    if (Date.now() - lastAt > 3600 * 1000) {
      const { data: ex } = await seo.from('jobs').select('id')
        .eq('step', 'article_autostart').in('status', ['pending', 'running', 'waiting']).limit(1)
      if (!ex?.length) {
        await seo.from('jobs').insert({ step: 'article_autostart', lane: 'production', priority: 15, payload: {} })
      }
      await seo.from('settings').upsert({ key: 'last_autostart_check', value: { at: new Date().toISOString() } }, { onConflict: 'key' })
    }
  } catch { /* поток не критичен для обработки очереди */ }

  while (Date.now() - started < TIME_BUDGET_MS) {
    // Просим только то, что умеем: маршрутизация на стороне очереди, а не
    // «взял и вернул». Пока миграция не применена, функция игнорирует параметр
    // и выдаёт всё подряд — страховка ниже по коду на этот случай остаётся.
    const { data: jobs, error } = await seo.rpc('claim_jobs', { p_worker: workerId, p_limit: BATCH, p_runner: 'vercel' })
    if (error) return NextResponse.json({ error: error.message, processed }, { status: 500 })
    if (!jobs || jobs.length === 0) break

    for (const job of jobs as any[]) {
      // Кончилось время — вернуть остаток в pending, не выполнять.
      // Для долгих шагов нужен не остаток времени, а полный запас: иначе шаг
      // начнётся и будет убит на середине.
      const need = isLongStep(job.step) ? LONG_STEP_MS : 0
      if (Date.now() - started >= TIME_BUDGET_MS - need) {
        await seo.rpc('complete_job', { p_job_id: job.id, p_outcome: 'released', p_result: {} })
        released++
        continue
      }
      // Шаг может быть неизвестен этому воркеру: публикация в тему требует SSH,
      // и её делает воркер с ключом, а не Vercel. Возвращаем задачу в очередь,
      // а не убиваем — иначе один воркер ломает работу другого.
      if (!hasStep(job.step) || !canRunHere(job.step)) {
        await seo.rpc('complete_job', { p_job_id: job.id, p_outcome: 'released', p_result: { skipped: 'этот воркер такую работу не делает' } })
        released++
        continue
      }
      try {
        const outcome = await runStep(job, seo)   // { outcome, result }
        await seo.rpc('complete_job', { p_job_id: job.id, p_outcome: outcome.outcome, p_result: outcome.result ?? {} })
      } catch (e: any) {
        // Повторять имеет смысл перегрузку и обрыв связи. Нехватку денег,
        // неверный ключ и занятый слаг повторять бессмысленно — это только
        // сожжёт попытки и спрячет причину за общим «retry».
        const { outcome, result } = outcomeFor(e)
        await seo.rpc('complete_job', { p_job_id: job.id, p_outcome: outcome, p_result: result })
      }
      processed++
    }
  }

  return NextResponse.json({ ok: true, worker: workerId, processed, released, steps: registeredSteps(), ms: Date.now() - started })
}
