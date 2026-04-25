import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveClientForViewer, getClientEssay } from '@/lib/client-data'
import { INITIAL_RESUME, normalizeResume } from '../mock'
import { PrintShell } from './PrintShell'

export const dynamic = 'force-dynamic'

export default async function ResumePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()

  const sp = await searchParams
  const requestedClientId = sp.clientId ? Number(sp.clientId) : undefined
  const client = await resolveClientForViewer({
    userId: user.id,
    userEmail: user.email || '',
    role: profile?.role,
    requestedClientId,
  })

  const essay = client ? await getClientEssay(client.id, 'resume') : null
  const rawContent =
    essay?.status === 'approved' && essay.curator_content
      ? essay.curator_content
      : essay?.content || undefined

  const isEmpty = !rawContent || (
    !rawContent.personal?.firstName?.trim?.() &&
    !rawContent.personal?.lastName?.trim?.() &&
    !rawContent.personal?.profileSummary?.trim?.() &&
    !(rawContent.workExperience?.length) &&
    !(rawContent.education?.length) &&
    !(rawContent.skills?.length)
  )
  const resume = normalizeResume(isEmpty ? INITIAL_RESUME : rawContent)

  return <PrintShell resume={resume} />
}
