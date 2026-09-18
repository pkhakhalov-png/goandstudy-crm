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
import { runStep, hasStep } from '../lib/seo/steps'
import { outcomeFor } from '../lib/seo/failure'
import { withHeartbeat } from '../lib/seo/lease'
import '../lib/seo/steps-article'   // регистрация шагов производства статьи
import '../lib/seo/steps-freshness'   // наблюдение за источниками и планы правки
import '../lib/seo/steps-legacy'      // правка опубликованного архива

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const ONCE = process.argv.includes('--once')
const WORKER = `${os.hostname()}:${process.pid}`

/**
 * Исполнитель, которым представляется этот воркер.
 *
 * Без третьего аргумента `claim_jobs` отключает отбор по исполнителю целиком, и
 * локальная машина может забрать задачу, предназначенную агенту на сервере сайта:
 * записать файлы темы отсюда нельзя, и задача зря сожжёт попытку. По умолчанию
 * берём только то, что помечено `any` или `vercel` — ровно то же, что умеет тик.
 */
const RUNNER = process.env.SEO_WORKER_RUNNER || 'vercel'

async function claim(limit = 1): Promise<any[]> {
  const { data, error } = await seo.rpc('claim_jobs', { p_worker: WORKER, p_limit: limit, p_runner: RUNNER })
  if (error) throw new Error(`claim_jobs: ${error.message}`)
  return data ?? []
}

/** Версия обработчика — по ней в расследовании видно, что именно выполняло задачу. */
const HANDLER_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'

async function complete(job: any, outcome: string, result: any) {
  const { data, error } = await seo.rpc('complete_job', {
    p_job_id: job.id, p_outcome: outcome, p_result: result ?? {},
    p_fencing_token: job.fencing_token ?? null,
  })
  if (error) {
    // Четвёртого аргумента нет — миграция аренды ещё не применена. Пробуем
    // по-старому, иначе воркер встанет из-за неприменённой миграции.
    if (/complete_job|function|schema cache/i.test(error.message)) {
      const { error: legacy } = await seo.rpc('complete_job', { p_job_id: job.id, p_outcome: outcome, p_result: result ?? {} })
      if (legacy) console.error(`  complete_job: ${legacy.message}`)
      return
    }
    console.error(`  complete_job: ${error.message}`)
    return
  }
  // false означает, что аренду отобрали и задачу ведёт кто-то другой
  if (data === false) console.error(`  ⚠ результат #${job.id} отклонён: аренда просрочена`)
}

async function main() {
  console.log(`Воркер ${WORKER} как «${RUNNER}»${ONCE ? ' (разовый прогон)' : ''}. Ctrl+C — остановить.`)
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
      if (!hasStep(job.step)) {
        await complete(job, 'released', { skipped: 'нет обработчика у этого воркера' })
        console.log(`  ↩ ${job.step} не мой шаг — вернул в очередь`)
        continue
      }
      try {
        const { value: res } = await withHeartbeat(seo, job, HANDLER_VERSION, () => runStep(job as any, seo as any))
        await complete(job, res.outcome, res.result)
        const secs = ((Date.now() - started) / 1000).toFixed(0)
        console.log(`  ${res.outcome === 'done' ? '✓' : '✗'} ${res.outcome} за ${secs} c ${JSON.stringify(res.result ?? {})}`)
      } catch (e: any) {
        // Перегрузку модели и обрыв связи имеет смысл повторить, нехватку денег
        // и неверный ключ — нет. Тик на Vercel разбирает это давно; здесь
        // ошибка признавалась окончательной всегда, и временная беда при ручном
        // прогоне убивала задачу насовсем.
        const { outcome, result } = outcomeFor(e)
        await complete(job, outcome, result)
        console.error(`  ✗ ${outcome === 'retry' ? 'повторим: ' : ''}${e?.message ?? e}`)
      }
    }
  }
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
