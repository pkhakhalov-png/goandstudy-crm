// Публикация статьи блога по устройству темы (goandstudy-ARTICLE-STYLE.md §0, §10).
//
// Статья это не запись WordPress, а четыре артефакта в теме:
//   1. тело        inc/blog-articles/{slug}.html
//   2. реестр      inc/blog-data.php → goandstudy_blog_registry()
//   3. обложка     assets/img/blog/{slug}.jpg
//   4. сид-флаг    functions.php → goandstudy_seed_vNN (в двух местах)
//
// Сид-функция на первом хите страницы проходит по реестру и создаёт или обновляет
// страницы. Поэтому «опубликовать» здесь значит положить файлы и бампнуть флаг.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export const SERVER = 'root@72.56.242.202'
export const THEME = '/var/www/html/wordpress/wp-content/themes/goandstudy'

export type BlogRegistryEntry = {
  slug: string
  title: string
  excerpt: string
  cat: string
  published: string   // YYYY-MM-DD
  updated: string     // YYYY-MM-DD
}

async function ssh(cmd: string): Promise<string> {
  const { stdout } = await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SERVER, cmd], { maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

async function scp(localPath: string, remotePath: string): Promise<void> {
  await run('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', localPath, `${SERVER}:${remotePath}`])
}

/** Слаги уже опубликованных статей — для проверки ссылок и коллизий (§1, §7). */
export async function listPublishedSlugs(): Promise<string[]> {
  const out = await ssh(`ls ${THEME}/inc/blog-articles/`)
  return out.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.html')).map((s) => s.replace(/\.html$/, ''))
}

/** Строка реестра. Порядок ключей фиксирован — §8. */
export function registryLine(e: BlogRegistryEntry): string {
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `\t\tarray( 'slug' => '${esc(e.slug)}', 'title' => '${esc(e.title)}', 'excerpt' => '${esc(e.excerpt)}', 'cat' => '${esc(e.cat)}', 'published' => '${e.published}', 'updated' => '${e.updated}' ),`
}

export type PublishReport = {
  slug: string
  steps: string[]
  seedFrom: string
  seedTo: string
  url: string
}

/**
 * Выложить статью. Порядок из §10: тело, обложка, реестр, бамп флага, прогрев.
 * dryRun по умолчанию — на сервер ничего не уходит, показывается план.
 */
export async function publishToTheme(
  entry: BlogRegistryEntry,
  files: { bodyPath: string; coverPath: string },
  opts: { dryRun?: boolean } = {},
): Promise<PublishReport> {
  const steps: string[] = []
  const dry = opts.dryRun !== false

  // Проверяем коллизию слага до любых записей
  const existing = await listPublishedSlugs()
  if (existing.includes(entry.slug)) {
    throw new Error(`слаг ${entry.slug} уже занят: по §1 не дописываем «-2», а уточняем смысл темы`)
  }

  // Текущий номер сид-флага
  const seedRaw = await ssh(`grep -o "goandstudy_seed_v[0-9]*" ${THEME}/functions.php | sort -u | tail -1`)
  const seedFrom = seedRaw.trim()
  const seedNum = Number(seedFrom.replace('goandstudy_seed_v', '')) || 0
  const seedTo = `goandstudy_seed_v${seedNum + 1}`

  steps.push(`тело → ${THEME}/inc/blog-articles/${entry.slug}.html`)
  steps.push(`обложка → ${THEME}/assets/img/blog/${entry.slug}.jpg`)
  steps.push(`строка в реестр inc/blog-data.php (в начало массива — карточка будет видна сразу)`)
  steps.push(`сид-флаг ${seedFrom} → ${seedTo} в двух местах functions.php`)
  steps.push('бамп GOANDSTUDY_VERSION, чтобы браузеры не отдали старый CSS из кэша')
  steps.push('прогрев: запрос к главной, чтобы сид отработал')

  const url = `https://goandstudy.com/blog/${entry.slug}/`
  if (dry) return { slug: entry.slug, steps, seedFrom, seedTo, url }

  // 1–2. Файлы
  await scp(files.bodyPath, `${THEME}/inc/blog-articles/${entry.slug}.html`)
  await scp(files.coverPath, `${THEME}/assets/img/blog/${entry.slug}.jpg`)

  // 3. Реестр: вставляем первой строкой массива, чтобы карточка попала на первый экран
  const line = registryLine(entry).replace(/'/g, "'\\''")
  await ssh(`cp ${THEME}/inc/blog-data.php ${THEME}/inc/blog-data.php.bak.$(date +%s) && ` +
    `awk 'BEGIN{done=0} /return array\\(/ && !done {print; print "${line}"; done=1; next} {print}' ` +
    `${THEME}/inc/blog-data.php > /tmp/bd.php && mv /tmp/bd.php ${THEME}/inc/blog-data.php`)

  // Синтаксис реестра проверяем до того, как сайт его подхватит
  const lint = await ssh(`php -l ${THEME}/inc/blog-data.php 2>&1 || true`)
  if (!/No syntax errors/.test(lint)) {
    await ssh(`cp $(ls -t ${THEME}/inc/blog-data.php.bak.* | head -1) ${THEME}/inc/blog-data.php`)
    throw new Error(`реестр сломался, откатил: ${lint.trim().slice(0, 200)}`)
  }

  // 4. Сид-флаг в двух местах + версия темы
  await ssh(`sed -i 's/${seedFrom}/${seedTo}/g' ${THEME}/functions.php`)
  await ssh(`grep -q "GOANDSTUDY_VERSION" ${THEME}/functions.php && ` +
    `sed -i "s/define( *'GOANDSTUDY_VERSION', *'\\([0-9.]*\\)'/define('GOANDSTUDY_VERSION', '\\1.1'/" ${THEME}/functions.php || true`)

  // 5. Прогрев
  await ssh(`curl -s -o /dev/null https://goandstudy.com/`)

  return { slug: entry.slug, steps, seedFrom, seedTo, url }
}

/** Проверки после публикации — §10. */
export async function verifyPublished(slug: string): Promise<{ ok: boolean; results: string[] }> {
  const results: string[] = []
  let ok = true
  const url = `https://goandstudy.com/blog/${slug}/`

  const page = await fetch(url, { signal: AbortSignal.timeout(25000) }).catch(() => null)
  const html = page && page.ok ? await page.text() : ''
  if (!page || !page.ok) { ok = false; results.push(`страница отдаёт ${page?.status ?? 'ошибку'}`) }
  else results.push('страница отдаётся 200')

  // Заголовок X-Robots-Tag закрывает страницу от поиска молча: в разметке
  // ничего не видно, а индексации не будет
  const xrobots = page?.headers.get('x-robots-tag')
  if (xrobots && /noindex/i.test(xrobots)) { ok = false; results.push(`заголовок X-Robots-Tag: ${xrobots}`) }

  if (html) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
    results.push(title ? `title: ${title}` : 'title пустой')
    if (!/<meta name="description"/i.test(html)) { ok = false; results.push('нет meta description') }
    if (!/application\/ld\+json/i.test(html)) { ok = false; results.push('нет JSON-LD') }

    const h1 = (html.match(/<h1[\s>]/gi) ?? []).length
    if (h1 !== 1) { ok = false; results.push(`h1 на странице: ${h1}, должен быть один`) }

    if (/<meta[^>]+name=["\']robots["\'][^>]+noindex/i.test(html)) {
      ok = false; results.push('в разметке стоит noindex')
    }

    // Канонический адрес должен указывать на саму страницу, иначе вес уйдёт
    // на другой URL, а эта из индекса выпадет
    const canonical = html.match(/<link[^>]+rel=["\']canonical["\'][^>]*>/i)?.[0]?.match(/href=["\']([^"\']+)/i)?.[1]
    if (!canonical) { ok = false; results.push('нет canonical') }
    else if (canonical.replace(/\/$/, '') !== url.replace(/\/$/, '')) {
      ok = false; results.push(`canonical ведёт на чужой адрес: ${canonical}`)
    } else results.push('canonical на себя')

    // Каждая картинка должна отдаваться. Сегодня уже был случай, когда тег в
    // тексте стоял, а файла не было — и проверка этого не заметила.
    const imgs = [...html.matchAll(/<img[^>]+src=["\']([^"\']+)["\'][^>]*>/gi)]
      .map((m) => m[1]).filter((src) => src.includes('/blog/'))
    for (const src of [...new Set(imgs)].slice(0, 6)) {
      const full = src.startsWith('http') ? src : `https://goandstudy.com${src}`
      const r = await fetch(full, { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null)
      if (!r || !r.ok) { ok = false; results.push(`картинка не отдаётся (${r?.status ?? 'ошибка'}): ${src}`) }
    }
    if (imgs.length) results.push(`картинок в статье: ${new Set(imgs).size}, все отдаются`)

    // Пустой alt — не ошибка вёрстки, но для поиска картинка становится немой
    const noAlt = (html.match(/<img(?![^>]*\balt=)[^>]*>/gi) ?? []).length
    if (noAlt) results.push(`картинок без alt: ${noAlt}`)
  }

  const index = await fetch('https://goandstudy.com/blog/', { signal: AbortSignal.timeout(25000) }).catch(() => null)
  const idxHtml = index && index.ok ? await index.text() : ''
  if (!idxHtml.includes(slug)) { ok = false; results.push('карточки нет на /blog/') }
  else results.push('карточка на индексе есть')

  // Без строки в sitemap Google узнает о статье только по ссылкам, и не скоро
  const sm = await fetch('https://goandstudy.com/sitemap.xml', { signal: AbortSignal.timeout(25000) }).catch(() => null)
  const smXml = sm && sm.ok ? await sm.text() : ''
  if (!smXml) results.push('sitemap не прочитался — проверить вручную')
  else if (!smXml.includes(slug)) { ok = false; results.push('адреса нет в sitemap.xml') }
  else results.push('адрес есть в sitemap.xml')

  return { ok, results }
}
