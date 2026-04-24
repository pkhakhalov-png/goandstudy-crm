import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.development.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars in .env.development.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(v)
  const s = String(v).replace(/'/g, "''")
  return `'${s}'`
}

async function main() {
  console.log(`Exporting from ${SUPABASE_URL}`)

  const { data: templates, error: tErr } = await supabase
    .from('curator_templates')
    .select('code, title, body, category, usage_hint, is_active')
    .order('category')

  if (tErr) {
    console.error('templates error:', tErr.message)
    process.exit(1)
  }

  const { data: resources, error: rErr } = await supabase
    .from('curator_resources')
    .select('title, description, icon_code, url, login, password, category, is_active')

  if (rErr) {
    console.error('resources error:', rErr.message)
    process.exit(1)
  }

  let sql = '-- Export: curator_templates + curator_resources from dev Supabase\n'
  sql += `-- Source: ${SUPABASE_URL}\n`
  sql += `-- Generated: ${new Date().toISOString()}\n\n`

  sql += '-- ═══ curator_templates ═══\n'
  sql += '-- Удаляем старые шаблоны и вставляем актуальные\n'
  sql += 'DELETE FROM public.curator_templates;\n\n'

  for (const t of templates ?? []) {
    sql += `INSERT INTO public.curator_templates (code, title, body, category, usage_hint, is_active) VALUES (\n`
    sql += `  ${sqlLiteral(t.code)},\n`
    sql += `  ${sqlLiteral(t.title)},\n`
    sql += `  ${sqlLiteral(t.body)},\n`
    sql += `  ${sqlLiteral(t.category)},\n`
    sql += `  ${sqlLiteral(t.usage_hint)},\n`
    sql += `  ${sqlLiteral(t.is_active)}\n`
    sql += `);\n\n`
  }

  sql += '\n-- ═══ curator_resources ═══\n'
  sql += 'DELETE FROM public.curator_resources;\n\n'

  for (const r of resources ?? []) {
    sql += `INSERT INTO public.curator_resources (title, description, icon_code, url, login, password, category, is_active) VALUES (\n`
    sql += `  ${sqlLiteral(r.title)},\n`
    sql += `  ${sqlLiteral(r.description)},\n`
    sql += `  ${sqlLiteral(r.icon_code)},\n`
    sql += `  ${sqlLiteral(r.url)},\n`
    sql += `  ${sqlLiteral(r.login)},\n`
    sql += `  ${sqlLiteral(r.password)},\n`
    sql += `  ${sqlLiteral(r.category)},\n`
    sql += `  ${sqlLiteral(r.is_active)}\n`
    sql += `);\n\n`
  }

  const out = path.resolve(process.cwd(), 'scripts/curator-seed-prod.sql')
  fs.writeFileSync(out, sql)

  console.log(`\n✅ Exported ${templates?.length ?? 0} templates, ${resources?.length ?? 0} resources`)
  console.log(`   → ${out}`)
  console.log(`\nОткрой файл, скопируй содержимое, выполни в SQL Editor prod-Supabase.`)
}

main().catch(e => { console.error(e); process.exit(1) })
