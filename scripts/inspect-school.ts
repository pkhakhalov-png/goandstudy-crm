import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const parser = createClient(process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!, process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const id = Number(process.argv[2])
  if (!id) { console.log('usage: tsx scripts/inspect-school.ts <id>'); return }
  const { data } = await parser.from('schools').select('id, name, campus_photo_url, raw_data').eq('id', id).single()
  if (!data) { console.log('not found'); return }
  console.log('id:', data.id, '·', data.name)
  console.log('campus_photo_url (AI):', data.campus_photo_url)
  const extras = (data.raw_data as any)?.curator_extras || {}
  console.log('curator_extras.cover_photo_url:', extras.cover_photo_url)
  console.log('curator_extras.cover_photo_by:', JSON.stringify(extras.cover_photo_by))
  const overrides = (data.raw_data as any)?.curator_overrides || {}
  console.log('curator_overrides keys:', Object.keys(overrides).filter(k => k !== '__meta'))
  if (overrides.video_link) console.log('video_link override:', overrides.video_link)

  if (extras.cover_photo_url) {
    try {
      const r = await fetch(extras.cover_photo_url, { method: 'HEAD' })
      console.log('cover URL HEAD:', r.status, r.headers.get('content-type'), r.headers.get('content-length'))
    } catch (e: any) { console.log('cover HEAD failed:', e.message) }
  }
}
main()
