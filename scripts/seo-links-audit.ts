// Разбор внутренних ссылок темы: куда ведут, чем отвечают, что считают
// каноническим. По умолчанию — только отчёт, ничего не меняет.
//
//   npx tsx scripts/seo-links-audit.ts           сухой прогон
//   npx tsx scripts/seo-links-audit.ts --apply   починить однозначные
//
// Однозначная ссылка: даёт ровно один переход на страницу с ответом 200,
// и эта страница объявляет себя канонической. Всё остальное — в разбор
// руками: цепочки, ошибки, чужой canonical.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'

const run = promisify(execFile)
const SERVER = 'root@72.56.242.202'
const THEME = '/var/www/html/wordpress/wp-content/themes/goandstudy'
const SITE = 'https://goandstudy.com'
const APPLY = process.argv.includes('--apply')

type Verdict = {
  href: string
  finalUrl: string | null
  status: number | null
  hops: number
  canonical: string | null
  kind: 'однозначная' | 'цепочка' | 'ошибка' | 'чужой canonical' | 'внешняя'
  count: number
}

/** Идём по переадресациям вручную, чтобы видеть длину цепочки. */
async function resolve(href: string): Promise<{ finalUrl: string | null; status: number | null; hops: number }> {
  let url = href.startsWith('http') ? href : SITE + href
  for (let hops = 0; hops < 5; hops++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) }).catch(() => null)
    if (!res) return { finalUrl: null, status: null, hops }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location')
      if (!next) return { finalUrl: url, status: res.status, hops }
      url = next.startsWith('http') ? next : SITE + next
      continue
    }
    return { finalUrl: url, status: res.status, hops }
  }
  return { finalUrl: url, status: null, hops: 5 }
}

async function canonicalOf(url: string): Promise<string | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) }).catch(() => null)
  if (!res || !res.ok) return null
  const html = await res.text()
  return html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)/i)?.[1] ?? null
}

async function main() {
  // Собираем ссылки из файлов темы — там их и придётся править.
  // Два вида: в разметке href="/путь" и в массивах карточек 'href' => '/путь'.
  const { stdout: inMarkup } = await run('ssh', [SERVER,
    `grep -rhoE 'href="/[a-zA-Z0-9_/-]*"' ${THEME} --include='*.php' --include='*.html' | grep -v tilda-redirects`,
  ], { maxBuffer: 16e6 }).catch(() => ({ stdout: '' }))

  const { stdout: inArrays } = await run('ssh', [SERVER,
    `grep -rhoE "'href'[[:space:]]*=>[[:space:]]*'/[a-zA-Z0-9_/-]*'" ${THEME} --include='*.php' | grep -v tilda-redirects`,
  ], { maxBuffer: 16e6 }).catch(() => ({ stdout: '' }))

  const stdout = inMarkup + '\n' + inArrays.replace(/'href'\s*=>\s*'([^']+)'/g, 'href="$1"')

  const counts = new Map<string, number>()
  for (const m of stdout.matchAll(/href="([^"]+)"/g)) {
    const href = m[1]
    if (href === '/' || href.endsWith('/')) continue          // уже канонический вид
    if (/\.(php|jpg|png|svg|css|js|xml|txt)$/i.test(href)) continue
    counts.set(href, (counts.get(href) ?? 0) + 1)
  }

  console.log(`уникальных адресов без конечного слэша: ${counts.size}`)
  console.log(`всего таких ссылок в файлах темы: ${[...counts.values()].reduce((a, b) => a + b, 0)}\n`)

  const verdicts: Verdict[] = []
  for (const [href, count] of counts) {
    const { finalUrl, status, hops } = await resolve(href)
    let canonical: string | null = null
    let kind: Verdict['kind'] = 'ошибка'

    if (status === 200 && finalUrl) {
      canonical = await canonicalOf(finalUrl)
      const same = canonical && canonical.replace(/\/$/, '') === finalUrl.replace(/\/$/, '')
      kind = hops === 0 ? 'однозначная' : hops === 1 ? (same ? 'однозначная' : 'чужой canonical') : 'цепочка'
      if (hops === 0 && !same) kind = 'чужой canonical'
    }

    verdicts.push({ href, finalUrl, status, hops, canonical, kind, count })
  }

  const groups = ['однозначная', 'цепочка', 'чужой canonical', 'ошибка'] as const
  for (const g of groups) {
    const list = verdicts.filter((v) => v.kind === g)
    if (!list.length) continue
    const links = list.reduce((a, v) => a + v.count, 0)
    console.log(`\n── ${g}: адресов ${list.length}, ссылок ${links}`)
    for (const v of list.slice(0, g === 'однозначная' ? 5 : 40)) {
      console.log(`  ${v.href}`)
      console.log(`     → ${v.status ?? 'нет ответа'} ${v.finalUrl?.replace(SITE, '') ?? ''} (переходов ${v.hops})`)
      if (v.canonical) console.log(`     canonical: ${v.canonical.replace(SITE, '')}`)
    }
    if (g === 'однозначная' && list.length > 5) console.log(`  … и ещё ${list.length - 5}`)
  }

  const report = verdicts.map((v) =>
    `${v.kind}\t${v.href}\t${v.status ?? ''}\t${v.finalUrl ?? ''}\t${v.canonical ?? ''}\t${v.count}`).join('\n')
  fs.writeFileSync('docs/seo/links-audit.tsv',
    'вердикт\tисходный адрес\tответ\tконечный адрес\tcanonical\tссылок\n' + report + '\n')
  console.log('\nполная таблица: docs/seo/links-audit.tsv')

  if (!APPLY) {
    console.log('\nэто сухой прогон. Для правки однозначных: --apply')
    return
  }

  const safe = verdicts.filter((v) => v.kind === 'однозначная' && v.finalUrl)
  console.log(`\nправлю ${safe.length} адресов (${safe.reduce((a, v) => a + v.count, 0)} ссылок)…`)

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  await run('ssh', [SERVER, `mkdir -p /root/backups && tar czf /root/backups/theme-links-${stamp}.tgz -C ${path.dirname(THEME)} ${path.basename(THEME)}`])
  console.log(`копия темы: /root/backups/theme-links-${stamp}.tgz`)

  for (const v of safe) {
    const to = v.finalUrl!.replace(SITE, '')
    // sed по точному совпадению href="...", чтобы не задеть похожие строки
    for (const cmd of [
      `grep -rlF 'href="${v.href}"' ${THEME} --include='*.php' --include='*.html' | grep -v tilda-redirects | xargs -r sed -i 's|href="${v.href}"|href="${to}"|g'`,
      `grep -rlF "'href' => '${v.href}'" ${THEME} --include='*.php' | grep -v tilda-redirects | xargs -r sed -i "s|'href' => '${v.href}'|'href' => '${to}'|g"`,
    ]) {
      await run('ssh', [SERVER, cmd]).catch((e) => console.log(`  ✗ ${v.href}: ${e.message.slice(0, 80)}`))
    }
  }

  const { stdout: check } = await run('ssh', [SERVER, `php -l ${THEME}/inc/blog.php && echo OK`])
  console.log(check.includes('OK') ? '✓ синтаксис PHP цел' : '⚠ проверить синтаксис вручную')
  console.log(`откат: ssh ${SERVER} "tar xzf /root/backups/theme-links-${stamp}.tgz -C ${path.dirname(THEME)}"`)
}

main().catch((e) => { console.error('✗', e.message); process.exit(1) })
