// Проверка WordPress Bridge против прод-сайта. Безопасно: создаёт ТОЛЬКО черновик.
// Запускать после открытия namespace на сервере и заполнения WP_* в .env.local.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { wp, wpConfigured } from '../lib/seo/wp'

async function main() {
  if (!wpConfigured()) { console.error('✗ Нет WP_BASE_URL / WP_BRIDGE_SECRET в .env.local'); process.exit(1) }
  const key = 'gs-seo-selftest-1'

  console.log('1) lookup несуществующего ключа…')
  const l1 = await wp.lookup(key)
  console.log('   →', JSON.stringify(l1))

  console.log('2) создать черновик (draft, не публикация)…')
  const created = await wp.createPost({
    key, status: 'draft',
    title: '[TEST] Go&Study SEO Bridge — можно удалить',
    content: '<p>Тестовый черновик моста. Создан автоматически для проверки связи. Удалите в админке.</p>',
    meta_description: 'Тестовый черновик — удалить.',
  })
  console.log('   →', JSON.stringify(created))
  const postId = created.post_id

  console.log('3) lookup после создания…')
  console.log('   →', JSON.stringify(await wp.lookup(key)))

  if (postId) {
    console.log('4) rendered (как видит бот) — статус и наличие canonical…')
    const r = await wp.rendered(postId)
    const html = String(r.html || '')
    console.log(`   → HTTP ${r.status}, canonical: ${/<link[^>]+rel=["']canonical/i.test(html) ? 'есть' : 'нет'}, длина HTML ${html.length}`)
  }

  console.log(`\n✓ Мост работает. Тестовый черновик post_id=${postId} — удали в WP-admin (Черновики).`)
}
main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
