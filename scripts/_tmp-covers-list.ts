import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any
async function main() {
  const { data: arts } = await seo.from('articles')
    .select('id, status, published_at, current_version_id')
    .gte('published_at', '2026-09-11')
    .order('published_at')
  console.log(`статей с 11 сентября: ${arts?.length ?? 0}\n`)
  for (const a of arts ?? []) {
    const { data: v } = await seo.from('article_versions').select('title, meta').eq('id', a.current_version_id).single()
    const m: any = v?.meta ?? {}
    console.log(`${String(a.published_at).slice(0, 10)}  ${m.slug}`)
    console.log(`   «${v?.title}»`)
    console.log(`   сцена: ${m.images?.scenes?.cover ?? '— нет в базе —'}`)
    console.log(`   обложка: ${m.cover?.bytes ?? '?'} байт ${m.cover?.width}×${m.cover?.height}${m.cover?.replaced_by_human ? ' (менялась руками)' : ''}\n`)
  }
}
main()
