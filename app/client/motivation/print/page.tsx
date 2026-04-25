import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveClientForViewer, getClientEssay } from '@/lib/client-data'
import { INITIAL_LETTER } from '../mock'
import { CLIENT_CTX } from '../../mock-data'
import { PrintShell } from './PrintShell'

export const dynamic = 'force-dynamic'

export default async function MotivationPrintPage({
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

  const essay = client ? await getClientEssay(client.id, 'motivation') : null
  const rawContent =
    essay?.status === 'approved' && essay.curator_content
      ? essay.curator_content
      : essay?.content || undefined
  const isEmpty = !rawContent || (
    typeof rawContent === 'object' &&
    Object.values(rawContent).every((v) => typeof v !== 'string' || !v.trim())
  )
  const letter = isEmpty ? INITIAL_LETTER : rawContent
  const authorName = client?.name || CLIENT_CTX.childFullName

  return <PrintShell letter={letter} authorName={authorName} />
}
