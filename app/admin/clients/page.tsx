import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { logout } from '@/app/login/actions'

export default async function AdminClientsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  const { data: clients } = await supabase
    .from('clients')
    .select(`
      id, name, phone, country, university, status, created_at,
      users!salesperson_id (name),
      curators (name),
      payments (id, is_paid, plan_sum, plan_date)
    `)
    .order('created_at', { ascending: false })

  const statusLabel: Record<string, string> = {
    active: 'Активный',
    completed: 'Завершён',
    frozen: 'Заморожен',
  }

  const statusColor: Record<string, string> = {
    active: 'text-blue-400',
    completed: 'text-purple-400',
    frozen: 'text-gray-400',
  }

  return (
    <div className="min-h-screen bg-[#252628] text-white">
      <header className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-[#B15ECC]">Go And Study CRM</h1>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin" className="text-gray-400 hover:text-white">Главная</Link>
            <Link href="/admin/clients" className="text-white font-medium">Клиенты</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user.email}</span>
          <form action={logout}>
            <button className="text-sm text-gray-400 hover:text-white">Выйти</button>
          </form>
        </div>
      </header>

      <main className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Клиенты</h2>
          <span className="text-gray-400 text-sm">{clients?.length ?? 0} клиентов</span>
        </div>

        <div className="bg-[#1a1a1c] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400 text-sm">
                <th className="text-left px-4 py-3">Имя</th>
                <th className="text-left px-4 py-3">Телефон</th>
                <th className="text-left px-4 py-3">Страна</th>
                <th className="text-left px-4 py-3">Продажник</th>
                <th className="text-left px-4 py-3">Куратор</th>
                <th className="text-left px-4 py-3">Статус</th>
                <th className="text-left px-4 py-3">Оплачено</th>
              </tr>
            </thead>
            <tbody>
              {clients?.map((client) => {
                const payments = client.payments ?? []
                const paid = payments.filter((p: any) => p.is_paid).length
                const total = payments.length
                const paidSum = payments
                  .filter((p: any) => p.is_paid)
                  .reduce((sum: number, p: any) => sum + Number(p.plan_sum), 0)
                const totalSum = payments
                  .reduce((sum: number, p: any) => sum + Number(p.plan_sum), 0)

                return (
                  <tr key={client.id} className="border-b border-gray-800 hover:bg-[#252628] transition-colors">
                    <td className="px-4 py-3 font-medium">{client.name}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{client.phone ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{client.country ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{(client.users as any)?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{(client.curators as any)?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${statusColor[client.status]}`}>
                        {statusLabel[client.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-green-400">{paidSum.toLocaleString('ru')} ₽</span>
                      <span className="text-gray-500"> / {totalSum.toLocaleString('ru')} ₽</span>
                      <span className="text-gray-500 ml-1">({paid}/{total})</span>
                    </td>
                  </tr>
                )
              })}
              {(!clients || clients.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Клиентов пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}