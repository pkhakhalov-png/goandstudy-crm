// Читается ли источник вообще.
//
//   npx tsx scripts/seo-sources-probe.ts https://... [https://...]
//   npx tsx scripts/seo-sources-probe.ts --текст <папка> https://...   # сохранить текст
//
// Прежде чем заводить страницу в реестр, надо знать, отдаёт ли она текст тому,
// кто придёт за ним роботом. Половина официальных сайтов отвечает 403 на чужой
// User-Agent, другая половина отдаёт пустой каркас под JavaScript — и в обоих
// случаях источник в реестре будет числиться, а подтверждать ничего не станет.
// Дешевле узнать это до записи, чем потом гадать, почему утверждения висят
// неподтверждёнными.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { safeFetch } from '../lib/seo/safe-fetch'
import { extractText } from '../lib/seo/provenance'
import fs from 'node:fs'

const UA = process.env.SEO_CRAWL_USER_AGENT || 'goandstudy-seo-bot'

// Куда сложить извлечённый текст. Без него страницу приходится читать глазами
// в браузере — а робот видит совсем другое, и решать надо по тому, что видит он.
const dumpAt = (() => {
  const i = process.argv.indexOf('--текст')
  return i > 0 ? process.argv[i + 1] : null
})()

async function probe(url: string) {
  const res = await safeFetch(url, UA)
  if (!res.ok) { console.log(`✗ ${url}\n   ${res.reason}${res.status ? ` (HTTP ${res.status})` : ''}`); return }
  const text = extractText(res.body.toString('utf8'))
  const numbers = [...text.matchAll(/[€£$¥]\s?[\d  ,.]{3,}|[\d  ,.]{3,}\s?(?:EUR|GBP|USD|CHF|HUF|CAD|AED|CNY|евро|фунт)/gi)]
    .map((m) => m[0].trim()).slice(0, 8)
  console.log(`✓ ${url}`)
  console.log(`   HTTP ${res.status}, ${res.body.length} байт, ${text.length} символов текста`)
  if (res.finalUrl !== url) console.log(`   после редиректов: ${res.finalUrl}`)
  if (numbers.length) console.log(`   суммы на странице: ${numbers.join(' | ')}`)
  else console.log('   сумм на странице не видно — либо их там нет, либо текст пришёл пустым')
  if (dumpAt) {
    fs.mkdirSync(dumpAt, { recursive: true })
    const name = url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 90) + '.txt'
    fs.writeFileSync(`${dumpAt}/${name}`, text)
    console.log(`   текст: ${dumpAt}/${name}`)
  }
}

async function main() {
  const urls = process.argv.slice(2).filter((a) => a.startsWith('http'))
  if (!urls.length) { console.error('Укажи один или несколько URL'); process.exit(1) }
  for (const u of urls) { await probe(u); console.log('') }
}
main()
