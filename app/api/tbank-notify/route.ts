import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyNotificationToken } from '@/lib/tbank'

export async function POST(request: NextRequest) {
  const body = await request.json()

  if (!verifyNotificationToken(body)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }

  const { PaymentId, Status, OrderId } = body

  if (!PaymentId || !Status) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = await createAdminClient()
  await supabase
    .from('invoices')
    .update({ status: Status, updated_at: new Date().toISOString() })
    .eq('payment_id', String(PaymentId))

  return NextResponse.json({ ok: true })
}
