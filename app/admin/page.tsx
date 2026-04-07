import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logout } from '@/app/login/actions'

export default async function AdminPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/sales')

  return (
    <div className="min-h-screen bg-[#252628] text-white">
      <header className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#B15ECC]">Go And Study CRM</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user.email}</span>
          <form action={logout}>
            <button className="text-sm text-gray-400 hover:text-white transition-colors">
              Выйти
            </button>
          </form>
        </div>
      </header>
      
      <main className="p-6">
        <h2 className="text-2xl font-bold mb-2">Добро пожаловать, Admin</h2>
        <p className="text-gray-400">CRM система работает. Следующий шаг — добавить разделы.</p>
      </main>
    </div>
  )
}