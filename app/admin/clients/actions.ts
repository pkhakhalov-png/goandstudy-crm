'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function assignCurator(clientId: number, curatorId: string) {
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('curator_id')
    .eq('id', clientId)
    .single()

  if (!client) return { error: 'Клиент не найден' }
  if (client.curator_id) return { error: 'Куратор уже назначен' }

  const { data: curator } = await supabase
    .from('curators')
    .select('id, name')
    .eq('id', curatorId)
    .single()

  if (!curator) return { error: 'Куратор не найден' }

  const { error: updateErr } = await supabase
    .from('clients')
    .update({ curator_id: curator.id })
    .eq('id', clientId)
    .is('curator_id', null)

  if (updateErr) return { error: updateErr.message }

  await supabase
    .from('expenses')
    .update({ who: curator.name })
    .eq('client_id', clientId)
    .eq('article', 'curator')
    .or('who.is.null,who.eq.')

  revalidatePath('/admin/clients')
  revalidatePath('/admin/expenses')
  return { success: true }
}
