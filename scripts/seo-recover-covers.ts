/**
 * Перерисовать обложки уже опубликованных статей.
 *
 *   npx tsx scripts/seo-recover-covers.ts --since 2026-09-11            — холостой прогон
 *   npx tsx scripts/seo-recover-covers.ts --since 2026-09-11 --apply    — залить на сайт
 *   npx tsx scripts/seo-recover-covers.ts --slug postuplenie-v-ssha --apply
 *
 * Меняется только картинка. Текст, дата публикации, адрес и карточка в реестре
 * остаются как есть: статья не переиздаётся, подменяется файл обложки.
 *
 * Сцена берётся из базы — та самая, что была у статьи. Бриф владельца прямо
 * требует сохранить тему и сюжет и поменять лишь фотографический характер,
 * поэтому новую сцену придумываем только там, где её в базе нет.
 *
 * Прежний файл остаётся на сервере рядом как `<слаг>.jpg.bak`: откат — одна
 * команда, а не новая генерация.
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

const ssh = (cmd: string) => run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SERVER, cmd])
const scp = (local: string, remote: string) =>
  run('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', local, `${SERVER}:${remote}`])

const seo = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
).schema('seo') as any

/** Сцены для статей, у которых их не сохранилось: по рубрикам из брифа. */
const FALLBACK_SCENES: Record<string, string> = {
  'magistratura-avstrii':
    'A student walking with a backpack across an old university courtyard in Vienna, '
    + 'understated historic facades and tall windows, other students blurred in motion in the background.',
}

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const since = argv.includes('--since') ? argv[argv.indexOf('--since') + 1] : null
  const slug = argv.includes('--slug') ? argv[argv.indexOf('--slug') + 1] : null
  const outDir = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : fs.mkdtempSync(path.join(os.tmpdir(), 'covers-'))

  if (!since && !slug) {
    console.log('укажите --since ГГГГ-ММ-ДД или --slug')
    process.exit(1)
  }

  const { generateCover, coverPrompt, imageProvider } = await import('../lib/seo/images')
  console.log(`${apply ? 'ЗАМЕНА НА САЙТЕ' : 'ХОЛОСТОЙ ПРОГОН'} · рисует ${imageProvider()} · файлы в ${outDir}\n`)

  let q = seo.from('articles').select('id, published_at, current_version_id').eq('status', 'published')
  if (since) q = q.gte('published_at', since)
  const { data: arts, error } = await q.order('published_at')
  if (error) throw new Error(error.message)

  const targets: { slug: string; title: string; versionId: number; scene: string; date: string }[] = []
  for (const a of arts ?? []) {
    const { data: v } = await seo.from('article_versions').select('id, title, meta').eq('id', a.current_version_id).single()
    const meta: any = v?.meta ?? {}
    if (slug && meta.slug !== slug) continue
    const scene = meta.images?.scenes?.cover ?? FALLBACK_SCENES[meta.slug]
    if (!scene) {
      console.log(`⚠ ${meta.slug}: сцены нет ни в базе, ни в запасном списке — пропускаю, чтобы не выдумывать сюжет`)
      continue
    }
    targets.push({ slug: meta.slug, title: v.title, versionId: v.id, scene, date: String(a.published_at).slice(0, 10) })
  }

  for (const t of targets) {
    console.log(`${t.date}  ${t.slug}`)
    console.log(`   «${t.title}»`)
    try {
      const local = path.join(outDir, `${t.slug}.jpg`)

      // Если картинка уже нарисована на холостом прогоне — берём её. Иначе
      // заливка рисует всё заново: это лишние деньги и, что хуже, другая
      // картинка, не та, которую смотрели глазами. На первом же прогоне из-за
      // этого кончился баланс у поставщика на последней статье.
      let img: { buffer: Buffer; width: number; height: number; bytes: number }
      if (fs.existsSync(local) && !argv.includes('--redraw')) {
        const buffer = fs.readFileSync(local)
        const sharp = (await import('sharp')).default
        const meta = await sharp(buffer).metadata()
        img = { buffer, width: meta.width ?? 0, height: meta.height ?? 0, bytes: buffer.length }
        console.log(`   · беру готовую ${img.width}×${img.height}, ${Math.round(img.bytes / 1024)} КБ`)
      } else {
        img = await generateCover(coverPrompt(t.scene))
        fs.writeFileSync(local, img.buffer)
        console.log(`   ✓ нарисовано ${img.width}×${img.height}, ${Math.round(img.bytes / 1024)} КБ → ${local}`)
      }

      if (!apply) { console.log(''); continue }

      const remote = `${THEME}/assets/img/blog/${t.slug}.jpg`
      await ssh(`cp ${remote} ${remote}.bak 2>/dev/null || true`)
      await scp(local, remote)
      const { stdout } = await ssh(`ls -l ${remote} | awk '{print $5}'`)
      console.log(`   ✓ на сайте: ${stdout.trim()} байт`)

      const { data: v } = await seo.from('article_versions').select('meta').eq('id', t.versionId).single()
      const meta: any = v?.meta ?? {}
      const { error: upErr } = await seo.from('article_versions').update({
        meta: {
          ...meta,
          cover: {
            format: 'jpeg', width: img.width, height: img.height, bytes: img.bytes,
            base64: img.buffer.toString('base64'), restyled_at: new Date().toISOString(),
          },
        },
      }).eq('id', t.versionId)
      console.log(upErr ? `   ✗ база: ${upErr.message}` : '   ✓ записано в базу')
    } catch (e) {
      console.log(`   ✗ ${(e as Error).message}`)
    }
    console.log('')
  }

  console.log(`итого статей: ${targets.length}`)
  if (!apply && targets.length) console.log('заливка: повторите с --apply')
}

main()
