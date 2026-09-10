import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const MISSING = ['Фроловичев','Мигаль','Таисия','Самира','Чикуров','Малика','Жантуева','Мия','Линникова','Жураев']
const norm = (s: string) => (s || '').toLowerCase().replace(/ё/g,'е')
async function main() {
  const { data: curs } = await sb.from('curators').select('id, name')
  const cmap = new Map((curs ?? []).map(c => [c.id, c.name]))
  const { data: clients } = await sb.from('clients').select('id, name, status, curator_id')
  console.log(`Всего клиентов в базе: ${clients?.length ?? 0}\n`)
  for (const term of MISSING) {
    const t = norm(term)
    const hits = (clients ?? []).filter(c => norm(c.name).includes(t))
    if (!hits.length) { console.log(`❌ «${term}» — нет ни у кого`); continue }
    console.log(`🔎 «${term}»:`)
    for (const h of hits) console.log(`   id=${h.id} | ${h.name} | ${h.status} | куратор: ${h.curator_id ? (cmap.get(h.curator_id) || h.curator_id) : '— НЕ НАЗНАЧЕН'}`)
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
