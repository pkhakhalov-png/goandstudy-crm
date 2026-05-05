/**
 * Серверный helper для RPC public.search_programs(...)
 * (см. supabase/parser-search-rpc.sql).
 *
 * Возвращает {rows, total} одним запросом — раньше клиент делал
 * .select() с count: 'exact' + большой OR-фильтр клиентом, теперь
 * вся логика в Postgres-функции (быстрее на ~30-50%).
 */

import { createParserClient } from '@/lib/supabase/parser'

export interface SearchProgramsParams {
  country?: string
  schoolId?: number
  specialty?: string
  uniType?: string
  budget?: string
  levels?: string[]      // ['bachelor','master','phd','language']
  intakeYears?: string[] // ['2027','2028']
  search?: string
  sort?: string
  limit?: number
  offset?: number
  /** Capped count для скорости: при cap=5000 широкие фильтры останавливаются
   *  на 5000-м row. UI показывает «5000+» если total === cap. NULL = exact. */
  countCap?: number | null
}

export interface SearchProgramsResult {
  rows: any[]
  total: number
  /** true если total === countCap (т.е. реальное число ≥ cap). UI рисует «N+». */
  totalCapped?: boolean
  error?: string
}

/** Cap отключён — продакт хочет видеть реальное число программ.
 *  Если будут жалобы на скорость — снизим до 50000. */
export const DEFAULT_COUNT_CAP = null

export async function searchPrograms(params: SearchProgramsParams): Promise<SearchProgramsResult> {
  const parser = createParserClient()
  const cap = params.countCap === null ? null : (params.countCap ?? DEFAULT_COUNT_CAP)
  const { data, error } = await parser.rpc('search_programs', {
    p_country: params.country || null,
    p_school_id: params.schoolId ?? null,
    p_specialty: params.specialty || null,
    p_uni_type: params.uniType || null,
    p_budget: params.budget || null,
    p_levels: params.levels && params.levels.length ? params.levels : null,
    p_intake_years: params.intakeYears && params.intakeYears.length ? params.intakeYears : null,
    p_search: params.search || null,
    p_sort: params.sort || 'name_asc',
    p_limit: params.limit ?? 24,
    p_offset: params.offset ?? 0,
    p_count_cap: cap,
  })
  if (error) {
    console.error('[searchPrograms] rpc error:', error.message)
    return { rows: [], total: 0, error: error.message }
  }
  const payload = data as { rows: any[]; total: number } | null
  const total = payload?.total || 0
  return {
    rows: payload?.rows || [],
    total,
    totalCapped: cap !== null && total === cap,
  }
}
