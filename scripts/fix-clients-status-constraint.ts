/**
 * Расширяет clients_status_check, чтобы разрешить status='refunded'.
 * Допустимые значения: active, completed, refunded.
 *
 * Использует встроенный sql() через supabase-js — он работает только
 * если на проекте есть RPC `exec_sql`. Если её нет — выдаст SQL для
 * ручного применения через Supabase SQL Editor.
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const SQL = `
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_status_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IN ('active','completed','refunded'));
`.trim()

async function main() {
  // Пробуем через RPC exec_sql (если такая есть)
  const { error } = await sb.rpc('exec_sql', { sql: SQL })
  if (!error) {
    console.log('✓ Constraint обновлён через RPC exec_sql')
    return
  }

  console.log('RPC exec_sql недоступен:', error.message)
  console.log('\nПрименить SQL вручную через Supabase SQL Editor:')
  console.log('───────────────────────────────────────────────')
  console.log(SQL)
  console.log('───────────────────────────────────────────────')
}
main().catch(e => { console.error(e); process.exit(1) })
