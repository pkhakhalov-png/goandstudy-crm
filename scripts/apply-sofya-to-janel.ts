import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const JANEL = '532db56c-b7de-4003-9fb4-80bcd483d160'
const MOVE = [123, 117, 35, 33, 56, 109, 99]

async function dump(label: string) {
  const { data: cl } = await sb.from('clients').select('id, name, curator_id').in('id', MOVE).order('id')
  const { data: ex } = await sb.from('expenses').select('id, client_id, who, plan_sum, is_paid, note').eq('article','curator').in('client_id', MOVE).order('client_id')
  console.log(`\n===== ${label} =====`)
  for (const c of cl ?? []) {
    console.log(`id=${c.id} | ${c.name} | curator=${c.curator_id === JANEL ? 'ЖАНЕЛЬ' : c.curator_id}`)
    for (const e of (ex ?? []).filter(x => x.client_id === c.id))
      console.log(`    exp#${e.id} who=${e.who || '—'} | ${Number(e.plan_sum).toLocaleString('ru')}₽ | ${e.is_paid ? 'ОПЛАЧЕН' : 'не оплачен'} | ${e.note || ''}`)
  }
}

async function main() {
  await dump('ДО')

  // 1) сменить куратора у клиентов
  const { error: e1 } = await sb.from('clients').update({ curator_id: JANEL }).in('id', MOVE)
  if (e1) { console.error('clients update error:', e1.message); process.exit(1) }

  // 2) неоплаченные curator-выплаты → who='Жанель'
  const { data: upd, error: e2 } = await sb.from('expenses')
    .update({ who: 'Жанель' }).eq('article','curator').eq('is_paid', false).in('client_id', MOVE).select('id')
  if (e2) { console.error('expenses update error:', e2.message); process.exit(1) }
  console.log(`\n✓ неоплаченных выплат переназначено на Жанель: ${upd?.length ?? 0}`)

  // 3) Кристина Козлова (56): создать этап2, если неоплаченного curator-расхода ещё нет
  const { data: kUnpaid } = await sb.from('expenses').select('id').eq('client_id', 56).eq('article','curator').eq('is_paid', false)
  if ((kUnpaid?.length ?? 0) === 0) {
    const { error: e3 } = await sb.from('expenses').insert({
      client_id: 56, article: 'curator', who: 'Жанель', plan_sum: 25000,
      is_paid: false, status: 'pending', note: 'Куратор — этап 2',
    })
    if (e3) { console.error('kristina insert error:', e3.message); process.exit(1) }
    console.log('✓ Кристина (56): создан этап2 25 000 ₽ на Жанель')
  } else {
    console.log('• Кристина (56): неоплаченный curator-расход уже есть — этап2 не создаю')
  }

  await dump('ПОСЛЕ')
}
main().catch(e=>{console.error(e);process.exit(1)})
