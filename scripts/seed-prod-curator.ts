import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Загружаем DEV креды (источник данных)
const devEnv = {} as Record<string, string>
config({ path: path.resolve(process.cwd(), '.env.development.local'), processEnv: devEnv })

// Загружаем PROD креды (цель)
const prodEnv = {} as Record<string, string>
config({ path: path.resolve(process.cwd(), '.env.local'), processEnv: prodEnv })

const DEV_URL = devEnv.NEXT_PUBLIC_SUPABASE_URL
const DEV_KEY = devEnv.SUPABASE_SERVICE_ROLE_KEY
const PROD_URL = prodEnv.NEXT_PUBLIC_SUPABASE_URL
const PROD_KEY = prodEnv.SUPABASE_SERVICE_ROLE_KEY

if (!DEV_URL || !DEV_KEY || !PROD_URL || !PROD_KEY) {
  console.error('Missing env vars')
  console.error({ DEV_URL: !!DEV_URL, DEV_KEY: !!DEV_KEY, PROD_URL: !!PROD_URL, PROD_KEY: !!PROD_KEY })
  process.exit(1)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const dev = createClient(DEV_URL, DEV_KEY, opts)
const prod = createClient(PROD_URL, PROD_KEY, opts)

async function main() {
  console.log(`DEV  source: ${DEV_URL}`)
  console.log(`PROD target: ${PROD_URL}`)
  console.log('')

  // 1. Проверяем что таблицы существуют на prod
  const { error: checkT } = await prod.from('curator_templates').select('id', { count: 'exact', head: true })
  if (checkT) {
    console.error(`\n❌ Таблица curator_templates отсутствует на проде: ${checkT.message}`)
    console.error('Применить миграцию 20260417000000_curator_portal.sql в Supabase Dashboard → SQL Editor.')
    process.exit(1)
  }
  const { error: checkR } = await prod.from('curator_resources').select('id', { count: 'exact', head: true })
  if (checkR) {
    console.error(`\n❌ Таблица curator_resources отсутствует на проде: ${checkR.message}`)
    process.exit(1)
  }
  console.log('✓ Обе таблицы существуют на проде')

  // 2. Забираем из dev
  const { data: templates, error: tErr } = await dev
    .from('curator_templates')
    .select('code, title, body, category, usage_hint, is_active')
  if (tErr) { console.error(tErr.message); process.exit(1) }

  const { data: resources, error: rErr } = await dev
    .from('curator_resources')
    .select('title, description, icon_code, url, login, password, category, is_active')
  if (rErr) { console.error(rErr.message); process.exit(1) }

  console.log(`✓ Из dev: ${templates?.length ?? 0} шаблонов, ${resources?.length ?? 0} ресурсов`)

  // 3. Чистим и заливаем на prod
  const { error: delT } = await prod.from('curator_templates').delete().not('id', 'is', null)
  if (delT) { console.error('delete templates:', delT.message); process.exit(1) }
  console.log('✓ Очищены curator_templates на проде')

  const { error: delR } = await prod.from('curator_resources').delete().not('id', 'is', null)
  if (delR) { console.error('delete resources:', delR.message); process.exit(1) }
  console.log('✓ Очищены curator_resources на проде')

  if (templates?.length) {
    const { error: insT } = await prod.from('curator_templates').insert(templates)
    if (insT) { console.error('insert templates:', insT.message); process.exit(1) }
    console.log(`✓ Вставлено ${templates.length} шаблонов`)
  }

  if (resources?.length) {
    const { error: insR } = await prod.from('curator_resources').insert(resources)
    if (insR) { console.error('insert resources:', insR.message); process.exit(1) }
    console.log(`✓ Вставлено ${resources.length} ресурсов`)
  }

  console.log('\n✅ Готово — прод засеян данными из dev')
}

main().catch(e => { console.error(e); process.exit(1) })
