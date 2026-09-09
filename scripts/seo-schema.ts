// Генерация предложений schema.org для страниц без разметки (§5.6) против прод-БД.
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { generateSchemaProposals } from '../lib/seo/schema-gen'
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
async function main() {
  const res = await generateSchemaProposals(seo as any)
  console.log(`✓ schema-предложений: ${res.generated}`, JSON.stringify(res.by_type))
}
main().catch((e) => { console.error(e.message || e); process.exit(1) })
