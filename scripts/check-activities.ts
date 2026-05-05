import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  // Бэкфилл: подсыпать essay_approved для уже одобренных essays, у которых нет лога.
  const { data: ess } = await sb
    .from('client_essays')
    .select('client_id, type, approved_at')
    .eq('status', 'approved')
  console.log(`Found ${ess?.length || 0} approved essays`)

  for (const e of ess || []) {
    if (!e.approved_at) continue
    const { data: existing } = await sb
      .from('client_activities')
      .select('id')
      .eq('client_id', e.client_id)
      .eq('activity_type', 'essay_approved')
      .ilike('content', `%${e.type === 'resume' ? 'резюме' : 'мотивационное'}%`)
      .maybeSingle()
    if (existing) {
      console.log(`  client=${e.client_id} ${e.type}: already logged, skip`)
      continue
    }
    const { error } = await sb.from('client_activities').insert({
      client_id: e.client_id,
      user_id: null,
      activity_type: 'essay_approved',
      content: e.type === 'resume' ? 'Куратор утвердил резюме' : 'Куратор утвердил мотивационное письмо',
      metadata: { essay_type: e.type, backfilled: true },
      created_at: e.approved_at,
    })
    if (error) console.log(`  client=${e.client_id} ${e.type}: insert FAILED — ${error.message}`)
    else console.log(`  client=${e.client_id} ${e.type}: backfilled ✓`)
  }

  console.log('\nLast 10 activities:')
  const { data: acts } = await sb
    .from('client_activities')
    .select('client_id, activity_type, content, created_at')
    .order('created_at', { ascending: false })
    .limit(10)
  for (const a of acts || []) {
    console.log(`  ${a.created_at} · client=${a.client_id} · ${a.activity_type} · ${a.content}`)
  }
}
main()
