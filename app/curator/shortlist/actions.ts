'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/client-activity'

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

const COUNTRY_LABEL: Record<string, string> = {
  ca: 'Канада', au: 'Австралия', gb: 'Великобритания', de: 'Германия',
  us: 'США', ie: 'Ирландия', nl: 'Нидерланды', fr: 'Франция', se: 'Швеция',
  fi: 'Финляндия', dk: 'Дания', it: 'Италия', es: 'Испания', ch: 'Швейцария',
  pt: 'Португалия', si: 'Словения', tr: 'Турция',
}

export async function addToShortlist(params: {
  clientId: number
  schoolId: number
  programId: number
}) {
  const curatorId = await requireCuratorId()
  const admin = await createAdminClient()

  const { data: client } = await admin
    .from('clients')
    .select('id, curator_id')
    .eq('id', params.clientId)
    .maybeSingle()
  if (!client) throw new Error('Клиент не найден')
  if (client.curator_id !== curatorId) throw new Error('Клиент закреплён за другим куратором')

  const parser = createParserClient()
  const [{ data: school }, { data: program }] = await Promise.all([
    parser.from('schools').select('id, name, country_code, city').eq('id', params.schoolId).maybeSingle(),
    parser.from('programs').select('id, name, tuition, application_fee, raw_data, source, specialty_group, language_text, start_date_text, deadline_text, tuition_text, curator_note').eq('id', params.programId).maybeSingle(),
  ])
  if (!school || !program) throw new Error('Вуз или программа не найдены в базе парсера')

  const attrs = (program.raw_data as any)?.attributes || {}
  const currency = attrs.currency_of_fees?.code ?? attrs.currency?.code ?? null
  // Для BD-программ — куратор-поля как фоллбэк
  const language = attrs.language?.name || attrs.language_of_instruction || program.language_text || null
  const intake = attrs.earliest_intake?.start_date || null
  const countryCode = (school.country_code || '').toLowerCase()
  const countryLabel = COUNTRY_LABEL[countryCode] || (school.country_code || '').toUpperCase()

  // Avoid duplicate: check for same program_name + university_name for this client
  const { data: existing } = await admin
    .from('client_universities')
    .select('id')
    .eq('client_id', params.clientId)
    .eq('university_name', school.name)
    .eq('program_name', program.name)
    .maybeSingle()

  if (existing) {
    revalidatePath(`/curator/clients/${params.clientId}`)
    revalidatePath('/client', 'layout')
    return { ok: true, alreadyAdded: true }
  }

  const { error } = await admin.from('client_universities').insert({
    client_id: params.clientId,
    university_name: school.name,
    program_name: program.name,
    country: countryLabel,
    city: school.city || null,
    tuition_per_year: program.tuition ?? null,
    currency,
    language,
    start_date: intake,
    status: 'planned',
    portal_url: `/curator/programs/${program.id}`,
    notes: JSON.stringify({ school_id: school.id, program_id: program.id }),
  })
  if (error) throw new Error(error.message)

  await logActivity(admin, {
    clientId: params.clientId,
    type: 'shortlist_added',
    content: `Куратор добавил вуз: ${school.name} — ${program.name}`,
    metadata: { school_id: school.id, program_id: program.id, school_name: school.name, program_name: program.name },
  })

  revalidatePath(`/curator/clients/${params.clientId}`)
  revalidatePath('/curator')
  revalidatePath('/client', 'layout')
  return { ok: true, alreadyAdded: false }
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
