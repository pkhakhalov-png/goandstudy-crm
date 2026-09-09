'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateSchemaProposals } from '@/lib/seo/schema-gen'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Не авторизован' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Только админ' as const }
  return { error: null }
}

export async function generateSchema() {
  const { error } = await assertAdmin()
  if (error) return { error }
  try {
    const seo = (await createAdminClient()).schema('seo')
    const res = await generateSchemaProposals(seo)
    revalidatePath('/admin/seo/schema')
    return { success: true, ...res }
  } catch (e: any) { return { error: e?.message ?? 'ошибка' } }
}
