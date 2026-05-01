'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markOnboarded(clientId: number) {
  const admin = await createAdminClient()
  await admin.from('clients').update({ onboarded: true }).eq('id', clientId)
  revalidatePath('/client')
}
