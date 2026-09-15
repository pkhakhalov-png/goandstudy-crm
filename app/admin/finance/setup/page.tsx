import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { viewer } from '@/lib/auth/viewer'
import { formatMinor } from '@/lib/finance/money'
import { balances, currentRate, financeAccess, financeDb, listAccounts } from '@/lib/finance/service'
import { Settings } from './Settings'

export const dynamic = 'force-dynamic'

/**
 * Начало учёта и настройки модуля.
 *
 * Пока счетов нет, сюда пускается администратор CRM — иначе первый доступ
 * выдавать было бы некому. Как только учёт начат, страница показывает уже
 * заведённые счета и правит их только владелец финансов.
 */
export default async function FinanceSetupPage() {
  const { user, profile } = await viewer()
  const level = await financeAccess(user?.id)
  const accounts = await listAccounts(true)

  const canStart = level === 'owner' || (accounts.length === 0 && profile?.role === 'admin')
  if (!canStart) {
    return (
      <div className="main">
        <div className="topbar"><div className="pt">Финансы · настройка</div></div>
        <div className="cnt">
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Настройка доступна владельцу финансового модуля.
          </p>
        </div>
      </div>
    )
  }

  // Учёт уже начат — показываем, что есть, и не даём завести второй набор
  // счетов поверх первого: начальные остатки нельзя незаметно перезаписать.
  if (accounts.length) {
    const db = await financeDb()
    const sbUsers = await createAdminClient()
    const [bal, rate, { data: access }, { data: bindings }, { data: allUsers }] = await Promise.all([
      balances(),
      currentRate(),
      db.from('access').select('user_id, level').is('revoked_at', null),
      db.from('telegram_bindings').select('telegram_id, telegram_name, user_id').eq('status', 'active'),
      sbUsers.from('users').select('id, name, email, role').eq('is_active', true)
        .in('role', ['admin', 'rop', 'salesperson']).order('role'),
    ])

    // Имена к доступам подставляем здесь: в схеме finance их нет, и join через
    // PostgREST между схемами не сделать.
    const accessRows = (access ?? []).map((a: any) => {
      const u = (allUsers ?? []).find((x: any) => x.id === a.user_id)
      return { user_id: a.user_id, level: a.level, name: u?.name ?? 'неизвестный пользователь', email: u?.email ?? null }
    })
    return (
      <div className="main">
        <div className="topbar">
          <div className="pt">Финансы · настройка</div>
          <Link href="/admin/finance" className="btn-s" style={{ padding: '7px 12px', fontSize: 12 }}>К обзору</Link>
        </div>
        <div className="cnt">
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Счета</div>
          <div style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
            {bal.map((b) => (
              <div key={b.id} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                border: '1px solid var(--bor)', borderRadius: 12, padding: '12px 14px',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                    учёт с {new Date(b.opening_at).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })}
                    {' · '}начальный остаток {formatMinor(b.opening_minor, b.currency)}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>
                  {formatMinor(b.balance_minor, b.currency)}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginTop: 14, maxWidth: 640 }}>
            Начальный остаток после начала работы не переписывается: если он оказался
            неверным, это оформляется отдельной операцией-корректировкой с причиной,
            чтобы в истории осталось видно, что и почему поменялось.
          </p>

          <Settings rate={rate} access={accessRows} users={allUsers ?? []} bindings={bindings ?? []} />
        </div>
      </div>
    )
  }

  const sb = await createAdminClient()
  const { data: users } = await sb
    .from('users')
    .select('id, name, email, role')
    .eq('is_active', true)
    .in('role', ['admin', 'rop', 'salesperson'])
    .order('role')

  const { SetupForm } = await import('./SetupForm')

  return (
    <div className="main">
      <div className="topbar">
        <div className="pt">Финансы · начало учёта</div>
        <Link href="/admin/finance" className="btn-s" style={{ padding: '7px 12px', fontSize: 12 }}>Назад</Link>
      </div>
      <div className="cnt">
        <SetupForm users={users ?? []} defaultOwnerId={user!.id} />
      </div>
    </div>
  )
}
