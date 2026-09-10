// Применение готовых предложений schema.org (seo.page_schema, status='proposed')
// к реальным страницам сайта через WP Bridge.
//
//   npx tsx scripts/seo-apply-schema.ts                    # сухой прогон, ничего не меняет
//   npx tsx scripts/seo-apply-schema.ts --apply            # записать на сайт
//   npx tsx scripts/seo-apply-schema.ts --apply --limit 10 # только самые важные
//   npx tsx scripts/seo-apply-schema.ts --url <URL> --apply # одна конкретная страница
//
// Порядок — по показам из GSC (сначала страницы, которые реально видят люди).
// Мост печатает JSON-LD из меты _gs_schema, поэтому запись меты = разметка на странице.
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { wp, wpConfigured } from '../lib/seo/wp'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

const APPLY = process.argv.includes('--apply')
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > -1 ? parseInt(process.argv[i + 1], 10) || 0 : 0 })()
const ONLY_URL = (() => { const i = process.argv.indexOf('--url'); return i > -1 ? process.argv[i + 1] : null })()

async function main() {
  if (!wpConfigured()) { console.error('✗ Нет WP_BASE_URL / WP_BRIDGE_SECRET в .env.local'); process.exit(1) }

  const { data: props, error: e1 } = await seo.from('page_schema')
    .select('id, page_id, schema_type, jsonld').eq('status', 'proposed')
  if (e1) throw new Error(`page_schema: ${e1.message}`)
  if (!props?.length) { console.log('Нечего применять: предложений со статусом proposed нет.'); return }

  const ids = [...new Set(props.map((p) => p.page_id))]
  const { data: pages, error: e2 } = await seo.from('pages')
    .select('id, url, normalized_url, wp_post_id, page_type').in('id', ids)
  if (e2) throw new Error(`pages: ${e2.message}`)
  const byId = new Map((pages ?? []).map((p) => [p.id, p]))

  // приоритет по показам — берём из находок missing_schema, они уже посчитаны
  const { data: fnd } = await seo.from('findings')
    .select('page_ids, evidence').eq('kind', 'missing_schema').eq('status', 'open')
  const impressions = new Map<number, number>()
  for (const f of fnd ?? []) {
    const imp = Number((f as any).evidence?.impressions ?? 0)
    for (const pid of (f as any).page_ids ?? []) impressions.set(pid, Math.max(impressions.get(pid) ?? 0, imp))
  }

  let queue = props
    .map((p) => ({ ...p, page: byId.get(p.page_id), imp: impressions.get(p.page_id) ?? 0 }))
    .filter((p) => p.page)
    .sort((a, b) => b.imp - a.imp)
  if (ONLY_URL) {
    const want = ONLY_URL.replace(/\/$/, '')
    queue = queue.filter((p) => String(p.page!.url ?? p.page!.normalized_url).replace(/\/$/, '') === want)
    if (!queue.length) { console.error(`✗ для ${ONLY_URL} предложения schema нет`); process.exit(1) }
  }
  if (LIMIT > 0) queue = queue.slice(0, LIMIT)

  console.log(`Предложений: ${props.length}, к обработке: ${queue.length}${APPLY ? '' : '  (СУХОЙ ПРОГОН — --apply чтобы записать)'}\n`)

  let ok = 0, missing = 0, failed = 0
  for (const item of queue) {
    const url = item.page!.url || item.page!.normalized_url
    const head = `${String(item.imp).padStart(6)} показ.  ${item.schema_type.padEnd(24)} ${url}`

    if (!APPLY) { console.log(`${head}  ${item.page!.wp_post_id ? `post_id=${item.page!.wp_post_id}` : 'post_id: определится при --apply'}`); continue }

    try {
      let postId = item.page!.wp_post_id as number | null
      if (!postId) {
        const r = await wp.resolve(url)
        if (!r.found || !r.post_id) { console.log(`${head}  → ✗ страница не найдена в WP`); missing++; continue }
        postId = r.post_id
        await seo.from('pages').update({ wp_post_id: postId }).eq('id', item.page_id)
      }
      await wp.patchPost(postId, { schema: item.jsonld, idempotency_key: `schema:${item.id}` })
      await seo.from('page_schema').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', item.id)
      console.log(`${head}  → ✓ post_id=${postId}`)
      ok++
    } catch (err: any) {
      console.log(`${head}  → ✗ ${err.message || err}`)
      failed++
    }
  }

  if (APPLY) console.log(`\nПрименено: ${ok} | не найдено в WP: ${missing} | ошибок: ${failed}`)
}
main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
