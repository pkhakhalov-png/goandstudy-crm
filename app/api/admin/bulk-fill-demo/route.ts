/**
 * Одноразовый bulk-fill для ИИ-заполнения всех школ + программ в подборке
 * демо-клиента. Делает internal fetch к /api/ai/fill-school и /api/ai/fill-program
 * с прокинутыми cookies авторизации куратора/админа.
 *
 * Использование:
 *   GET /api/admin/bulk-fill-demo
 *   (залогинься как куратор/админ → URL в браузере → JSON-результат)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800 // 7 школ + 7 программ × 30 сек = ~7 мин

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['curator', 'admin', 'rop'].includes(profile?.role || '')) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const admin = await createAdminClient()
  const { data: demo } = await admin
    .from('clients').select('id').eq('email', 'demo@goandstudy.com').maybeSingle()
  if (!demo) return NextResponse.json({ ok: false, error: 'demo client not found' }, { status: 404 })

  const { data: rows } = await admin
    .from('client_universities').select('university_name, program_name, notes').eq('client_id', demo.id)

  const schoolIds = new Set<number>()
  const programIds = new Set<number>()
  for (const r of rows || []) {
    try {
      const p = JSON.parse(r.notes || '{}')
      if (p.school_id) schoolIds.add(p.school_id)
      if (p.program_id) programIds.add(p.program_id)
    } catch {}
  }

  const cookie = req.headers.get('cookie') || ''
  const origin = req.nextUrl.origin

  const results: Array<{ kind: string; id: number; ok: boolean; changes?: number; error?: string }> = []

  for (const sid of schoolIds) {
    try {
      const r = await fetch(`${origin}/api/ai/fill-school`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ schoolId: sid }),
      })
      const j = await r.json()
      results.push({ kind: 'school', id: sid, ok: !!j.ok, changes: j.data?.changes, error: j.error })
    } catch (e: any) {
      results.push({ kind: 'school', id: sid, ok: false, error: e?.message || 'fetch failed' })
    }
  }

  for (const pid of programIds) {
    try {
      const r = await fetch(`${origin}/api/ai/fill-program`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ programId: pid }),
      })
      const j = await r.json()
      results.push({ kind: 'program', id: pid, ok: !!j.ok, changes: j.data?.changes, error: j.error })
    } catch (e: any) {
      results.push({ kind: 'program', id: pid, ok: false, error: e?.message || 'fetch failed' })
    }
  }

  const okCount = results.filter(r => r.ok).length
  return NextResponse.json({
    ok: true,
    demo_client_id: demo.id,
    schools_total: schoolIds.size,
    programs_total: programIds.size,
    success: okCount,
    failed: results.length - okCount,
    results,
  })
}
