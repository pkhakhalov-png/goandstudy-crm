/**
 * Унифицированные фильтры каталога программ.
 * Используются и в /curator/universities/page.tsx и в /curator/clients/[id]/page.tsx
 * (там вкладка «Подборка» рендерит тот же каталог).
 *
 * Зачем единое место: оба фильтра должны вести себя одинаково. Раньше
 * жили в дублирующем коде → один пофикшен, второй забыт = баг.
 */

const LEVEL_MAP: Record<string, { raw: string[]; nameKeywords: string[] }> = {
  bachelor: {
    raw: ['bachelors', '3_year_bachelors', 'integrated_masters', 'topup_degree', 'certificate', 'diploma', 'advanced_diploma'],
    nameKeywords: ['bachelor', 'undergrad', 'b.sc', 'b.a.', 'bsc', 'bachelorstudiengang'],
  },
  master: {
    raw: ['masters_degree', 'post_graduate_certificate', 'post_graduate_diploma'],
    nameKeywords: ['master', 'm.sc', 'm.a.', 'msc', 'mba', 'masterstudiengang'],
  },
  phd: {
    raw: ['doctoral_phd'],
    nameKeywords: ['phd', 'doctor', 'doctoral', 'promotion'],
  },
  language: {
    raw: ['english', 'non_credential'],
    nameKeywords: ['english', 'language course', 'esl'],
  },
}

/** Применяет фильтр уровня к Supabase-запросу. Permissive: программы без
 *  структурного level (curator_gh, daad) не выпадают из выдачи. */
export function applyLevelFilter<T>(query: T, levels: string[]): T {
  if (!levels || levels.length === 0) return query
  const allRaw = new Set<string>()
  const allKw = new Set<string>()
  for (const l of levels) {
    const m = LEVEL_MAP[l]
    if (m) { m.raw.forEach(r => allRaw.add(r)); m.nameKeywords.forEach(k => allKw.add(k)) }
    else allRaw.add(l) // backwards-compat для старых URL c granular значениями
  }
  const orParts: string[] = []
  for (const r of allRaw) orParts.push(`raw_data->attributes->>level.eq.${r}`)
  for (const kw of allKw) orParts.push(`name.ilike.*${kw}*`)
  // Permissive: программы где level отсутствует (NULL) — тоже включаем,
  // иначе целые страны (DE, AE) выпадают из фильтра.
  orParts.push(`raw_data->attributes->>level.is.null`)
  if (orParts.length === 0) return query
  return (query as any).or(orParts.join(','))
}

/** Применяет фильтр intake-года. Permissive: программы без структурного
 *  intake тоже остаются в выдаче. */
export function applyIntakeFilter<T>(query: T, intakeYears: string[]): T {
  if (!intakeYears || intakeYears.length === 0) return query
  const yearParts = intakeYears.map(y => `raw_data->attributes->earliest_intake->>start_date.like.${y}*`)
  const nullPart = `raw_data->attributes->earliest_intake->>start_date.is.null`
  return (query as any).or([nullPart, ...yearParts].join(','))
}
