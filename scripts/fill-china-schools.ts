/**
 * Дозаполняет китайские карточки через продуктовые маршруты /api/ai/fill-school
 * и /api/ai/fill-program — те же, что за кнопками «Заполнить ИИ» в интерфейсе.
 *
 *   npx tsx scripts/fill-china-schools.ts                        # показать и выйти
 *   npx tsx scripts/fill-china-schools.ts --confirm              # вузы
 *   npx tsx scripts/fill-china-schools.ts --confirm --programs   # программы
 *   npx tsx scripts/fill-china-schools.ts --confirm --ids 5414,5415
 *
 * ⚠️ После каждого прогона --programs запусти cn-keep-partner-prices.ts:
 * маршрут заново проставляет gross_tuition_label, а он перекрывает цену
 * партнёра на карточке — и у половины программ модель находит стоимость
 * магистратуры вместо бакалавриата.
 *
 * Почему через HTTP, а не своим запросом к Anthropic: маршрут не просто зовёт
 * модель — он проверяет, что найденный логотип реально отдаёт картинку, что
 * фото кампуса не HTML-страница, а video_link ведёт на канал вуза. Повторять
 * эти проверки во втором месте значит завести им вторую судьбу.
 *
 * Логинимся тестовым куратором и собираем ту же сессионную куку, что ставит
 * браузер (@supabase/ssr, base64- + чанки) — маршрут требует роль.
 */
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { createChunks } from '@supabase/ssr'
config({ path: path.resolve(process.cwd(), '.env.local') })

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const REF = SB_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)![1]
const BASE = process.argv.includes('--local') ? 'http://localhost:3000' : 'https://crm.goandstudy.com'
const CONFIRM = process.argv.includes('--confirm')
const idsArg = process.argv[process.argv.indexOf('--ids') + 1]
const ONLY = process.argv.includes('--ids') ? idsArg.split(',').map(Number) : null
const PROGRAMS = process.argv.includes('--programs')

const parser = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function sessionCookie(): Promise<string> {
  const anon = createClient(SB_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({
    email: process.env.FILL_AS_EMAIL || 'curator-test@goandstudy.com',
    password: process.env.FILL_AS_PASSWORD || 'Test12345',
  })
  if (error) throw new Error(`login: ${error.message}`)
  const s = data.session!
  const value = 'base64-' + Buffer.from(JSON.stringify({
    access_token: s.access_token, refresh_token: s.refresh_token,
    expires_at: s.expires_at, expires_in: s.expires_in,
    token_type: s.token_type, user: s.user,
  })).toString('base64url')
  return createChunks(`sb-${REF}-auth-token`, value).map(c => `${c.name}=${c.value}`).join('; ')
}

/** Один POST к маршруту заполнения; возвращает строку для лога. */
async function call(endpoint: string, body: object, cookie: string): Promise<{ ok: boolean; line: string }> {
  const t0 = Date.now()
  try {
    const res = await fetch(`${BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let json: any = null
    try { json = JSON.parse(text) } catch {}
    const secs = Math.round((Date.now() - t0) / 1000)
    if (!res.ok || !json?.ok) {
      return { ok: false, line: `✗ ${res.status} ${(json?.error ?? text).toString().slice(0, 160)} (${secs}s)` }
    }
    const f = json.saved ?? json.fields ?? json.data ?? {}
    const filled = Object.entries(f)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k]) => k)
    return { ok: true, line: `✓ ${secs}s · ${filled.length ? filled.join(', ') : 'ответ без полей'}` }
  } catch (e) {
    return { ok: false, line: `✗ ${e instanceof Error ? e.message : e}` }
  }
}

async function runPrograms() {
  const { data: schools } = await parser.from('schools').select('id, name').eq('country_code', 'cn')
  const ids = (schools ?? []).map(s => s.id)
  const byId = new Map((schools ?? []).map(s => [s.id, s.name]))
  const { data: progs } = await parser.from('programs')
    .select('id, school_id, name, degree_text').in('school_id', ids).order('school_id')
  const list = progs ?? []
  console.log(`Программ cn: ${list.length}\n`)
  if (!CONFIRM) { console.log('⚠️ Показ. Запусти с --confirm --programs.'); return }

  const cookie = await sessionCookie()
  console.log(`endpoint: ${BASE}/api/ai/fill-program\n`)
  let ok = 0, fail = 0
  for (const p of list) {
    process.stdout.write(`#${p.id} ${byId.get(p.school_id)} · ${p.name} … `)
    const r = await call('/api/ai/fill-program', { programId: p.id }, cookie)
    console.log(r.line)
    r.ok ? ok++ : fail++
  }
  console.log(`\nИтог: ✓ ${ok} · ✗ ${fail}`)
}

async function main() {
  if (PROGRAMS) return runPrograms()
  const { data: schools } = await parser.from('schools')
    .select('id, name, city, website, logo_url, qs_rank, description, campus_photo_url')
    .eq('country_code', 'cn').order('id')
  const list = (schools ?? []).filter(s => !ONLY || ONLY.includes(s.id))
  console.log(`Вузов cn: ${list.length}${ONLY ? ' (отфильтровано --ids)' : ''}\n`)
  for (const s of list) {
    const have = [s.website && 'сайт', s.logo_url && 'лого', s.qs_rank && 'QS',
                  s.description && 'описание', s.campus_photo_url && 'фото'].filter(Boolean)
    console.log(` #${s.id} ${s.name} — есть: ${have.length ? have.join(', ') : '—'}`)
  }
  if (!CONFIRM) { console.log('\n⚠️ Показ. Запусти с --confirm чтобы прогнать заполнение.'); return }

  const cookie = await sessionCookie()
  console.log(`\nendpoint: ${BASE}/api/ai/fill-school\n`)

  let ok = 0, fail = 0
  for (const s of list) {
    process.stdout.write(`#${s.id} ${s.name} … `)
    const t0 = Date.now()
    try {
      const res = await fetch(`${BASE}/api/ai/fill-school`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ schoolId: s.id }),
      })
      const text = await res.text()
      let json: any = null
      try { json = JSON.parse(text) } catch {}
      const secs = Math.round((Date.now() - t0) / 1000)
      if (!res.ok || !json?.ok) {
        console.log(`✗ ${res.status} ${(json?.error ?? text).toString().slice(0, 160)} (${secs}s)`)
        fail++
        continue
      }
      const f = json.saved ?? json.fields ?? json.data ?? {}
      const filled = Object.entries(f)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k]) => k)
      console.log(`✓ ${secs}s · ${filled.length ? filled.join(', ') : 'ответ без полей'}`)
      ok++
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message : e}`)
      fail++
    }
  }
  console.log(`\nИтог: ✓ ${ok} · ✗ ${fail}`)
}
main().catch(e => { console.error(e); process.exit(1) })
