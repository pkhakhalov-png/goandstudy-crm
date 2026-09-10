import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// Каждая запись: искомые токены (все должны входить в имя клиента)
const TARGETS: { label: string; tokens: string[] }[] = [
  { label: 'Артадов Артём', tokens: ['артадов'] },
  { label: 'Волошина Елизавета', tokens: ['волошина'] },
  { label: 'Франк София', tokens: ['франк'] },
  { label: 'Нугаманова Кира', tokens: ['нугаманова'] },
  { label: 'Сабрина Сидики', tokens: ['сидики'] },
  { label: 'Камалова Каролина', tokens: ['камалова'] },
  { label: 'Анастасия Видру', tokens: ['видру'] },
  { label: 'Михаил Нессонов', tokens: ['нессонов'] },
  { label: 'Владимир Соколов', tokens: ['владимир', 'соколов'] },
  { label: 'Михаил Лихтар', tokens: ['лихтар'] },
  { label: 'Безус Юлия', tokens: ['безус'] },
]
const norm = (s: string) => (s || '').toLowerCase().replace(/ё/g, 'е')

async function main() {
  const { data: curs } = await sb.from('curators').select('id, name')
  const cmap = new Map((curs ?? []).map(c => [c.id, c.name]))
  const { data: clients } = await sb.from('clients').select('id, name, status, curator_id')
  const matchedIds: number[] = []

  for (const t of TARGETS) {
    const hits = (clients ?? []).filter(c => t.tokens.every(tok => norm(c.name).includes(tok)))
    if (!hits.length) { console.log(`\n❌ «${t.label}» — не найден`); continue }
    if (hits.length > 1) console.log(`\n⚠ «${t.label}» — НЕСКОЛЬКО (${hits.length}):`)
    for (const h of hits) {
      matchedIds.push(h.id)
      const { data: pays } = await sb.from('payments').select('plan_sum, fact_sum, is_paid').eq('client_id', h.id)
      const { data: exps } = await sb.from('expenses').select('plan_sum, fact_sum, is_paid, article').eq('client_id', h.id)
      const paidIn = (pays ?? []).filter(p => p.is_paid).reduce((s, p) => s + Number(p.fact_sum || p.plan_sum || 0), 0)
      const unpaidIn = (pays ?? []).filter(p => !p.is_paid).reduce((s, p) => s + Number(p.plan_sum || 0), 0)
      const paidOut = (exps ?? []).filter(e => e.is_paid).reduce((s, e) => s + Number(e.fact_sum || e.plan_sum || 0), 0)
      const unpaidOut = (exps ?? []).filter(e => !e.is_paid).reduce((s, e) => s + Number(e.plan_sum || 0), 0)
      console.log(`\n• «${t.label}» → id=${h.id} | ${h.name} | ${h.status} | куратор: ${h.curator_id ? (cmap.get(h.curator_id) || '?') : '—'}`)
      console.log(`    Приход: получено ${paidIn.toLocaleString('ru')} | ДОЛЖНЫ нам (unpaid) ${unpaidIn.toLocaleString('ru')}  [${pays?.length||0} платежей]`)
      console.log(`    Расход: выплачено ${paidOut.toLocaleString('ru')} | МЫ должны (unpaid) ${unpaidOut.toLocaleString('ru')}  [${exps?.length||0} расходов]`)
    }
  }
  console.log(`\n\nИтого сопоставлено клиентов: ${matchedIds.length}`)
  console.log('IDs:', matchedIds.join(', '))
}
main().catch(e => { console.error(e); process.exit(1) })
