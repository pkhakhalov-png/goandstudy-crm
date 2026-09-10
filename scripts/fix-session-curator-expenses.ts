import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// Клиенты экспертной сессии (15 000 ₽, 1 платёж), которым система ошибочно
// поставила 2×25 000 куратору. Должно быть одна выплата 7 500 ₽.
const SESSION_CLIENTS = [89, 127] // Ася П., Ирина Набатчикова

async function main() {
  const { data: curators } = await db.from('curators').select('id, name')
  const curName = (id: any) => (curators || []).find(c => c.id === id)?.name || null

  for (const cid of SESSION_CLIENTS) {
    const { data: c } = await db.from('clients').select('id, name, curator_id').eq('id', cid).single()
    if (!c) { console.log(`client ${cid} не найден, пропуск`); continue }

    // Не трогаем уже выплаченные строки — только pending
    const { data: curExp } = await db.from('expenses')
      .select('id, plan_sum, is_paid').eq('client_id', cid).eq('article', 'curator')
    const paid = (curExp || []).filter(e => e.is_paid)
    if (paid.length > 0) {
      console.log(`  ! ${c.name}: есть выплаченные curator-расходы (${paid.length}) — пропускаю, проверь вручную`)
      continue
    }

    // Удаляем старые 2×25000 (все pending curator)
    const ids = (curExp || []).map(e => e.id)
    if (ids.length) await db.from('expenses').delete().in('id', ids)

    // Вставляем одну выплату 7500
    const { data: pay } = await db.from('payments').select('plan_date').eq('client_id', cid).order('num').limit(1).single()
    const planDate = pay?.plan_date || new Date().toISOString().split('T')[0]
    const who = curName(c.curator_id)
    const { error } = await db.from('expenses').insert({
      client_id: cid, article: 'curator', who, plan_date: planDate, plan_sum: 7500, is_paid: false, status: 'pending', note: 'Куратор — экспертная сессия',
    })
    if (error) { console.log(`  ERR ${c.name}:`, error.message); continue }
    console.log(`  OK  ${c.name}: удалено ${ids.length} стар., добавлено 1×7500₽ (who=${who ?? 'NULL'})`)

    // Проставим service_type, если колонка уже есть (после миграции)
    const { error: stErr } = await db.from('clients').update({ service_type: 'session' } as any).eq('id', cid)
    if (stErr) console.log(`    (service_type не проставлен — миграция ещё не применена: ${stErr.message})`)
    else console.log(`    service_type -> 'session'`)
  }
}
main()
