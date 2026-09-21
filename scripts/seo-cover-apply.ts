/**
 * Положить одобренную обложку на сайт.
 *
 *   npx tsx scripts/seo-cover-apply.ts --slug a --slug b           — показать, что поедет
 *   npx tsx scripts/seo-cover-apply.ts --slug a --apply            — залить
 *
 * Берёт готовый файл из out/covers — тот самый, который смотрели глазами.
 * Рисовать заново здесь нечем и незачем: перерисовка дала бы другую картинку,
 * не ту, что одобрили, и стоила бы денег.
 *
 * Прежний файл остаётся рядом как `<слаг>.jpg.bak`.
 */
import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const run = promisify(execFile)
const SERVER = 'root@72.56.242.202'
const THEME = '/var/www/html/wordpress/wp-content/themes/goandstudy'
const ssh = (cmd: string) => run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', SERVER, cmd])
const scp = (local: string, remote: string) =>
  run('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', local, `${SERVER}:${remote}`])

const seo = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
).schema('seo') as any

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const dir = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : path.resolve(process.cwd(), 'out/covers')
  const slugs = argv.reduce<string[]>((acc, a, i) => (a === '--slug' ? [...acc, argv[i + 1]] : acc), [])
  if (!slugs.length) { console.error('укажи --slug'); process.exit(1) }

  // Фразы лежат рядом с картинками: записываем их в мету, чтобы перерисовка
  // когда-нибудь взяла тот же текст, а не придумала новый.
  const hooksFile = path.join(dir, 'hooks.json')
  const hooks: any[] = fs.existsSync(hooksFile) ? JSON.parse(fs.readFileSync(hooksFile, 'utf8')) : []

  const sharp = (await import('sharp')).default
  console.log(`${apply ? 'ЗАЛИВКА' : 'ПОКАЗ'} · из ${dir}\n`)

  for (const slug of slugs) {
    const local = path.join(dir, `${slug}.jpg`)
    if (!fs.existsSync(local)) { console.log(`${slug}: файла нет — ${local}\n`); continue }
    const buffer = fs.readFileSync(local)
    const meta = await sharp(buffer).metadata()
    const hook = hooks.find((h) => h.slug === slug) ?? null
    console.log(`${slug}`)
    console.log(`   ${meta.width}×${meta.height}, ${Math.round(buffer.length / 1024)} КБ${hook ? ` · «${hook.hook}» · кадр ${hook.shot}` : ''}`)

    const remote = `${THEME}/assets/img/blog/${slug}.jpg`
    const { stdout: was } = await ssh(`stat -c%s ${remote} 2>/dev/null || echo 0`)
    console.log(`   на сайте сейчас: ${Math.round(Number(was.trim()) / 1024)} КБ`)
    if (!apply) { console.log(''); continue }

    await ssh(`[ -f ${remote} ] && cp ${remote} ${remote}.bak || true`)
    await scp(local, remote)
    await ssh(`chown root:www-data ${remote} && chmod 644 ${remote}`)
    const { stdout: now } = await ssh(`stat -c%s ${remote}`)
    console.log(`   ✓ залито: ${now.trim()} байт`)

    // Мета версии — только если статья из конвейера: у легаси её нет
    const { data: arts } = await seo.from('articles').select('id, current_version_id').eq('status', 'published')
    let versionId: number | null = null
    let prev: any = null
    for (const a of arts ?? []) {
      const { data: v } = await seo.from('article_versions').select('id, meta').eq('id', a.current_version_id).single()
      if (v?.meta?.slug === slug) { versionId = v.id; prev = v.meta; break }
    }
    if (!versionId) { console.log('   · статьи нет в базе (легаси) — записывать мету некуда\n'); continue }

    const { error } = await seo.from('article_versions').update({
      meta: {
        ...prev,
        cover: {
          format: 'jpeg', width: meta.width, height: meta.height, bytes: buffer.length,
          base64: buffer.toString('base64'), drawn_at: new Date().toISOString(),
          ...(hook ? { hook: hook.hook, hook_accent: hook.accent, shot: hook.shot } : {}),
        },
      },
    }).eq('id', versionId)
    console.log(error ? `   ✗ база: ${error.message}\n` : '   ✓ записано в базу\n')
  }
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
