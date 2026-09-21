/**
 * Дорисовать обложки блога там, где своей фотографии нет.
 *
 *   npx tsx scripts/seo-cover-missing.ts                 — холостой прогон: сцены + файлы в /tmp
 *   npx tsx scripts/seo-cover-missing.ts --apply         — залить на сайт
 *   npx tsx scripts/seo-cover-missing.ts --slug X        — одна статья
 *   npx tsx scripts/seo-cover-missing.ts --limit 5       — первые N, чтобы посмотреть на результат
 *
 * Источник правды — реестр темы, а не база: на сайте 87 карточек, а в seo.articles
 * только те, что написал конвейер. Легаси-статьи иначе остались бы без внимания.
 *
 * «Своей фотографии нет» — это три разных случая, и все три видны глазами
 * одинаково: файла нет вовсе; файл есть, но это заглушка или размытый мусор
 * (плоская картинка жмётся в единицы килобайт); файл есть, но он тот же самый,
 * что ещё у двух десятков карточек — в ленте это читается как поломка.
 *
 * Сцену берём из базы, если статья оттуда, иначе подбираем тем же подборщиком,
 * что и конвейер, по заголовку и подзаголовкам статьи из темы.
 *
 * Прежний файл остаётся рядом как `<слаг>.jpg.bak`: откат — одна команда.
 */
import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const run = promisify(execFile)
const SERVER = 'root@72.56.242.202'
const THEME = '/var/www/html/wordpress/wp-content/themes/goandstudy'
/** Всё, что легче этого, — не фотография: заглушка или пересжатый в кашу файл. */
const PLACEHOLDER_MAX = 10 * 1024

const ssh = (cmd: string) => run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', SERVER, cmd], { maxBuffer: 16 * 1024 * 1024 })
const scp = (local: string, remote: string) =>
  run('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', local, `${SERVER}:${remote}`])

const seo = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
).schema('seo') as any

type Target = {
  slug: string
  title: string
  cat: string
  why: string
  versionId: number | null
  meta: any
}

/** Реестр темы: слаг, заголовок, рубрика. Разбираем PHP построчно — он ровный. */
async function registry(): Promise<{ slug: string; title: string; cat: string }[]> {
  const { stdout } = await ssh(`grep "'slug' =>" ${THEME}/inc/blog-data.php`)
  const out: { slug: string; title: string; cat: string }[] = []
  for (const line of stdout.split('\n')) {
    const slug = line.match(/'slug'\s*=>\s*'([^']+)'/)?.[1]
    if (!slug) continue
    out.push({
      slug,
      title: line.match(/'title'\s*=>\s*'((?:[^']|\\')*)'/)?.[1]?.replace(/\\'/g, "'") ?? slug,
      cat: line.match(/'cat'\s*=>\s*'([^']*)'/)?.[1] ?? '',
    })
  }
  return out
}

/** Что лежит в assets/img/blog: размер и контрольная сумма каждого файла. */
async function covers(): Promise<Map<string, { bytes: number; md5: string }>> {
  const { stdout } = await ssh(`cd ${THEME}/assets/img/blog && for f in *.jpg; do echo "$(stat -c%s "$f") $(md5sum "$f" | cut -d' ' -f1) $f"; done`)
  const map = new Map<string, { bytes: number; md5: string }>()
  for (const line of stdout.split('\n')) {
    const [bytes, md5, ...rest] = line.trim().split(/\s+/)
    const name = rest.join(' ')
    if (name) map.set(name.replace(/\.jpg$/, ''), { bytes: Number(bytes), md5 })
  }
  return map
}

async function headings(slug: string): Promise<string[]> {
  const { stdout } = await ssh(`cat ${THEME}/inc/blog-articles/${slug}.html 2>/dev/null || true`)
  return [...stdout.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 14)
}

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const only = argv.includes('--slug') ? argv[argv.indexOf('--slug') + 1] : null
  const limit = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : Infinity
  const outDir = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : fs.mkdtempSync(path.join(os.tmpdir(), 'covers-'))

  const { generateCover, coverPrompt, imageProvider } = await import('../lib/seo/images')
  const { planScenes } = await import('../lib/seo/generate')
  if (!imageProvider()) { console.error('✗ нет ключа поставщика картинок'); process.exit(1) }
  console.log(`${apply ? 'ЗАЛИВКА НА САЙТ' : 'ХОЛОСТОЙ ПРОГОН'} · рисует ${imageProvider()} · файлы в ${outDir}\n`)

  const [reg, files] = await Promise.all([registry(), covers()])

  // Картинка, которой подписаны несколько карточек, — не обложка, а заполнитель
  const byMd5 = new Map<string, string[]>()
  for (const r of reg) {
    const f = files.get(r.slug)
    if (f) byMd5.set(f.md5, [...(byMd5.get(f.md5) ?? []), r.slug])
  }

  // Статьи конвейера: у них может быть сохранённая сцена и версия для записи
  const { data: arts } = await seo.from('articles').select('id, current_version_id').eq('status', 'published')
  const fromDb = new Map<string, { versionId: number; meta: any }>()
  for (const a of arts ?? []) {
    const { data: v } = await seo.from('article_versions').select('id, meta').eq('id', a.current_version_id).single()
    if (v?.meta?.slug) fromDb.set(v.meta.slug, { versionId: v.id, meta: v.meta })
  }

  const targets: Target[] = []
  for (const r of reg) {
    const f = files.get(r.slug)
    const shared = f ? (byMd5.get(f.md5) ?? []).length : 0
    let why = ''
    if (!f) why = 'файла нет'
    else if (f.bytes < PLACEHOLDER_MAX) why = `${Math.round(f.bytes / 1024)} КБ — заглушка`
    else if (shared > 1) why = `та же картинка ещё у ${shared - 1}`
    if (only ? r.slug !== only : !why) continue
    const db = fromDb.get(r.slug)
    targets.push({ slug: r.slug, title: r.title, cat: r.cat, why: why || 'по запросу', versionId: db?.versionId ?? null, meta: db?.meta ?? null })
  }

  if (!targets.length) { console.log('у всех карточек своя фотография'); return }
  console.log(`без своей фотографии: ${targets.length}${limit < targets.length ? ` (беру ${limit})` : ''}`)
  for (const t of targets) console.log(`   ${t.why.padEnd(24)} ${t.slug}`)
  console.log('')

  let drawn = 0, failed = 0

  // По одной картинке за раз это три четверти часа на три десятка карточек:
  // почти всё время уходит на ожидание модели, а не на работу. Четыре в параллель
  // укладываются в десять минут и не упираются в ограничения поставщика.
  const queue = targets.slice(0, limit)
  const LANES = Number(process.env.COVER_LANES ?? 4)

  const draw = async (t: Target) => {
    const say: string[] = [`${t.slug}  [${t.cat}] — ${t.why}`, `   «${t.title}»`]
    try {
      const local = path.join(outDir, `${t.slug}.jpg`)
      const reuse = fs.existsSync(local) && !argv.includes('--redraw')

      let scene: string | null = t.meta?.images?.scenes?.cover ?? null
      let scenes = t.meta?.images?.scenes ?? null
      if (!scene && !reuse) {
        scenes = await planScenes({ title: t.title, h1: t.title, headings: await headings(t.slug) })
        scene = scenes.cover
        say.push(`   сцена: ${String(scene).slice(0, 140)}`)
      }

      let img: { buffer: Buffer; width: number; height: number; bytes: number }
      if (reuse) {
        const buffer = fs.readFileSync(local)
        const sharp = (await import('sharp')).default
        const m = await sharp(buffer).metadata()
        img = { buffer, width: m.width ?? 0, height: m.height ?? 0, bytes: buffer.length }
        say.push(`   · беру готовую ${img.width}×${img.height}, ${Math.round(img.bytes / 1024)} КБ`)
      } else {
        img = await generateCover(coverPrompt(scene!))
        fs.writeFileSync(local, img.buffer)
        say.push(`   ✓ нарисовано ${img.width}×${img.height}, ${Math.round(img.bytes / 1024)} КБ`)
      }
      drawn++

      if (apply) {
        const remote = `${THEME}/assets/img/blog/${t.slug}.jpg`
        await ssh(`[ -f ${remote} ] && cp ${remote} ${remote}.bak || true`)
        await scp(local, remote)
        await ssh(`chown root:www-data ${remote} && chmod 644 ${remote}`)
        const { stdout: sz } = await ssh(`ls -l ${remote} | awk '{print $5}'`)
        say.push(`   ✓ на сайте: ${sz.trim()} байт`)

        if (t.versionId) {
          const { data: fresh } = await seo.from('article_versions').select('meta').eq('id', t.versionId).single()
          const meta: any = fresh?.meta ?? t.meta
          const { error: upErr } = await seo.from('article_versions').update({
            meta: {
              ...meta,
              cover: {
                format: 'jpeg', width: img.width, height: img.height, bytes: img.bytes,
                base64: img.buffer.toString('base64'), drawn_at: new Date().toISOString(),
              },
              images: { ...(meta.images ?? {}), scenes: scenes ?? meta.images?.scenes },
            },
          }).eq('id', t.versionId)
          say.push(upErr ? `   ✗ база: ${upErr.message}` : '   ✓ записано в базу')
        }
      }
    } catch (e) {
      failed++
      say.push(`   ✗ ${(e as Error).message}`)
    }
    // Печатаем статью целиком и разом: иначе четыре потока перемешают строки
    console.log(say.join('\n') + '\n')
  }

  const lanes = Array.from({ length: Math.min(LANES, queue.length) }, async () => {
    for (let t = queue.shift(); t; t = queue.shift()) await draw(t)
  })
  await Promise.all(lanes)

  console.log(`нарисовано ${drawn}${failed ? `, не вышло ${failed}` : ''}`)
  if (!apply && drawn) console.log(`заливка: повторите с --apply --out ${outDir}`)
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
