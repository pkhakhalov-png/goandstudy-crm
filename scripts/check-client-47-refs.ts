import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const tables = ['payments', 'expenses', 'fixed_expenses', 'deals', 'tasks', 'notes']
  for (const t of tables) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('client_id', 47)
    if (error) console.log(`  ${t}: ERR ${error.message}`)
    else console.log(`  ${t}: ${count ?? 0}`)
  }
}
main().catch(console.error)
