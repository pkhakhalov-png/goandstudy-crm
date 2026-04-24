import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const URL = process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_PARSER_SUPABASE_ANON_KEY
const SRV = process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY

console.log('URL:', URL)
console.log('ANON set:', !!ANON)
console.log('SERVICE set:', !!SRV)
console.log('')

async function test(label: string, key: string) {
  const c = createClient(URL!, key, { auth: { persistSession: false } })
  const { data, error, count } = await c
    .from('schools')
    .select('id, name', { count: 'exact' })
    .limit(3)
  console.log(`[${label}]`)
  if (error) console.log('  ERROR:', error.message)
  else console.log('  count:', count, 'sample:', data?.map(r => r.name).join(', '))
  console.log('')
}

async function main() {
  await test('ANON key', ANON!)
  await test('SERVICE key', SRV!)
}
main()
