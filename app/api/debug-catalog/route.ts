import { NextResponse } from 'next/server'
import { createParserClient } from '@/lib/supabase/parser'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const country = url.searchParams.get('country') || 'de'
  const levelGroup = url.searchParams.get('level') || 'bachelor'

  const LEVEL_MAP: Record<string, { raw: string[]; nameKeywords: string[] }> = {
    bachelor: {
      raw: ['bachelors', '3_year_bachelors', 'integrated_masters', 'topup_degree', 'certificate', 'diploma', 'advanced_diploma'],
      nameKeywords: ['bachelor', 'undergrad', 'b.sc', 'b.a.', 'bsc', 'bachelorstudiengang'],
    },
    master: {
      raw: ['masters_degree', 'post_graduate_certificate', 'post_graduate_diploma'],
      nameKeywords: ['master', 'm.sc', 'm.a.', 'msc', 'mba', 'masterstudiengang'],
    },
    phd: { raw: ['doctoral_phd'], nameKeywords: ['phd', 'doctor', 'doctoral', 'promotion'] },
  }

  const m = LEVEL_MAP[levelGroup]
  const orParts: string[] = []
  if (m) {
    for (const r of m.raw) orParts.push(`raw_data->attributes->>level.eq.${r}`)
    for (const kw of m.nameKeywords) orParts.push(`name.ilike.*${kw}*`)
    orParts.push(`raw_data->attributes->>level.is.null`)
  }

  const parser = createParserClient()

  // Запрос 1: только страна (контроль)
  const r0 = await parser
    .from('programs').select('id, school:schools!inner(country_code)', { count: 'exact', head: true })
    .eq('school.country_code', country)

  // Запрос 2: страна + level OR (как на странице)
  const r1 = await parser
    .from('programs').select('id, school:schools!inner(country_code)', { count: 'exact', head: true })
    .eq('school.country_code', country)
    .or(orParts.join(','))

  return NextResponse.json({
    build: '45704f6+',
    parserUrl: process.env.NEXT_PUBLIC_PARSER_SUPABASE_URL,
    keyKind: process.env.NEXT_PUBLIC_PARSER_SUPABASE_ANON_KEY ? 'anon-set' : 'anon-MISSING',
    inputs: { country, levelGroup },
    orParts,
    countOnlyCountry: { count: r0.count, error: r0.error?.message },
    countWithLevelOR: { count: r1.count, error: r1.error?.message },
  })
}
