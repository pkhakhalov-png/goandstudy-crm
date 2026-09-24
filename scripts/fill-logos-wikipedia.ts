/**
 * Добирает логотипы вузов из Wikipedia — там, где не сработали фавиконки.
 *
 *   npx tsx scripts/fill-logos-wikipedia.ts --country cn --dry
 *   npx tsx scripts/fill-logos-wikipedia.ts --country cn
 *
 * Зачем второй источник. fill-school-logos.ts берёт фавиконку по домену через
 * DuckDuckGo и Google. Для .edu.cn оба сервиса отдают 404 — из 13 китайских
 * вузов нашлось три. При этом в инфобоксе английской Wikipedia у них лежит
 * официальная эмблема в хорошем разрешении.
 *
 * Почему не берём картинку вслепую. Ведущее изображение статьи — это то, что
 * стоит в инфобоксе, и у одних вузов там эмблема, а у других фотография
 * корпуса. Записать корпус в logo_url значит получить здание вместо значка в
 * каждой карточке подборки. Поэтому разбираем по имени файла: Logo / Seal /
 * Emblem / Crest / Arms → логотип; всё остальное считаем фотографией и кладём
 * в campus_photo_url (тоже полезное поле, оно почти везде пустое).
 *
 * User-Agent обязателен и должен быть с контактом: на «go-and-study-crm/1.0»
 * Wikimedia отвечает 403 по своей bot policy.
 */
import { config } from 'dotenv'; import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const UA = 'goandstudy-crm/1.0 (https://crm.goandstudy.com; tech@goandstudy.com)'
const DRY = process.argv.includes('--dry')
const COUNTRY = process.argv.includes('--country')
  ? process.argv[process.argv.indexOf('--country') + 1]?.toLowerCase()
  : null

const sb = createClient(
  process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
  process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const LOGO_WORDS = /(logo|seal|emblem|crest|arms|badge|shield|insignia)/i

async function wiki(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })
    return r.ok ? await r.json() : null
  } catch { return null }
}

/** Ведущее изображение статьи: сначала summary, потом pageimages, потом поиск. */
async function leadImage(name: string): Promise<string | null> {
  const title = encodeURIComponent(name.replace(/\s+/g, '_'))
  const s = await wiki(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`)
  const direct = s?.originalimage?.source || s?.thumbnail?.source
  if (direct) return direct

  const q = await wiki(`https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=pageimages&format=json&pithumbsize=1600&origin=*`)
  for (const p of Object.values<any>(q?.query?.pages ?? {})) {
    if (p?.thumbnail?.source) return p.thumbnail.source
  }

  const found = await wiki(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=1&format=json&origin=*`)
  const hit = found?.query?.search?.[0]?.title
  if (!hit || hit === name) return null
  const s2 = await wiki(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.replace(/\s+/g, '_'))}`)
  return s2?.originalimage?.source || s2?.thumbnail?.source || null
}

/** utm-хвост Wikipedia в базе не нужен — он только мешает читать URL. */
function clean(url: string): string {
  try {
    const u = new URL(url)
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('utm_')) u.searchParams.delete(k)
    return u.toString()
  } catch { return url }
}

async function isLiveImage(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10000) })
    return r.ok && (r.headers.get('content-type') || '').startsWith('image/')
  } catch { return false }
}

async function main() {
  console.log(`режим: ${DRY ? 'показ' : 'запись'}${COUNTRY ? ` · страна ${COUNTRY}` : ''}`)

  const all: any[] = []
  for (let off = 0; off < 10000; off += 1000) {
    const { data } = await sb.from('schools')
      .select('id, name, country_code, logo_url, campus_photo_url').range(off, off + 999)
    if (!data?.length) break
    all.push(...data)
    if (data.length < 1000) break
  }
  const need = all
    .filter(s => !s.logo_url)
    .filter(s => !COUNTRY || (s.country_code || '').toLowerCase() === COUNTRY)
  console.log(`вузов без логотипа: ${need.length}\n`)

  let logos = 0, photos = 0, none = 0, dead = 0

  for (const s of need) {
    const raw = await leadImage(s.name)
    if (!raw) { console.log(`  ✗ ${s.name} — в Wikipedia картинки нет`); none++; continue }
    const url = clean(raw)
    const file = decodeURIComponent(url.split('/').pop() || '')
    const isLogo = LOGO_WORDS.test(file)

    if (!(await isLiveImage(url))) {
      console.log(`  ✗ ${s.name} — ссылка не отдаёт картинку: ${url.slice(0, 90)}`)
      dead++
      continue
    }

    if (isLogo) {
      console.log(`  ✓ ${s.name} — логотип: ${file.slice(0, 60)}`)
      if (!DRY) {
        const { error } = await sb.from('schools').update({ logo_url: url }).eq('id', s.id)
        if (error) { console.log(`     ✗ запись: ${error.message}`); continue }
      }
      logos++
    } else if (!s.campus_photo_url) {
      console.log(`  ~ ${s.name} — не логотип, кладу как фото кампуса: ${file.slice(0, 60)}`)
      if (!DRY) {
        const { error } = await sb.from('schools').update({ campus_photo_url: url }).eq('id', s.id)
        if (error) { console.log(`     ✗ запись: ${error.message}`); continue }
      }
      photos++
    } else {
      console.log(`  · ${s.name} — не логотип, фото уже есть — пропускаю`)
      none++
    }
  }

  console.log(`\nИтог: логотипов ${logos}, фото кампуса ${photos}, без картинки ${none}, битых ссылок ${dead}`)
  if (DRY) console.log('⚠️ показ — ничего не записано.')
}
main().catch(e => { console.error(e); process.exit(1) })
