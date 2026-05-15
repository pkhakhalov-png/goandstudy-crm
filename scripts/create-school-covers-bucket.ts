import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  // Проверяем существует ли
  const { data: existing } = await sb.storage.getBucket('school-covers')
  if (existing) {
    console.log('Bucket уже существует:', existing)
    // Обновим параметры на всякий
    const { error } = await sb.storage.updateBucket('school-covers', {
      public: true,
      fileSizeLimit: 3 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    })
    if (error) console.error('update:', error.message)
    else console.log('✓ обновили лимиты/публичность')
    return
  }

  const { error } = await sb.storage.createBucket('school-covers', {
    public: true,
    fileSizeLimit: 3 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  })
  if (error) { console.error('create:', error.message); process.exit(1) }
  console.log('✓ Bucket «school-covers» создан')
}
main().catch(e => { console.error(e); process.exit(1) })
