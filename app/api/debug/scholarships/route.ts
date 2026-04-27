import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SCHOLARSHIPS_SUPABASE_ANON_KEY

  const out: Record<string, unknown> = {
    urlSet: !!url,
    urlValue: url ?? null,
    urlLen: url?.length ?? 0,
    urlHasWhitespace: url ? /\s/.test(url) : false,
    anonSet: !!anon,
    anonLen: anon?.length ?? 0,
    anonPrefix: anon?.slice(0, 20) ?? null,
    anonSuffix: anon?.slice(-10) ?? null,
    anonHasWhitespace: anon ? /\s/.test(anon) : false,
  }

  if (url && anon) {
    try {
      const sb = createClient(url, anon, { auth: { persistSession: false } })
      const { error, count } = await sb
        .from('v_scholarships_active')
        .select('scholarship_id', { count: 'exact', head: true })
      if (error) {
        out.queryError = error.message
        out.queryErrorCode = (error as any).code ?? null
      } else {
        out.queryCount = count
      }
    } catch (e) {
      out.queryThrown = (e as Error).message
    }
  }

  return NextResponse.json(out)
}
