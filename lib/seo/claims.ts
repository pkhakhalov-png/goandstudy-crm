// Реестр фактов: откуда статья берёт числа.
//
// Без него генератору запрещено утверждать цифры (иначе он их выдумывает —
// на живом прогоне появился несуществующий срок визы в 180 дней), а значит
// статья выходит структурно правильной и фактически пустой. Читатель приходит
// за суммами и порогами и не получает ни одного.
//
// Схема (seo.claims / seo.sources / seo.claim_policy) заложена в PRD; здесь —
// работа с ней: загрузка фактов под тему, подача их в промпт и сверка чисел
// из готового текста с тем, что реально подтверждено.

import { COMPANY_FACTS } from './facts'

export type Claim = {
  id: number
  kind: string
  subject: string
  subject_key: string
  statement: string
  value: string | null
  value_num: number | null
  unit: string | null
  qualifiers: Record<string, any>
  confidence: 'confirmed' | 'single_source' | 'disputed'
  status: string
  expires_at: string
}

/** Факты под тему: по ключу предмета (страна, вуз, программа). */
export async function loadClaims(seo: any, subjectKeys: string[]): Promise<Claim[]> {
  if (!subjectKeys.length) return []
  const { data, error } = await seo.from('claims')
    .select('id, kind, subject, subject_key, statement, value, value_num, unit, qualifiers, confidence, status, expires_at')
    .in('subject_key', subjectKeys)
    .eq('status', 'active')
    .order('kind')
  if (error) throw new Error(`claims: ${error.message}`)
  const now = Date.now()
  // Протухшие факты в статью не пускаем: устаревшая сумма хуже отсутствующей
  return (data ?? []).filter((c: Claim) => new Date(c.expires_at).getTime() > now)
}

/** Блок для промпта: только то, что можно утверждать, с оговорками. */
export function claimsBlock(claims: Claim[]): string {
  if (!claims.length) {
    return `ПРОВЕРЕННЫХ ФАКТОВ ПО ЭТОЙ ТЕМЕ В РЕЕСТРЕ НЕТ.
Значит конкретных сумм, сроков, возрастных рамок и проходных баллов в статье
быть не должно вовсе. Пиши о том, как устроен процесс и от чего зависят требования,
и прямо говори, где читателю проверить актуальные цифры.`
  }

  const byKind = new Map<string, Claim[]>()
  for (const c of claims) {
    const list = byKind.get(c.kind) ?? []
    list.push(c)
    byKind.set(c.kind, list)
  }

  const lines: string[] = [
    'ПРОВЕРЕННЫЕ ФАКТЫ — только эти числа можно называть в статье.',
    'Ничего сверх этого списка не утверждать: ни сумм, ни сроков, ни баллов.',
    '',
  ]
  for (const [kind, list] of byKind) {
    lines.push(`${kind}:`)
    for (const c of list) {
      const quals = Object.entries(c.qualifiers ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ')
      const mark = c.confidence === 'confirmed' ? '' : ' [один источник — писать с оговоркой «обычно», «как правило»]'
      lines.push(`  - ${c.statement}${quals ? ` (${quals})` : ''}${mark}`)
    }
  }
  return lines.join('\n')
}

/**
 * Числа из текста, за которыми не стоит ни один факт из реестра.
 *
 * Считаем грубо и намеренно: любое число крупнее сотни, любой процент, любой год —
 * кандидат в выдумку. Ложные срабатывания тут дешевле пропущенной выдуманной суммы,
 * поэтому список идёт человеку как предупреждение, а не как приговор.
 */
export function findUnbackedNumbers(text: string, claims: Claim[]): { value: string; context: string }[] {
  const known = new Set<string>()

  // Собственные цены и показатели компании подтверждать реестром не нужно —
  // они и есть первоисточник. Без этого статья про наши услуги получала
  // замечание к каждой цене из прайса, и это сбивало с настоящих проблем.
  for (const m of COMPANY_FACTS.matchAll(/\d[\d\s  ,.]*/g)) known.add(normalizeNum(m[0]))

  for (const c of claims) {
    if (c.value) known.add(normalizeNum(c.value))
    if (c.value_num != null) known.add(normalizeNum(String(c.value_num)))
    for (const m of String(c.statement).matchAll(/\d[\d\s  ,.]*/g)) known.add(normalizeNum(m[0]))
  }

  const out: { value: string; context: string }[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(/(?<![\w])(\d[\d\s  ]{2,}|\d+)\s*(₽|руб|€|\$|¥|%|балл|лет|год|дней|месяц)/gi)) {
    const norm = normalizeNum(m[1])
    if (known.has(norm) || seen.has(norm + m[2])) continue
    // Годы и мелкие порядковые числа шумят больше, чем помогают
    if (/^(19|20)\d\d$/.test(norm) || Number(norm) < 3) continue
    seen.add(norm + m[2])
    const at = m.index ?? 0
    out.push({ value: `${m[1].trim()} ${m[2]}`, context: text.slice(Math.max(0, at - 60), at + 80).replace(/\s+/g, ' ').trim() })
  }
  return out
}

function normalizeNum(s: string): string {
  return String(s)
    .replace(/[\s  ]/g, '')
    .replace(',', '.')
    .replace(/[.,]+$/, '')      // точка в конце предложения — не часть числа
    .replace(/\.0+$/, '')
}

/** Ключи предмета из темы: страна и общий ключ, чтобы не заводить их руками. */
export function subjectKeysFor(topic: string): string[] {
  const t = topic.toLowerCase()
  const countries: Record<string, string> = {
    'кита': 'cn', 'австри': 'at', 'герман': 'de', 'итал': 'it', 'испан': 'es',
    'франц': 'fr', 'венгр': 'hu', 'коре': 'kr', 'сша': 'us', 'америк': 'us',
    'англ': 'gb', 'британ': 'gb', 'оаэ': 'ae', 'дуба': 'ae', 'чех': 'cz', 'польш': 'pl',
  }
  const keys = new Set<string>(['global'])
  for (const [stem, code] of Object.entries(countries)) if (t.includes(stem)) keys.add(code)
  return [...keys]
}
