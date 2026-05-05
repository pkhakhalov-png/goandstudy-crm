/**
 * Аудит индексов в трёх базах: main CRM, parser, scholarships.
 * Цель — увидеть что уже есть и не плодить дубликаты при создании новых.
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const DBS = [
  {
    name: 'main',
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
  {
    name: 'parser',
    url: process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL!,
    key: process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY!,
  },
  {
    name: 'scholarships',
    url: process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_URL || '',
    key: process.env.SCHOLARSHIPS_SUPABASE_SERVICE_ROLE_KEY || '',
  },
]

async function auditDb(name: string, url: string, key: string) {
  if (!url || !key) {
    console.log(`\n=== ${name} === SKIPPED (no env)`)
    return
  }
  console.log(`\n=== ${name} (${url}) ===`)
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // Используем pg_indexes via REST: сделаем RPC через execute_sql если есть, иначе через информационную схему. Через REST читать pg_indexes напрямую нельзя — но можно через RPC если функция exposed.
  // Попробуем простой путь: через PostgREST, читая pg_indexes (если открыт public schema).
  const { data, error } = await sb.rpc('pg_indexes_list').select() as any
  if (error) {
    console.log('  RPC pg_indexes_list не доступен. Альтернатива: ручной SQL из дашборда.')
    console.log('  error:', error.message)
    return
  }
  console.log('  indexes:', data?.length)
}

async function main() {
  for (const d of DBS) await auditDb(d.name, d.url, d.key)
  console.log('\n--- Подсказка ---')
  console.log('Если RPC недоступен, придётся выполнять SQL через Supabase SQL Editor.')
  console.log('Или: добавить простую функцию list_indexes() в каждую БД миграцией.')
}
main()
