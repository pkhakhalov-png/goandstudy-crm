import { config } from 'dotenv'; import path from 'path'; import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const { data: curs } = await sb.from('curators').select('id, name')
  const cmap = new Map((curs ?? []).map(c => [c.id, c.name]))
  const { data: cl } = await sb.from('clients').select('id, name, status, curator_id').order('name')
  console.log(`Всего: ${cl?.length}\n`)
  for (const c of cl ?? []) console.log(`  ${String(c.id).padStart(4)} | ${c.status.padEnd(9)} | ${(cmap.get(c.curator_id)||'—').toString().padEnd(10)} | ${c.name}`)
}
main().catch(e=>{console.error(e);process.exit(1)})
