/**
 * Возвращает в очередь упавшие задачи производства статей.
 *
 *   npx tsx scripts/seo-requeue-drafts.ts                 # показать
 *   npx tsx scripts/seo-requeue-drafts.ts --confirm       # вернуть все
 *   npx tsx scripts/seo-requeue-drafts.ts --confirm --ids 1097
 *
 * Зачем скриптом: задача с status='failed' сама не оживает — очередь берёт
 * только pending. После починки кода восемь статей так и остались бы висеть.
 *
 * Payload не трогаем: в нём лежит бриф и контекст, ради которых шаг и падал
 * на полпути. Мёртвый ctx.spend внутри теперь безвреден — шаг восстанавливает
 * привязку учёта от живого клиента (reviveSpend в steps-article.ts).
 */
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const c = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)
const seo = c.schema('seo')
const CONFIRM = process.argv.includes('--confirm')
const idsArg = process.argv[process.argv.indexOf('--ids') + 1]
const ONLY = process.argv.includes('--ids') ? idsArg.split(',').map(Number) : null
const STEP = process.argv.includes('--step') ? process.argv[process.argv.indexOf('--step') + 1] : 'article_draft'

async function main() {
  const { data: jobs } = await seo.from('jobs')
    .select('id, step, article_id, status, attempts, last_error, created_at')
    .eq('step', STEP).eq('status', 'failed').order('id')
  const list = (jobs ?? []).filter(j => !ONLY || ONLY.includes(j.id))
  console.log(`Упавших «${STEP}»: ${jobs?.length ?? 0}${ONLY ? `, выбрано ${list.length}` : ''}\n`)

  for (const j of list) {
    const { data: a } = await seo.from('articles')
      .select('id, primary_keyword, status, current_version_id').eq('id', j.article_id).maybeSingle()
    if (a?.current_version_id) {
      console.log(` ↺ #${j.id} статья #${a.id} «${a.primary_keyword}» уже написана — пропускаю`)
      continue
    }
    console.log(` → #${j.id} статья #${j.article_id} «${a?.primary_keyword ?? '?'}» (${String(j.created_at).slice(0, 10)}, было: ${j.last_error})`)
    if (CONFIRM) {
      const { error } = await seo.from('jobs').update({
        status: 'pending', attempts: 0, last_error: null,
        next_run_at: new Date().toISOString(),
        locked_at: null, locked_by: null, lease_expires_at: null,
      }).eq('id', j.id)
      if (error) { console.error(`   ✗ ${error.message}`); process.exit(1) }
    }
  }

  if (!CONFIRM) console.log('\n⚠️ Показ. Запусти с --confirm.')
  else console.log('\n✓ возвращены в очередь — воркер разберёт их по тику (раз в минуту, по одной долгой задаче за тик)')
}
main().catch(e => { console.error(e); process.exit(1) })
