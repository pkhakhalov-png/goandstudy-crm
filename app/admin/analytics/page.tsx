import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '../Sidebar'
import { AnalyticsShell } from './AnalyticsShell'
import { resolvePeriod, type Tab } from './lib/period'
import { MoneyTab } from './tabs/MoneyTab'
import { SalesTab } from './tabs/SalesTab'
import { CuratorsTab } from './tabs/CuratorsTab'
import { ForecastTab } from './tabs/ForecastTab'
import { DbNotice } from './components/DbNotice'

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('name, role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/sales')   // серверная проверка доступа

  const sp = await searchParams
  const tab = (['money', 'sales', 'curators', 'forecast'].includes(sp.tab) ? sp.tab : 'money') as Tab
  const period = resolvePeriod(sp)

  // Один запрос на вкладку.
  const rpcName = tab === 'money' ? 'analytics_money'
    : tab === 'sales' ? 'analytics_sales'
    : tab === 'curators' ? 'analytics_curators'
    : 'analytics_forecast'
  const args = tab === 'forecast' ? {} : { p_from: period.from, p_to: period.to }
  const { data, error } = await supabase.rpc(rpcName, args)

  return (
    <div className="app">
      <Sidebar activePage="analytics" userName={profile?.name || ''} userEmail={user.email || ''} />
      <div className="main" style={{ padding: 0 }}>
        <AnalyticsShell tab={tab} period={period}>
          {error ? <DbNotice message={error.message} /> : (
            tab === 'money' ? <MoneyTab data={data} period={period} />
            : tab === 'sales' ? <SalesTab data={data} period={period} />
            : tab === 'curators' ? <CuratorsTab data={data} period={period} />
            : <ForecastTab data={data} />
          )}
        </AnalyticsShell>
      </div>
    </div>
  )
}
