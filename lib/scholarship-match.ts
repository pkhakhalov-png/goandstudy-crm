import { createScholarshipsClient } from './supabase/scholarships'

/**
 * Подбор стипендий, релевантных вузам клиента, из 3 источников:
 *   1. idp_scholarships.school_id  → прямая связь по ID (самый надёжный путь)
 *   2. scholarships_topuni        → нечёткий match по нормализованному имени вуза
 *   3. government_scholarships    → по country_code страны вуза
 *
 * Важно: ID вузов в parser-Supabase уникальны (это одна таблица schools),
 * но названия в QS-каталоге (TopUni) приходят как сырой текст без FK.
 * Поэтому для TopUni используем нормализацию строк, а не ID.
 */

/**
 * Нормализация имени вуза для нечёткого match'а.
 * "The University of California, Berkeley" → "californiaberkeley"
 * "Harvard University"                       → "harvard"
 * "MIT"                                      → "mit"
 *
 * Удаляем общие стоп-слова (university/college/institute/school/of/the/and),
 * пунктуацию и пробелы. Регистр приводим к нижнему.
 */
const STOP_WORDS = new Set([
  'university', 'universite', 'universidad', 'università', 'universität',
  'college', 'institute', 'institut', 'school', 'academy', 'academia',
  'of', 'the', 'and', 'для', 'имени', 'им',
])

export function normalizeSchoolName(raw: string | null | undefined): string {
  if (!raw) return ''
  // Сохраним только буквы (любых алфавитов) и цифры
  return raw
    .toLowerCase()
    .replace(/['"`’]/g, '')
    .split(/[\s\-,.()/]+/)
    .filter(tok => tok && !STOP_WORDS.has(tok))
    .join('')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Возвращает true если две нормализованные формы достаточно похожи. */
function normNamesMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  // Один в другом: "berkeley" в "californiaberkeley" или наоборот
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true
  return false
}

export type SchoolForMatch = {
  id: number
  name: string
  country_code: string | null
}

export type MatchedScholarship =
  | { kind: 'idp'; id: number; name: string; school_id: number; level: string | null; funding_type: string | null; value_amount: number | null; value_currency: string | null; value_text: string | null; application_deadline: string | null; idp_url: string; matched_school: SchoolForMatch }
  | { kind: 'private'; scholarship_id: number; title: string; institution_title: string | null; amount_text: string | null; deadline: string | null; study_levels: string[] | null; matched_school: SchoolForMatch }
  | { kind: 'government'; id: number; name: string; country_name: string | null; country_code: string | null; provider: string | null; monthly_stipend: number | null; monthly_stipend_currency: string | null; application_deadline: string | null; matched_school: SchoolForMatch }

/**
 * Находит стипендии для каждого вуза клиента.
 * Возвращает массив с указанием по какой школе матч сработал — куратор
 * понимает «эту стипендию нашли по такой-то школе из подборки».
 */
export async function matchScholarshipsForSchools(
  schools: SchoolForMatch[],
): Promise<MatchedScholarship[]> {
  if (schools.length === 0) return []

  const sb = createScholarshipsClient()
  const today = new Date().toISOString().slice(0, 10)
  const result: MatchedScholarship[] = []

  const schoolIds = schools.map(s => s.id)
  const countryCodes = Array.from(new Set(
    schools.map(s => (s.country_code || '').toLowerCase()).filter(Boolean)
  ))

  // ─── 1. IDP по school_id (самый чистый путь) ───
  if (schoolIds.length > 0) {
    const { data: idpRows } = await sb
      .from('idp_scholarships')
      .select('id, name, school_id, level, funding_type, value_amount, value_currency, value_text, application_deadline, idp_url')
      .in('school_id', schoolIds)
      .or(`application_deadline.is.null,application_deadline.gte.${today}`)
      .order('application_deadline', { ascending: true, nullsFirst: false })
    const schoolById = new Map(schools.map(s => [s.id, s] as const))
    for (const r of idpRows || []) {
      const matched = schoolById.get(r.school_id as number)
      if (matched) result.push({ kind: 'idp', ...(r as any), matched_school: matched })
    }
  }

  // ─── 2. TopUni (private QS) — нечёткий match по нормализованному имени ───
  // Грузим все актуальные стипендии-страничкой 1000 (полный объём ~few thousand).
  // Нормализуем institution_title → ищем матч с любой школой клиента.
  const normByName = new Map<string, SchoolForMatch>()
  for (const s of schools) {
    const n = normalizeSchoolName(s.name)
    if (n) normByName.set(n, s)
  }
  if (normByName.size > 0) {
    const { data: privateRows } = await sb
      .from('scholarships_topuni')
      .select('scholarship_id, title, institution_title, amount_text, deadline, study_levels')
      .eq('archived', false)
      .or(`deadline.is.null,deadline.gte.${today}`)
      .not('institution_title', 'is', null)
      .limit(5000)
    for (const r of privateRows || []) {
      const norm = normalizeSchoolName(r.institution_title)
      if (!norm) continue
      // Точный матч сначала, потом частичный
      let matched = normByName.get(norm)
      if (!matched) {
        for (const [n, s] of normByName) {
          if (normNamesMatch(n, norm)) { matched = s; break }
        }
      }
      if (matched) result.push({ kind: 'private', ...(r as any), matched_school: matched })
    }
  }

  // ─── 3. Government — по country_code (применима ко всем вузам страны) ───
  if (countryCodes.length > 0) {
    const { data: govRows } = await sb
      .from('government_scholarships')
      .select('id, name, country_code, country_name, provider, monthly_stipend, monthly_stipend_currency, application_deadline')
      .eq('is_active', true)
      .in('country_code', countryCodes)
      .or(`application_deadline.is.null,application_deadline.gte.${today}`)
      .order('application_deadline', { ascending: true, nullsFirst: false })
    const schoolByCountry = new Map<string, SchoolForMatch>()
    for (const s of schools) {
      const cc = (s.country_code || '').toLowerCase()
      if (cc && !schoolByCountry.has(cc)) schoolByCountry.set(cc, s)
    }
    for (const r of govRows || []) {
      const cc = (r.country_code || '').toLowerCase()
      const matched = schoolByCountry.get(cc)
      if (matched) result.push({ kind: 'government', ...(r as any), matched_school: matched })
    }
  }

  return result
}
