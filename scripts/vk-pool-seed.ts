/**
 * Залить заготовленные фотографии VK в `seo.vk_photo_pool`.
 *
 *   npx tsx scripts/vk-pool-seed.ts
 *
 * Партия готовится отдельно и вручную: загрузить фотографию в VK может только
 * ключ пользователя, а он живёт сутки (docs/spikes/vk.md). Результат той
 * работы — файл `data/vk-photo-pool.json` с постоянными идентификаторами
 * загруженных фотографий. Этот скрипт переносит их в базу, откуда их берёт
 * шаг `vk_autopost`.
 *
 * Повторный запуск безопасен: строки различаются по слагу, уже потраченные
 * не трогаются. Это важно — сбросить `used_at` значило бы опубликовать те же
 * посты второй раз, а удалить их ключом сообщества нельзя.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

type Item = {
  slug: string
  url: string
  title: string
  description?: string
  attachment: string
  kb?: number
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SECRET_KEY')

  const seo = createClient(url, key, { db: { schema: 'seo' } })
  const items: Item[] = JSON.parse(readFileSync('data/vk-photo-pool.json', 'utf8')).items

  const { data: было } = await seo.from('vk_photo_pool').select('slug')
  const есть = new Set((было ?? []).map((r: any) => r.slug))

  const новые = items.filter((i) => !есть.has(i.slug))
  if (!новые.length) {
    console.log(`в базе уже ${есть.size} строк, новых нет`)
    return
  }

  const { error } = await seo.from('vk_photo_pool').insert(
    новые.map((i) => ({
      slug: i.slug,
      article_url: i.url,
      title: i.title,
      description: i.description ?? null,
      attachment: i.attachment,
      kb: i.kb ?? null,
    })),
  )
  if (error) throw new Error(`вставка не прошла: ${error.message}`)

  const { count } = await seo.from('vk_photo_pool')
    .select('*', { count: 'exact', head: true }).is('used_at', null)
  console.log(`добавлено ${новые.length}, в запасе теперь ${count}`)
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1) })
