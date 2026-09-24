import { createAdminClient } from '@/lib/supabase/server'
import { readAll } from '@/lib/supabase/read-all'
import { последниеРазборы, оценить, type Analysis } from '@/lib/sales/pressure'
import { HotDashboard } from './HotDashboard'

export const dynamic = 'force-dynamic'

export default async function HotPage() {
  const admin = await createAdminClient()

  const [{ data: analyses }, { data: stages }, { data: users }] = await Promise.all([
    readAll<Analysis>(() => admin
      .from('deal_analyses')
      .select('deal_id, client_type, next_step, summary, created_at, payload')
      .order('created_at', { ascending: false })
      .order('deal_id'),
    ).then(data => ({ data })),
    admin.from('pipeline_stages').select('id, name, stage_type'),
    admin.from('users').select('id, name'),
  ])

  const свежие = последниеРазборы(analyses ?? [])

  // Сделки тянем только под те разборы, что есть: список дожима — это не
  // «вся воронка», а её разобранная часть.
  const dealIds = свежие.map(a => a.deal_id)
  const { data: deals } = dealIds.length
    ? await admin
        .from('deals')
        .select('id, title, contact_name, contact_phone, stage_id, salesperson_id, created_at, deleted_at')
        .in('id', dealIds)
    : { data: [] }

  const stageMap = Object.fromEntries((stages ?? []).map(s => [s.id, s]))
  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u.name]))
  const dealMap = Object.fromEntries((deals ?? []).map(d => [d.id, d]))

  const строки = свежие
    .map(a => {
      const d = dealMap[a.deal_id]
      // Удалённые и уже купившие в дожим не попадают: первых нет, вторых
      // дожимать нечего — они уже заплатили.
      if (!d || d.deleted_at) return null
      const st = stageMap[d.stage_id]
      if (st?.stage_type === 'success' || st?.stage_type === 'lost') return null

      const оценка = оценить(a)
      if (!оценка) return null

      return {
        ...оценка,
        title: d.title,
        contactName: d.contact_name,
        contactPhone: d.contact_phone,
        stageName: st?.name ?? '—',
        salesperson: userMap[d.salesperson_id] ?? '—',
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.готовность - a.готовность)

  return (
    <div className="main">
      <div className="topbar"><div className="pt">Кого дожимать</div></div>
      <div style={{ padding: '20px 24px' }}>
        <HotDashboard items={строки as any[]} разобрано={свежие.length} />
      </div>
    </div>
  )
}
