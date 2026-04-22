import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_PARSER_SUPABASE_ANON_KEY
  const service = process.env.PARSER_SUPABASE_SERVICE_ROLE_KEY

  const out: any = {
    urlSet: !!url,
    urlValue: url ?? null,
    anonSet: !!anon,
    anonLen: anon?.length ?? 0,
    anonPrefix: anon?.slice(0, 20) ?? null,
    serviceSet: !!service,
    serviceLen: service?.length ?? 0,
  }

  if (!url || !anon) {
    out.error = 'missing env vars'
    return NextResponse.json(out, { status: 200 })
  }

  try {
    const client = createClient(url, anon, { auth: { persistSession: false } })
    const { data, error, count } = await client
      .from('schools')
      .select('id, name', { count: 'exact' })
      .limit(3)

    out.queryOk = !error
    out.queryError = error?.message ?? null
    out.queryErrorDetails = error ?? null
    out.count = count
    out.sample = data?.map(r => r.name) ?? []
  } catch (e: any) {
    out.caughtError = e.message
  }

  return NextResponse.json(out, { status: 200 })
}
