import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { count: total } = await sb.from('programs').select('id', { count: 'exact', head: true }).eq('source', 'applyboard')
  const { count: withStart } = await sb.from('programs').select('id', { count: 'exact', head: true }).eq('source', 'applyboard').not('start_date_text', 'is', null)
  const { count: withDeadline } = await sb.from('programs').select('id', { count: 'exact', head: true }).eq('source', 'applyboard').not('deadline_text', 'is', null)
  const pct = total ? Math.round((withStart || 0) * 100 / total) : 0
  console.log(`applyboard: ${withStart}/${total} (${pct}%) с start_date_text`)
  console.log(`applyboard: ${withDeadline}/${total} с deadline_text`)
}
main()
