import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const fin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('finance') as any
async function main() {
  const { data } = await fin.from('source_events')
    .select('created_at, kind, state, error, chat_id, from_tg_id, text')
    .order('created_at', { ascending: false }).limit(10)
  console.log(`событий: ${data?.length ?? 0}`)
  for (const e of data ?? []) {
    const text = e.text ? String(e.text).replace(/start=\w+/, 'start=…') : '—'
    console.log(`  ${new Date(e.created_at).toLocaleTimeString('ru-RU')} · ${e.kind} · ${e.state}${e.error ? ` (${e.error})` : ''} · от ${e.from_tg_id} · ${text.slice(0, 70)}`)
  }
  const { data: tokens } = await fin.from('link_tokens').select('created_at, expires_at, used_at')
  console.log(`\nссылок выдано: ${tokens?.length ?? 0}`, (tokens ?? []).map((t: any) => t.used_at ? 'использована' : (new Date(t.expires_at) < new Date() ? 'протухла' : 'ждёт')).join(', '))
  const { data: b } = await fin.from('telegram_bindings').select('telegram_id, telegram_name, status')
  console.log('привязок:', JSON.stringify(b))
  const { data: chats } = await fin.from('telegram_chats').select('chat_id, title, kind, is_allowed')
  console.log('чаты:', JSON.stringify(chats))
  const { data: audit } = await fin.from('audit_events').select('action, at').order('at', { ascending: false }).limit(5)
  console.log('журнал:', (audit ?? []).map((a: any) => `${a.action} в ${new Date(a.at).toLocaleTimeString('ru-RU')}`).join(', '))
}
main()
