import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../Sidebar'
import { AnalyticsShell } from './AnalyticsShell'
import { resolvePeriod, type Tab } from './lib/period'
import { MoneyTab } from './tabs/MoneyTab'
import { SalesTab } from './tabs/SalesTab'
import { CuratorsTab } from './tabs/CuratorsTab'
import { ForecastTab } from './tabs/ForecastTab'
import { CuratorPayoutsTab } from './tabs/CuratorPayoutsTab'
import { DbNotice } from './components/DbNotice'

// Отдельная статистика вторых выплат кураторам (остаток «этап 2») по месяцу
// ориентировочного оффера. Читает напрямую, не трогая RPC/цифры аналитики.
async function loadCuratorPayouts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('id, client_id, who, plan_sum, plan_date, note')
    .eq('article', 'curator')
    .eq('is_paid', false)
    .eq('note', 'Куратор — этап 2')
  if (error) return { error }

  const ids = [...new Set((expenses ?? []).map(e => e.client_id))]
  const [{ data: clients }, { data: curators }] = await Promise.all([
    ids.length
      ? supabase.from('clients').select('id, name, country, curator_id, expected_offer_month, status').in('id', ids)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('curators').select('id, name'),
  ])
  const clientMap = new Map((clients ?? []).map((c: any) => [c.id, c]))
  const curatorMap = new Map((curators ?? []).map((c: any) => [c.id, c.name]))

  const rows = (expenses ?? []).map((e: any) => {
    const c = clientMap.get(e.client_id)
    return {
      expenseId: e.id,
      clientId: e.client_id,
      clientName: c?.name ?? '—',
      country: c?.country ?? '',
      curator: e.who || (c?.curator_id ? curatorMap.get(c.curator_id) : null) || '—',
      amount: Number(e.plan_sum) || 0,
      month: c?.expected_offer_month ?? null,
      status: c?.status ?? null,
    }
  })
  return { data: { rows }, error: null }
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/sales')   // серверная проверка доступа

  const sp = await searchParams
  const tab = (['money', 'sales', 'curators', 'forecast', 'payouts'].includes(sp.tab) ? sp.tab : 'money') as Tab
  const period = resolvePeriod(sp)

  // Вкладка «Выплаты кураторам» считается напрямую (без RPC), чтобы не трогать
  // существующие функции аналитики и их цифры.
  let data: any = null
  let error: { message: string } | null = null
  if (tab === 'payouts') {
    const res = await loadCuratorPayouts(supabase)
    data = res.data
    error = res.error ?? null
  } else {
    // Один запрос на вкладку.
    const rpcName = tab === 'money' ? 'analytics_money'
      : tab === 'sales' ? 'analytics_sales'
      : tab === 'curators' ? 'analytics_curators'
      : 'analytics_forecast'
    const args = tab === 'forecast' ? {} : { p_from: period.from, p_to: period.to }
    const res = await supabase.rpc(rpcName, args)
    data = res.data
    error = res.error
  }

  return (
    <div className="app">
      <Sidebar activePage="analytics" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main" style={{ padding: 0 }}>
        <AnalyticsShell tab={tab} period={period}>
          {error ? <DbNotice message={error.message} /> : (
            tab === 'money' ? <MoneyTab data={data} period={period} />
            : tab === 'sales' ? <SalesTab data={data} period={period} />
            : tab === 'curators' ? <CuratorsTab data={data} period={period} />
            : tab === 'payouts' ? <CuratorPayoutsTab data={data} />
            : <ForecastTab data={data} />
          )}
        </AnalyticsShell>
      </div>
    </div>
  )
}
