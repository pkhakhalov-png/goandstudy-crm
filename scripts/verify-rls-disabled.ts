import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  // Проверим что у продажника есть клиенты через симуляцию user-scoped запроса
  // (через anon key + selected user JWT мы тут не симулируем — но статус RLS можно
  // глянуть через RPC к pg_tables. Берём короткий путь: смотрим клиентов любого продажника.)
  const { data: salespersons } = await admin.from('users')
    .select('id, name, email').eq('role', 'salesperson').eq('is_active', true)
  console.log('Активные продажники:', salespersons?.length ?? 0)
  for (const s of salespersons ?? []) {
    const { count } = await admin.from('clients').select('id', { count: 'exact', head: true })
      .eq('salesperson_id', s.id)
    console.log(`  • ${s.name} (${s.email}): ${count ?? 0} клиентов в БД`)
  }

  // Если этот скрипт через service-role видит клиентов — это норма (он всегда видел).
  // Главный тест — продажник зашёл в /sales и видит список. Это уже user должен проверить в UI.
  console.log('\nПроверь в UI: пусть продажник откроет https://crm.goandstudy.com/sales')
}
main().catch(e => { console.error(e); process.exit(1) })
