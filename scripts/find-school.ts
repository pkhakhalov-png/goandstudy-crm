import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const q = process.argv[2] || 'Birmingham'
  const { data } = await parser.from('schools').select('id, name').ilike('name', `%${q}%`).limit(20)
  console.log(data)
}
main()
