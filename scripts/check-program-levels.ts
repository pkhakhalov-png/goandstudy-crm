import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  for (const src of ['applyboard', 'daad', 'curator_gh', null]) {
    const q = sb.from('programs').select('id', { count: 'exact', head: true })
    const r = src ? await q.eq('source', src) : await q.is('source', null)
    console.log(`source=${src || '(null)'}: ${r.count}`)
  }
  const { count: total } = await sb.from('programs').select('id', { count: 'exact', head: true })
  console.log(`TOTAL: ${total}`)
}
main()
