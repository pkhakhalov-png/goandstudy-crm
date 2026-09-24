import { createAdminClient } from '@/lib/supabase/server'
import { StuckDashboard } from './StuckDashboard'
import { readAll } from '@/lib/supabase/read-all'

export default async function StuckPage() {
  const admin = await createAdminClient()
  const [
    { data: salespersons },
    { data: deals },
    { data: stages },
    { data: settings },
    { data: touches },
  ] = await Promise.all([
    admin.from('users').select('id, name, is_active').eq('role', 'salesperson').order('name'),
    readAll(() => admin.from('deals').select('id, title, stage_id, salesperson_id, budget, created_at, updated_at, deleted_at').is('deleted_at', null).order('id')).then(data => ({ data })),
    // `counts_in_sales` отсекает потоки, которые продажами не являются:
    // «НЕ ЦЕЛЕВЫЕ», «Релокац», групповые чаты. Пока они были в общей куче,
    // список застрявших состоял из 1041 сделки — из всей базы.
    admin.from('pipeline_stages').select('id, name, position, stage_type, counts_in_sales').eq('is_active', true).order('position'),
    admin.from('rop_settings').select('key, value'),
    // Последнее касание человеком — из представления, а не из deals.updated_at,
    // который двигает любое входящее сообщение (см. миграцию 20260924120000).
    readAll(() => admin.from('v_deal_last_touch').select('deal_id, last_touch_at, last_human_activity_at, last_outgoing_at').order('deal_id')).then(data => ({ data })),
  ])

  return (
    <div className="main">
      <div className="topbar"><div className="pt">Застрявшие сделки</div></div>
      <div style={{ padding: '20px 24px' }}>
        <StuckDashboard
          salespersons={salespersons ?? []}
          deals={deals ?? []}
          stages={stages ?? []}
          settings={settings ?? []}
          touches={touches ?? []}
        />
      </div>
    </div>
  )
}
