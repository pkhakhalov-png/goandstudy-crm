import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { runStep, hasStep, registeredSteps } from '@/lib/seo/steps'
import { outcomeFor } from '@/lib/seo/failure'
import { heartbeatAll } from '@/lib/seo/lease'
import '@/lib/seo/steps-article'   // регистрация шагов производства статьи
import '@/lib/seo/steps-freshness'   // наблюдение за источниками и планы правки
import '@/lib/seo/steps-legacy'      // правка опубликованного архива

// Воркер SEO-очереди (PRD 10.3). Вызывается pg_cron через pg_net раз в минуту.
// Тики МОГУТ пересекаться — конкуренция регулируется в БД (claim_jobs, SKIP LOCKED).
export const runtime = 'nodejs'
export const maxDuration = 300

const TIME_BUDGET_MS = 240_000   // ≤240 c, остаток возвращаем в pending
const BATCH = 5

/** Версия обработчика — по ней в расследовании видно, что именно выполняло задачу. */
const HANDLER_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'

/**
 * Завершение задачи с предъявлением номера выдачи.
 *
 * Номер отсекает воскресшего исполнителя: если аренду успели отобрать и задачу
 * ведёт другой, база отклонит запись. Пока миграция аренды не применена,
 * четвёртого аргумента у функции нет — тогда работаем по-старому, а не встаём.
 */
async function finish(seo: any, job: any, outcome: string, result: any) {
  const { error } = await seo.rpc('complete_job', {
    p_job_id: job.id, p_outcome: outcome, p_result: result ?? {},
    p_fencing_token: job.fencing_token ?? null,
  })
  if (error && /complete_job|function|schema cache/i.test(error.message)) {
    await seo.rpc('complete_job', { p_job_id: job.id, p_outcome: outcome, p_result: result ?? {} })
  }
}

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
const SERVER_ONLY_STEPS = new Set(['article_publish_blog', 'link_insert_theme', 'content_legacy_fix'])
const canRunHere = (step: string) => !(process.env.VERCEL && SERVER_ONLY_STEPS.has(step))

const QUICK_ARTICLE_STEPS = new Set(['article_index_check', 'article_autostart', 'attribution_stitch', 'alerts_check', 'article_autopublish'])
/**
 * Наблюдение за источниками модель не зовёт, но ходит по чужим серверам: одно
 * наблюдение это robots.txt и страница, по двадцать секунд таймаута каждая.
 * Начинать такой обход под конец бюджета нельзя по той же причине, что и
 * генерацию, — поэтому он в длинных, хотя и дешёвый.
 */
const LONG_OTHER_STEPS = new Set(['content_freshness_check'])
const isLongStep = (step: string) =>
  LONG_OTHER_STEPS.has(step) || (step.startsWith('article_') && !QUICK_ARTICLE_STEPS.has(step))

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
        { step: 'attribution_stitch', lane: 'findings', priority: 18, payload: {} },
        { step: 'positions_snapshot', lane: 'findings', priority: 16, payload: {} },
        { step: 'yandex_sync', lane: 'findings', priority: 17, payload: {} },
      ]
      // Ограничение обязательно: без него при затыке очереди выдача обрежется
      // на тысяче строк, шаг сочтёт себя незапланированным и добавится заново
      const { data: ex } = await seo.from('jobs').select('step')
        .in('step', steps.map((s) => s.step)).in('status', ['pending', 'running', 'waiting']).limit(1000)
      const have = new Set((ex ?? []).map((e: any) => e.step))
      const toAdd = steps.filter((s) => !have.has(s.step))
      if (toAdd.length) await seo.from('jobs').insert(toAdd).throwOnError()
      await seo.from('settings').upsert({ key: 'last_auto_refresh', value: { at: new Date().toISOString() } }, { onConflict: 'key' }).throwOnError()
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
        await seo.from('jobs').insert({ step: 'article_autostart', lane: 'production', priority: 15, payload: {} }).throwOnError()
      }
      // Заодно проверяем, не сломалось ли что-нибудь: раз в час — нормальная
      // частота, чтобы узнать о беде до утра и не превратить это в шум
      const { data: al } = await seo.from('jobs').select('id')
        .eq('step', 'alerts_check').in('status', ['pending', 'running', 'waiting']).limit(1)
      if (!al?.length) {
        await seo.from('jobs').insert({ step: 'alerts_check', lane: 'findings', priority: 12, payload: {} }).throwOnError()
      }

      // Самостоятельный выпуск. Шаг дешёвый и сам решает, пора ли: суточный
      // предел он считает по факту публикаций, а не по расписанию
      const { data: ap } = await seo.from('jobs').select('id')
        .eq('step', 'article_autopublish').in('status', ['pending', 'running', 'waiting']).limit(1)
      if (!ap?.length) {
        await seo.from('jobs').insert({ step: 'article_autopublish', lane: 'production', priority: 14, payload: {} }).throwOnError()
      }
      // Свежесть фактов. Шаг сам смотрит, у каких источников вышел срок, и
      // молча ничего не делает, если не вышел ни у одного. Раз в час, потому
      // что критичные источники — визы, дедлайны — смотрятся каждые шесть, а за
      // один прогон разбирается пять штук: реже значит отставать от расписания.
      //
      // Ставится безусловно. Если миграция свежести не применена, задача упадёт
      // с прямым указанием, какой файл применить, и это попадёт в сторожа. Тихо
      // не ставить её вовсе было бы хуже: молчание на экране читается как
      // «источники проверяются».
      const { data: fr } = await seo.from('jobs').select('id')
        .eq('step', 'content_freshness_check').in('status', ['pending', 'running', 'waiting']).limit(1)
      if (!fr?.length) {
        await seo.from('jobs').insert({ step: 'content_freshness_check', lane: 'content', priority: 13, payload: {} }).throwOnError()
      }
      await seo.from('settings').upsert({ key: 'last_autostart_check', value: { at: new Date().toISOString() } }, { onConflict: 'key' }).throwOnError()
    }
  } catch { /* поток не критичен для обработки очереди */ }

  while (Date.now() - started < TIME_BUDGET_MS) {
    // Просим только то, что умеем: маршрутизация на стороне очереди, а не
    // «взял и вернул». Пока миграция не применена, функции с тремя аргументами
    // в базе нет — тогда работаем по-старому, а не встаём целиком. Страховка
    // ниже по коду на этот случай остаётся.
    let { data: jobs, error } = await seo.rpc('claim_jobs', { p_worker: workerId, p_limit: BATCH, p_runner: 'vercel' })
    if (error && /claim_jobs|function|schema cache/i.test(error.message)) {
      ({ data: jobs, error } = await seo.rpc('claim_jobs', { p_worker: workerId, p_limit: BATCH }))
    }
    if (error) return NextResponse.json({ error: error.message, processed }, { status: 500 })
    if (!jobs || jobs.length === 0) break

    // Отмечаемся за ВСЮ пачку, а не за текущую задачу.
    //
    // Пачка до пяти штук выполняется по очереди, и шаг статьи идёт до трёх с
    // половиной минут. Стучать только за выполняемую значило бы, что у
    // остальных четырёх сердце молчит всё это время — а очередь по молчанию
    // решает, что исполнитель умер, и отдаёт их другому тику. Получился бы
    // ровно тот дубль, ради исключения которого аренда и заводилась.
    const beat = heartbeatAll(seo, jobs as any[], HANDLER_VERSION)

    try {
      for (const job of jobs as any[]) {
        // Кончилось время — вернуть остаток в pending, не выполнять.
        // Для долгих шагов нужен не остаток времени, а полный запас: иначе шаг
        // начнётся и будет убит на середине.
        const need = isLongStep(job.step) ? LONG_STEP_MS : 0
        if (Date.now() - started >= TIME_BUDGET_MS - need) {
          await finish(seo, job, 'released', {})
          beat.done(job.id)
          released++
          continue
        }
        // Шаг может быть неизвестен этому воркеру: публикация в тему требует SSH,
        // и её делает воркер с ключом, а не Vercel. Возвращаем задачу в очередь,
        // а не убиваем — иначе один воркер ломает работу другого.
        if (!hasStep(job.step) || !canRunHere(job.step)) {
          await finish(seo, job, 'released', { skipped: 'этот воркер такую работу не делает' })
          beat.done(job.id)
          released++
          continue
        }
        try {
          const outcome = await runStep(job, seo)
          await finish(seo, job, outcome.outcome, outcome.result ?? {})
        } catch (e: any) {
          // Повторять имеет смысл перегрузку и обрыв связи. Нехватку денег,
          // неверный ключ и занятый слаг повторять бессмысленно — это только
          // сожжёт попытки и спрячет причину за общим «retry».
          const { outcome, result } = outcomeFor(e)
          await finish(seo, job, outcome, result)
        }
        beat.done(job.id)
        processed++
      }
    } finally {
      beat.stop()
    }
  }

  return NextResponse.json({ ok: true, worker: workerId, processed, released, steps: registeredSteps(), ms: Date.now() - started })
}
