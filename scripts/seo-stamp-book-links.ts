/**
 * Дометить ссылки «Записаться на консультацию» в уже опубликованных статьях.
 *
 *   npx tsx scripts/seo-stamp-book-links.ts           — холостой прогон
 *   npx tsx scripts/seo-stamp-book-links.ts --apply   — записать на сервер
 *
 * Зачем: без меток уведомление о новой записи показывает адрес самой формы и
 * не отвечает на вопрос, с какой страницы и по какой кнопке пришёл человек.
 * Подробности — в lib/booking-link.ts.
 */
import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const apply = process.argv.includes('--apply')
  const { stampPublishedBookLinks } = await import('../lib/seo/theme-publish')

  console.log(apply ? 'ЗАПИСЬ НА СЕРВЕР' : 'ХОЛОСТОЙ ПРОГОН (ничего не пишем)')
  const res = await stampPublishedBookLinks({ dryRun: !apply })

  const changed = res.filter((r) => r.changed)
  for (const r of changed) console.log(`  ${r.slug.padEnd(46)} ссылок: ${r.links}`)

  const noLinks = res.filter((r) => r.links === 0)
  console.log(`\nстатей: ${res.length} · с метками ${apply ? 'проставлены' : 'были бы проставлены'}: ${changed.length}`)
  if (noLinks.length) console.log(`без единой ссылки на запись: ${noLinks.length} — ${noLinks.map((r) => r.slug).join(', ')}`)
  if (!apply && changed.length) console.log('\nчтобы записать: npx tsx scripts/seo-stamp-book-links.ts --apply')
}
main()
