import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const id = 76
  const { data: c } = await sb.from('clients').select('*').eq('id', id).single()
  console.log('client:', JSON.stringify({
    id: c.id, name: c.name, country: c.country, status: c.status, curator_id: c.curator_id,
    current_stage_code: c.current_stage_code, onboarded: c.onboarded,
    project_data_keys: c.project_data ? Object.keys(c.project_data) : null,
    roadmap_data_keys: c.roadmap_data ? Object.keys(c.roadmap_data) : null,
  }, null, 2))

  const tables = ['client_universities', 'client_scholarships', 'client_documents', 'client_essays', 'client_applications', 'client_activities']
  for (const t of tables) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('client_id', id)
    console.log(`${t}: ${error ? error.message : count ?? 0} rows`)
  }
}
main().catch(console.error)
