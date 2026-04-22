'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { revalidatePath } from 'next/cache'

async function requireCuratorId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = await createAdminClient()
  const { data: curator } = await admin
    .from('curators')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!curator?.id) throw new Error('Curator record not found')
  return curator.id
}

export async function addToShortlist(params: {
  clientId: number
  schoolId: number
  programId: number
}) {
  const curatorId = await requireCuratorId()
  const admin = await createAdminClient()

  // Проверяем, что клиент действительно закреплён за этим куратором
  const { data: client } = await admin
    .from('clients')
    .select('id, curator_id')
    .eq('id', params.clientId)
    .maybeSingle()
  if (!client || client.curator_id !== curatorId) {
    throw new Error('Client not assigned to this curator')
  }

  // Тянем денормализованные данные из парсер-базы
  const parser = createParserClient()
  const [{ data: school }, { data: program }] = await Promise.all([
    parser.from('schools').select('id, name, country_code').eq('id', params.schoolId).maybeSingle(),
    parser.from('programs').select('id, name, tuition, raw_data').eq('id', params.programId).maybeSingle(),
  ])
  if (!school || !program) throw new Error('School or program not found')

  const currency = (program.raw_data as any)?.attributes?.currency_of_fees?.code
    ?? (program.raw_data as any)?.attributes?.currency
    ?? null

  const { error } = await admin.from('client_shortlists').insert({
    client_id: params.clientId,
    curator_id: curatorId,
    school_id: school.id,
    program_id: program.id,
    school_name: school.name,
    program_name: program.name,
    country_code: school.country_code,
    tuition: program.tuition,
    currency,
  })

  // 23505 = уже есть в подборке — это ок
  if (error && error.code !== '23505') throw error

  revalidatePath(`/curator/clients/${params.clientId}`)
  revalidatePath('/curator')
  return { ok: true, alreadyAdded: error?.code === '23505' }
}

export async function removeFromShortlist(shortlistId: string, clientId: number) {
  const curatorId = await requireCuratorId()
  const admin = await createAdminClient()

  const { error } = await admin
    .from('client_shortlists')
    .delete()
    .eq('id', shortlistId)
    .eq('curator_id', curatorId)

  if (error) throw error
  revalidatePath(`/curator/clients/${clientId}`)
}

export async function updateShortlistNote(shortlistId: string, clientId: number, note: string) {
  const curatorId = await requireCuratorId()
  const admin = await createAdminClient()

  const { error } = await admin
    .from('client_shortlists')
    .update({ note, updated_at: new Date().toISOString() })
    .eq('id', shortlistId)
    .eq('curator_id', curatorId)

  if (error) throw error
  revalidatePath(`/curator/clients/${clientId}`)
}

export async function updateShortlistStatus(
  shortlistId: string,
  clientId: number,
  status: 'shortlisted' | 'applied' | 'offered' | 'rejected' | 'accepted'
) {
  const curatorId = await requireCuratorId()
  const admin = await createAdminClient()

  const { error } = await admin
    .from('client_shortlists')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', shortlistId)
    .eq('curator_id', curatorId)

  if (error) throw error
  revalidatePath(`/curator/clients/${clientId}`)
}
