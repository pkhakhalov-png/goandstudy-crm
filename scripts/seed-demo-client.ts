/**
 * CLI-обёртка над lib/demo-seed.ts. Логика наполнения там.
 *
 * Запуск:
 *   npx tsx scripts/seed-demo-client.ts            # пересоздать
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { resetDemoClient, DEMO_EMAIL, DEMO_PASSWORD } from '../lib/demo-seed'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function main() {
  const result = await resetDemoClient(sb as any)
  console.log(`✅ Демо ${result.recreated ? 'пересоздан' : 'создан'}: id=${result.clientId}`)
  console.log(`   email:    ${DEMO_EMAIL}`)
  console.log(`   password: ${DEMO_PASSWORD}`)
  console.log(`\nВход: https://crm.goandstudy.com/demo (auto-login)`)
}
main().catch(e => { console.error(e); process.exit(1) })
