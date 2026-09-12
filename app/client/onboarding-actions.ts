'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { warnOnError } from '@/lib/supabase/write-guard'

export async function markOnboarded(clientId: number) {
  const admin = await createAdminClient()
  await admin.from('clients').update({ onboarded: true }).eq('id', clientId).then(warnOnError('clients · app/client/onboarding-actions.ts:8'))
  revalidatePath('/client')
}
