import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// Целевой список клиентов (перенос София → Жанель). Матчим по подстроке.
const TARGETS = [
  'Егор Ефимов', 'Даниил Фроловичев', 'Никита Соколов', 'Демид Мигаль',
  'Таисия', 'Самира', 'Глеб Чикуров', 'Малика', 'Диана Жантуева', 'Мия',
  'Кристина Козлова', 'Глеб Мирошниченко', 'София Ретинская', 'Анна Линникова', 'Тимур Жураев',
]

const norm = (s: string) => (s || '').toLowerCase().replace(/ё/g, 'е').trim()

async function main() {
  // 1) Кандидаты в кураторы София / Жанель
  const { data: curs } = await sb.from('curators').select('id, name, contact, user_id, is_active')
  console.log('=== КУРАТОРЫ (кандидаты) ===')
  for (const c of curs ?? []) {
    const n = norm(c.name)
    if (n.includes('соф') || n.includes('sof') || n.includes('жанел') || n.includes('janel') || n.includes('sabit'))
      console.log(`  ${c.is_active ? '✓' : '✕'} id=${c.id} | ${c.name} | ${c.contact || '—'} | user_id=${c.user_id ? 'есть' : 'НЕТ'}`)
  }

  // Определяем Софию (первый активный куратор с 'соф')
  const sofya = (curs ?? []).find(c => { const n = norm(c.name); return n.includes('соф') || n.includes('sof') })
  if (!sofya) { console.log('\n⚠ Куратор София не найден — уточни имя'); return }
  console.log(`\n>>> София = id=${sofya.id} (${sofya.name})`)

  // 2) Все клиенты Софии
  const { data: sofClients } = await sb.from('clients')
    .select('id, name, status, curator_id, expected_offer_month')
    .eq('curator_id', sofya.id)
    .order('name')
  console.log(`\n=== ВСЕ КЛИЕНТЫ СОФИИ (${sofClients?.length ?? 0}) ===`)
  for (const c of sofClients ?? []) console.log(`  id=${String(c.id).padStart(4)} | ${c.name} | ${c.status}`)

  // 3) Сопоставление целевого списка + выплаты
  const ids = (sofClients ?? []).map(c => c.id)
  const { data: exps } = ids.length
    ? await sb.from('expenses').select('id, client_id, article, who, plan_sum, is_paid, note').eq('article', 'curator').in('client_id', ids)
    : { data: [] as any[] }
  const expByClient = new Map<number, any[]>()
  for (const e of exps ?? []) { if (!expByClient.has(e.client_id)) expByClient.set(e.client_id, []); expByClient.get(e.client_id)!.push(e) }

  console.log('\n=== СОПОСТАВЛЕНИЕ ЦЕЛЕВОГО СПИСКА ===')
  const matchedIds = new Set<number>()
  for (const t of TARGETS) {
    const tn = norm(t)
    const parts = tn.split(/\s+/)
    const hits = (sofClients ?? []).filter(c => {
      const cn = norm(c.name)
      return parts.every(p => cn.includes(p))
    })
    if (hits.length === 0) { console.log(`\n❓ «${t}» — НЕ НАЙДЕН среди клиентов Софии`); continue }
    if (hits.length > 1) console.log(`\n⚠ «${t}» — НЕСКОЛЬКО совпадений (${hits.length}), уточни:`)
    for (const h of hits) {
      matchedIds.add(h.id)
      const ce = expByClient.get(h.id) ?? []
      const parts2 = ce.map(e => `${e.note || e.article}: ${Number(e.plan_sum).toLocaleString('ru')}₽ ${e.is_paid ? 'ОПЛАЧЕН✓' : 'не оплачен'}`)
      console.log(`\n• «${t}» → id=${h.id} | ${h.name} | ${h.status}`)
      if (ce.length === 0) console.log('    curator-расходов НЕТ (нечего переносить)')
      for (const p of parts2) console.log(`    ${p}`)
    }
  }

  // 4) Клиенты Софии вне целевого списка (останутся у неё)
  const rest = (sofClients ?? []).filter(c => !matchedIds.has(c.id))
  console.log(`\n=== ОСТАНУТСЯ У СОФИИ (вне списка, ${rest.length}) ===`)
  for (const c of rest) console.log(`  id=${c.id} | ${c.name}`)
}
main().catch(e => { console.error(e); process.exit(1) })
