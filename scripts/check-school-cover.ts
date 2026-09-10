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
  // Найдём все школы с куратором-загруженной обложкой
  const { data: schools } = await parser
    .from('schools')
    .select('id, name, campus_photo_url, raw_data')

  if (!schools) { console.log('нет school'); return }

  let withCustomCover = 0
  let withRemovedCover = 0
  for (const s of schools) {
    const extras = (s.raw_data as any)?.curator_extras || {}
    if (extras.cover_photo_url === undefined) continue  // куратор не трогал
    if (extras.cover_photo_url === null) {
      withRemovedCover++
      console.log(`#${s.id} "${s.name}" — обложка УДАЛЕНА куратором`)
      continue
    }
    withCustomCover++
    console.log(`#${s.id} "${s.name}"`)
    console.log(`  cover: ${extras.cover_photo_url}`)
    console.log(`  by:    ${JSON.stringify(extras.cover_photo_by)}`)
    console.log(`  campus_photo_url (AI): ${s.campus_photo_url || '—'}`)

    // Проверим доступность URL
    try {
      const r = await fetch(extras.cover_photo_url, { method: 'HEAD' })
      console.log(`  HEAD: ${r.status} ${r.statusText}, content-type: ${r.headers.get('content-type')}`)
    } catch (e: any) {
      console.log(`  HEAD failed: ${e.message}`)
    }
    console.log()
  }
  console.log(`\nИтого: ${withCustomCover} школ с обложкой, ${withRemovedCover} с удалённой`)
}
main().catch(e => { console.error(e); process.exit(1) })
