// Оповестить поисковики о новой или обновлённой странице.
//   npx tsx scripts/seo-indexnow.ts https://goandstudy.com/blog/slug/
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { submitToIndexNow, indexNowKey, indexNowKeyPublished, googleStatus } from '../lib/seo/indexnow'

async function main() {
  const urls = process.argv.slice(2).filter((a) => a.startsWith('http'))
  if (!urls.length) { console.error('Укажи адрес страницы'); process.exit(1) }

  const key = indexNowKey()
  if (!key) { console.error('✗ нет INDEXNOW_KEY'); process.exit(1) }
  const published = await indexNowKeyPublished(key)
  console.log(`ключ на сайте: ${published ? 'подтверждён' : 'НЕ отдаётся — запросы отклонят'}`)

  const res = await submitToIndexNow(urls)
  console.log(`IndexNow (Яндекс, Bing, Seznam, Naver): ${res.ok ? '✓' : '✗'} ${res.status} — ${res.note}`)

  for (const u of urls) {
    const g = await googleStatus(u)
    console.log(`Google: ${g.note}`)
  }
  console.log('\nОтправить страницу «на индексацию» в Google нельзя: их ping отключён в 2023,')
  console.log('а Indexing API предназначен для вакансий и трансляций. Работают sitemap и Search Console.')
}
main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
