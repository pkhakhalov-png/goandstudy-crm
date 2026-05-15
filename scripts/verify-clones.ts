import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  for (const id of [83, 84, 85, 86, 87, 88]) {
    const c = (await sb.from('clients').select('id, name, curator_id').eq('id', id).single()).data
    const u = (await sb.from('client_universities').select('*', { count: 'exact', head: true }).eq('client_id', id)).count
    const s = (await sb.from('client_scholarships').select('*', { count: 'exact', head: true }).eq('client_id', id)).count
    const e = (await sb.from('client_essays').select('*', { count: 'exact', head: true }).eq('client_id', id)).count
    const a = (await sb.from('client_applications').select('*', { count: 'exact', head: true }).eq('client_id', id)).count
    console.log(`#${id} ${c?.name}: shortlist=${u}, scholarships=${s}, essays=${e}, applications=${a}`)
  }
}
main()
