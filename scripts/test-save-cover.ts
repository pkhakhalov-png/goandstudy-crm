import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const parser = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function main() {
  const SCHOOL_ID = 2487  // Edinburgh Napier — что был на скриншоте
  const TEST_URL = 'https://example.com/test-cover.jpg'

  const { data: before } = await parser.from('schools').select('raw_data, name').eq('id', SCHOOL_ID).maybeSingle()
  if (!before) { console.log('школа не найдена'); return }
  console.log(`Школа: ${before.name}`)
  console.log(`До: curator_extras =`, JSON.stringify((before.raw_data as any)?.curator_extras))

  const rawData = (before.raw_data as any) || {}
  const extras = { ...(rawData.curator_extras || {}) }
  extras.cover_photo_url = TEST_URL
  extras.cover_photo_by = { by_name: 'TEST SCRIPT', at: new Date().toISOString() }
  rawData.curator_extras = extras

  const { error } = await parser.from('schools').update({ raw_data: rawData }).eq('id', SCHOOL_ID)
  if (error) { console.error('UPDATE ERROR:', error); return }

  const { data: after } = await parser.from('schools').select('raw_data').eq('id', SCHOOL_ID).maybeSingle()
  console.log(`После: curator_extras =`, JSON.stringify((after?.raw_data as any)?.curator_extras))

  // Откат
  delete extras.cover_photo_url
  delete extras.cover_photo_by
  rawData.curator_extras = extras
  await parser.from('schools').update({ raw_data: rawData }).eq('id', SCHOOL_ID)
  console.log('✓ Тест прошёл, состояние откатилось')
}
main().catch(e => { console.error(e); process.exit(1) })
