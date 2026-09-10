/**
 * Инвентарь таблиц public.* + RLS-статус для планирования политик.
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.local') })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  // Список таблиц с RLS-статусом через REST не достать —
  // делаем через select из information_schema нельзя. Возьмём
  // обходным путём: дернём admin-rest на /rest/v1/?select=  не получим.
  // Самый простой путь — через RPC, но её нет. Поэтому покажу хотя бы те таблицы,
  // которые точно используются в коде (соберу через grep отдельным скриптом).
  // Здесь — просто покажем кол-во строк по ключевым таблицам.
  const known = [
    'users', 'clients', 'payments', 'expenses', 'fixed_expenses',
    'curators', 'curator_invitations', 'curator_templates', 'curator_resources',
    'curator_stage_checklist',
    'deals', 'deal_messages', 'deal_files', 'deal_tasks', 'deal_activities',
    'invoices', 'bookings', 'sales_plans',
    'client_applications', 'client_documents', 'client_essays',
    'client_scholarships', 'client_shortlists', 'client_universities',
    'client_activities', 'client_invitations',
    'client_tg_messages', 'client_tg_files',
    'application_documents', 'application_events',
    'application_profile_data', 'school_application_profiles',
  ]
  for (const t of known) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true })
    if (error) console.log(`${t.padEnd(35)} ✕ ${error.message}`)
    else console.log(`${t.padEnd(35)} ${count ?? 0} rows`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
