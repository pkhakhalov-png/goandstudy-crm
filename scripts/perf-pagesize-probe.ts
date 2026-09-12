// Сколько строк сервер отдаёт за один запрос, если попросить больше тысячи.
// От этого зависит, сколько походов нужно на большую таблицу.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  for (const size of [1000, 5000, 10000, 25000]) {
    const t0 = Date.now()
    const { data, error } = await sb.from('deal_messages')
      .select('id, deal_id, direction, created_at').order('id').range(0, size - 1)
    const ms = Date.now() - t0
    const bytes = data ? JSON.stringify(data).length : 0
    console.log(`просили ${String(size).padStart(6)} → получили ${String(data?.length ?? 0).padStart(6)}`
      + ` за ${String(ms).padStart(5)} мс · ${(bytes / 1024).toFixed(0)} КБ${error ? ' · ошибка: ' + error.message : ''}`)
  }
}
main()
