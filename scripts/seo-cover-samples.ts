/**
 * Образцы обложек — посмотреть до раскатки.
 *
 *   npx tsx scripts/seo-cover-samples.ts                  — восемь статей из реестра
 *   npx tsx scripts/seo-cover-samples.ts --slug a --slug b
 *   npx tsx scripts/seo-cover-samples.ts --photos DIR     — не рисовать заново, взять готовые
 *
 * Ничего никуда не заливает: пишет файлы и контактный лист в out/covers.
 * Раскатка — отдельный скрипт и отдельное «да».
 */
import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
config({ path: path.resolve(process.cwd(), '.env.local') })

const run = promisify(execFile)
const SERVER = 'root@72.56.242.202'
const THEME = '/var/www/html/wordpress/wp-content/themes/goandstudy'
const ssh = (cmd: string) => run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', SERVER, cmd], { maxBuffer: 16 * 1024 * 1024 })

/** Восемь разных по характеру тем: страна, экзамен, деньги, виза, быт. */
const DEFAULT_SLUGS = [
  'kak-sdavat-ielts',
  'oplata-ucheby-za-granitsey',
  'strakhovka-dlya-ucheby-za-graniczej',
  'luchshie-universitety-v-dubae',
  'chto-takoe-nostrifikacziya',
  'kak-vyigrat-grant-na-obuchenie-za-granitsey',
  'universitety-ligi-plyushha-v-ssha',
  'mozhno-li-rabotat-vo-vremya-yazykovyh-kursov',
]

async function main() {
  const argv = process.argv.slice(2)
  const slugs = argv.reduce<string[]>((acc, a, i) => (a === '--slug' ? [...acc, argv[i + 1]] : acc), [])
  const photosDir = argv.includes('--photos') ? argv[argv.indexOf('--photos') + 1] : null
  const targets = slugs.length ? slugs : DEFAULT_SLUGS

  const outDir = path.resolve(process.cwd(), 'out/covers')
  fs.mkdirSync(outDir, { recursive: true })

  const { generateCover, coverPrompt, imageProvider } = await import('../lib/seo/images')
  const { planScenes } = await import('../lib/seo/generate')
  type Shot = import('../lib/seo/generate').Shot
  const { renderHookCover } = await import('../lib/seo/cover-hook')
  const sharp = (await import('sharp')).default

  console.log(`образцы · рисует ${imageProvider()} · ${outDir}\n`)

  // Заголовки берём из реестра темы: образец должен стоять на настоящей строке,
  // а не на придуманной для показа.
  const { stdout } = await ssh(`grep "'slug' =>" ${THEME}/inc/blog-data.php`)
  const titles = new Map<string, string>()
  for (const line of stdout.split('\n')) {
    const slug = line.match(/'slug'\s*=>\s*'([^']+)'/)?.[1]
    const title = line.match(/'title'\s*=>\s*'((?:[^']|\\')*)'/)?.[1]?.replace(/\\'/g, "'")
    if (slug && title) titles.set(slug, title)
  }

  const cards: { slug: string; title: string; hook: string; accent: string[]; shot: string; file: string }[] = []
  const recent: Shot[] = []

  // Переверстать уже одобренный текст на уже нарисованной фотографии: ни одного
  // платного вызова. Нужен, когда правится макет, а не содержание.
  if (argv.includes('--relayout')) {
    const manifest: any[] = JSON.parse(fs.readFileSync(path.join(outDir, 'hooks.json'), 'utf8'))
    for (const m of manifest.filter((x) => !slugs.length || slugs.includes(x.slug))) {
      const photo = path.join(outDir, `${m.slug}.photo.jpg`)
      if (!fs.existsSync(photo)) { console.log(`${m.slug}: фотографии нет, пропускаю`); continue }
      const card = await renderHookCover(fs.readFileSync(photo), { text: m.hook, accent: m.accent })
      const file = path.join(outDir, `${m.slug}.jpg`)
      fs.writeFileSync(file, card.buffer)
      cards.push({ ...m, file })
      console.log(`${m.slug}: переверстано, ${Math.round(card.bytes / 1024)} КБ`)
    }
  }

  for (const slug of cards.length ? [] : targets) {
    const title = titles.get(slug) ?? slug
    console.log(`${slug}\n   «${title}»`)
    try {
      const raw = await ssh(`cat ${THEME}/inc/blog-articles/${slug}.html 2>/dev/null || true`)
      const headings = [...raw.stdout.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
        .map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 14)

      // Два последних типа кадра под запретом: соседние карточки в ленте
      // не должны быть одним и тем же планом.
      const scenes = await planScenes({ title, h1: title, headings, avoidShots: recent.slice(-2) })
      recent.push(scenes.shot)
      console.log(`   кадр: ${scenes.shot}`)
      console.log(`   сцена: ${scenes.cover.slice(0, 120)}`)
      console.log(`   фраза: «${scenes.hook}» → ${scenes.hook_accent.join(', ')}`)

      const readyPhoto = photosDir ? path.join(photosDir, `${slug}.jpg`) : null
      let photo: Buffer
      if (readyPhoto && fs.existsSync(readyPhoto)) {
        photo = fs.readFileSync(readyPhoto)
        console.log('   · фотография взята готовой')
      } else {
        const img = await generateCover(coverPrompt(scenes.cover))
        photo = img.buffer
        fs.writeFileSync(path.join(outDir, `${slug}.photo.jpg`), photo)
      }

      const card = await renderHookCover(photo, { text: scenes.hook, accent: scenes.hook_accent })
      const file = path.join(outDir, `${slug}.jpg`)
      fs.writeFileSync(file, card.buffer)
      cards.push({ slug, title, hook: scenes.hook, accent: scenes.hook_accent, shot: scenes.shot, file })
      console.log(`   ✓ ${card.width}×${card.height}, ${Math.round(card.bytes / 1024)} КБ\n`)
    } catch (e) {
      console.log(`   ✗ ${(e as Error).message}\n`)
    }
  }

  if (!cards.length) { console.log('образцов не вышло'); return }

  // Контактный лист: карточки в том размере, в каком их видит читатель ленты.
  const CW = 480, CH = 320, GAP = 16, COLS = 2
  const rows = Math.ceil(cards.length / COLS)
  const sheet = await sharp({
    create: { width: COLS * CW + (COLS + 1) * GAP, height: rows * CH + (rows + 1) * GAP, channels: 3, background: '#F4F3F8' },
  }).png().toBuffer()

  const tiles = await Promise.all(cards.map(async (c, i) => ({
    input: await sharp(fs.readFileSync(c.file)).resize(CW, CH, { fit: 'cover' }).png().toBuffer(),
    left: GAP + (i % COLS) * (CW + GAP),
    top: GAP + Math.floor(i / COLS) * (CH + GAP),
  })))

  // Список фраз рядом с картинками: переверстать текст можно без новых
  // платных вызовов — фотография и крючок уже есть.
  fs.writeFileSync(path.join(outDir, 'hooks.json'), JSON.stringify(cards.map(({ file, ...c }) => c), null, 2))

  const sheetFile = path.join(outDir, 'sheet.png')
  await sharp(sheet).composite(tiles).png().toFile(sheetFile)
  console.log(`контактный лист: ${sheetFile}`)
  console.log(cards.map((c) => `${c.shot.padEnd(12)} «${c.hook}»`).join('\n'))
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
