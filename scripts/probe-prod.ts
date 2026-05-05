import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const PROD = 'https://crm.goandstudy.com'

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await sb.auth.signInWithPassword({
    email: 'curator-test@goandstudy.com', password: 'Test12345',
  })
  if (error) { console.error('login fail:', error); process.exit(1) }
  console.log('logged in:', data.user?.email)

  // SSR cookie format used by @supabase/ssr
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/([^.]+)/)![1]
  const cookieName = `sb-${projectRef}-auth-token`
  const sessionPayload = [
    data.session!.access_token,
    data.session!.refresh_token,
    null, null, null,
  ]
  const cookieValue = `base64-${Buffer.from(JSON.stringify(sessionPayload)).toString('base64')}`
  const cookieHeader = `${cookieName}=${cookieValue}`

  const url = `${PROD}/curator/universities?country=de&levels=bachelor`
  console.log('\nGET', url)
  const r = await fetch(url, { headers: { Cookie: cookieHeader }, redirect: 'manual' })
  console.log('status:', r.status, '| location:', r.headers.get('location') || '-')
  console.log('x-vercel-id:', r.headers.get('x-vercel-id'))
  if (r.status !== 200) {
    console.log('Не 200 — auth cookie не подхватился. Можем проверить view source вручную.')
    return
  }
  const html = await r.text()
  const m = html.match(/data-debug-build="([^"]+)"\s+data-debug-count="([^"]*)"\s+data-debug-err="([^"]*)"/)
  if (m) {
    console.log('>>> DEBUG MARKERS из прод-HTML:')
    console.log(`    build = ${m[1]}`)
    console.log(`    count = ${m[2]}`)
    console.log(`    err   = ${m[3] || '(нет)'}`)
  } else {
    console.log('!!! НЕТ debug markers в HTML — значит деплой 45704f6 ещё не выкатился')
  }
  const cm = html.match(/ВСЕГО ПРОГРАММ[\s\S]{0,80}/)
  if (cm) console.log('counter HTML snippet:', cm[0].replace(/\s+/g, ' ').slice(0, 100))
}
main()
