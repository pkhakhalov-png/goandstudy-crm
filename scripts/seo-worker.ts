// Воркер очереди: берёт задачи из seo.jobs и выполняет их.
//
//   npx tsx scripts/seo-worker.ts            # крутится, пока не остановишь
//   npx tsx scripts/seo-worker.ts --once     # разобрать очередь и выйти
//
// Запуск конвейера идёт из CRM: кнопка кладёт задачу, воркер её подхватывает.
// Пока воркер не запущен, задачи просто ждут в очереди — это видно на экране «Статьи».
import { config } from 'dotenv'; import path from 'path'; import os from 'os'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { runStep } from '../lib/seo/steps'
import '../lib/seo/steps-article'   // регистрация шагов производства статьи

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const ONCE = process.argv.includes('--once')
const WORKER = `${os.hostname()}:${process.pid}`

async function claim(limit = 1): Promise<any[]> {
  const { data, error } = await seo.rpc('claim_jobs', { p_worker: WORKER, p_limit: limit })
  if (error) throw new Error(`claim_jobs: ${error.message}`)
  return data ?? []
}

async function complete(id: number, outcome: string, result: any) {
  const { error } = await seo.rpc('complete_job', { p_job_id: id, p_outcome: outcome, p_result: result ?? {} })
  if (error) console.error(`  complete_job: ${error.message}`)
}

async function main() {
  console.log(`Воркер ${WORKER}${ONCE ? ' (разовый прогон)' : ''}. Ctrl+C — остановить.`)
  let idle = 0
  for (;;) {
    const jobs = await claim(1)
    if (!jobs.length) {
      if (ONCE) { console.log('Очередь пуста.'); return }
      idle++
      if (idle % 12 === 1) console.log('  очередь пуста, жду…')
      await new Promise((r) => setTimeout(r, 5000))
      continue
    }
    idle = 0
    for (const job of jobs) {
      const started = Date.now()
      console.log(`→ ${job.step} #${job.id}${job.article_id ? ` (статья ${job.article_id})` : ''}`)
      try {
        const res = await runStep(job as any, seo as any)
        await complete(job.id, res.outcome, res.result)
        const secs = ((Date.now() - started) / 1000).toFixed(0)
        console.log(`  ${res.outcome === 'done' ? '✓' : '✗'} ${res.outcome} за ${secs} c ${JSON.stringify(res.result ?? {})}`)
      } catch (e: any) {
        await complete(job.id, 'failed', { error: e?.message ?? String(e) })
        console.error(`  ✗ ${e?.message ?? e}`)
      }
    }
  }
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
