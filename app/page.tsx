import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'admin') redirect('/admin/clients')
  if (profile?.role === 'rop') redirect('/rop')
  if (profile?.role === 'curator') redirect('/curator')
  if (profile?.role === 'client') redirect('/client')
  redirect('/sales')
}