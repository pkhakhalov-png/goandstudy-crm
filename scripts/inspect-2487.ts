import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data } = await parser.from('schools').select('id, name, campus_photo_url, raw_data').eq('id', 2487).single()
  console.log('campus_photo_url (AI):', data?.campus_photo_url)
  console.log('curator_extras.cover_photo_url:', (data?.raw_data as any)?.curator_extras?.cover_photo_url)
  console.log('curator_overrides:', JSON.stringify((data?.raw_data as any)?.curator_overrides))
}
main()
