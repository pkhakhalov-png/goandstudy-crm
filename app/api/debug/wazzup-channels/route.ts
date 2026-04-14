import { NextResponse } from 'next/server'
import { getWazzupChannels } from '@/lib/wazzup'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const channels = await getWazzupChannels()
    return NextResponse.json({ ok: true, channels })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
