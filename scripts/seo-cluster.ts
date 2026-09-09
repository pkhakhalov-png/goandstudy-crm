// Кластеризация страниц (spherical k-means по эмбеддингам) прямо против прод-БД,
// без деплоя воркера. Пишет seo.pages.cluster. Аргумент: k (0/пусто → авто-подбор).
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { computeClusters } from '../lib/seo/cluster'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')

async function main() {
  const k = Number(process.argv[2]) || 0
  const res = await computeClusters(seo as any, { k })
  console.log(`✓ k=${res.k} · связность(cos)=${res.cohesion} · кластеров=${res.distribution.length}`)
  for (const c of res.distribution) console.log(`  ${String(c.count).padStart(3)}  ${c.name}`)
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
