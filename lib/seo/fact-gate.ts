/**
 * Достоверность существенных утверждений.
 *
 * Числа — только часть беды. Статья одинаково вредна, если соврала про сумму
 * и если соврала про дедлайн, список документов или то, кого вообще берут на
 * программу. Поэтому проверяем не «есть ли цифра в реестре», а подтверждено ли
 * утверждение того вида, который меняет решение читателя.
 *
 * Правило простое: критичное утверждение без подтверждения или с истёкшим
 * сроком не даёт согласовать публикацию. Редакционные замечания остаются
 * предупреждениями — из-за них статья не стоит.
 */
import type { Claim } from './claims'

/** Виды утверждений, ошибка в которых стоит читателю денег или года жизни. */
export const CRITICAL_KINDS = new Set([
  'tuition_fee', 'deadline', 'language_req', 'visa_requirement',
  'eligibility', 'document_req', 'scholarship',
])

export type FactIssue = {
  level: 'blocking' | 'warning'
  kind: string
  statement: string
  why: string
  claimId?: number
}

export type ClaimWithSources = Claim & {
  id: number
  value_num?: number | string | null
  value_date?: string | null
  expires_at?: string | null
  status?: string | null
  confidence?: string | null
  /** Сколько источников поддерживает утверждение. */
  sources?: number
}

/**
 * Подтверждено ли утверждение. Два пути: эксперт сказал «да» (confidence
 * confirmed) или есть источник, который его поддерживает. Выдуманная ссылка
 * подтверждением не является — поэтому считаем только записанные источники.
 */
export function isBacked(c: ClaimWithSources): boolean {
  return c.confidence === 'confirmed' || (c.sources ?? 0) > 0
}

export function isExpired(c: ClaimWithSources, now = new Date()): boolean {
  if (c.status && c.status !== 'active') return true
  return !!c.expires_at && Date.parse(c.expires_at) < now.getTime()
}

/** Утверждение используется в тексте, если в нём есть его число или дата. */
export function isUsedInText(c: ClaimWithSources, text: string): boolean {
  const plain = text.replace(/<[^>]+>/g, ' ')
  if (c.value_num != null) {
    const n = Number(c.value_num)
    // Ищем число с разделителями разрядов и без: 2500, 2 500, 2.500
    const variants = [String(n), n.toLocaleString('ru'), n.toLocaleString('en')]
    if (variants.some((v) => plain.includes(v))) return true
  }
  if (c.value_date && plain.includes(String(c.value_date).slice(0, 10))) return true
  // Существенное слово из формулировки — для утверждений без числа
  const key = String(c.statement ?? '').split(/[\s,—:]+/).filter((w) => w.length > 7)[0]
  return !!key && plain.toLowerCase().includes(key.toLowerCase())
}

/**
 * Ворота перед согласованием: что мешает выпускать статью.
 *
 * Отсутствие подтверждения — не повод придумать ссылку. Если источника нет,
 * честный выход один: эксперт подтверждает утверждение своей подписью либо
 * утверждение убирается из текста.
 */
export async function factGate(
  seo: any,
  text: string,
  subjectKeys: string[],
): Promise<{ blocking: FactIssue[]; warnings: FactIssue[]; checked: number }> {
  const blocking: FactIssue[] = []
  const warnings: FactIssue[] = []

  const { data: claims } = await seo.from('claims')
    .select('id, kind, subject, statement, value, value_num, value_date, unit, qualifiers, confidence, status, expires_at')
    .in('subject_key', subjectKeys.length ? subjectKeys : ['—'])

  if (!claims?.length) return { blocking, warnings, checked: 0 }

  // Сколько источников у каждого утверждения — одним запросом, а не по одному
  const ids = claims.map((c: any) => c.id)
  const { data: links } = await seo.from('claim_sources')
    .select('claim_id, agreement').in('claim_id', ids)
  const backing = new Map<number, number>()
  for (const l of links ?? []) {
    if (l.agreement === 'supports') backing.set(l.claim_id, (backing.get(l.claim_id) ?? 0) + 1)
  }

  let checked = 0
  for (const raw of claims) {
    const c: ClaimWithSources = { ...raw, sources: backing.get(raw.id) ?? 0 }
    if (!isUsedInText(c, text)) continue
    checked++

    const critical = CRITICAL_KINDS.has(String(c.kind))
    const expired = isExpired(c)
    const backed = isBacked(c)

    if (!backed) {
      const issue: FactIssue = {
        level: critical ? 'blocking' : 'warning',
        kind: String(c.kind),
        statement: String(c.statement),
        why: 'нет подтверждения: ни источника, ни подписи эксперта',
        claimId: c.id,
      }
      critical ? blocking.push(issue) : warnings.push(issue)
      continue
    }

    if (expired) {
      const issue: FactIssue = {
        level: critical ? 'blocking' : 'warning',
        kind: String(c.kind),
        statement: String(c.statement),
        why: `срок подтверждения истёк${c.expires_at ? ` ${String(c.expires_at).slice(0, 10)}` : ''} — перепроверить`,
        claimId: c.id,
      }
      critical ? blocking.push(issue) : warnings.push(issue)
    }
  }

  return { blocking, warnings, checked }
}

/**
 * Подтверждение эксперта как данные, а не как галочка.
 *
 * Создаём заметку эксперта, источник на неё и связь с утверждением — так
 * видно, кто и когда поручился, и это можно оспорить позже. Срок жизни
 * продлевается по политике вида утверждения.
 */
export async function confirmByExpert(
  seo: any,
  claimId: number,
  authorId: string,
  note: string,
): Promise<{ error?: string; ok?: true }> {
  const { data: claim } = await seo.from('claims').select('id, kind, subject, statement').eq('id', claimId).single()
  if (!claim) return { error: 'утверждение не найдено' }

  const { data: policy } = await seo.from('claim_policy').select('default_ttl').eq('kind', claim.kind).maybeSingle()
  const ttlDays = Number(String(policy?.default_ttl ?? '180 days').match(/\d+/)?.[0] ?? 180)

  const { data: expertNote, error: noteErr } = await seo.from('expert_notes').insert({
    author_id: authorId, note_type: 'comment', subject: claim.subject,
    body: note || `Подтверждено экспертом: ${claim.statement}`, publishable: false,
  }).select('id').single()
  if (noteErr) return { error: `заметка эксперта: ${noteErr.message}` }

  const { data: source, error: srcErr } = await seo.from('sources').insert({
    source_type: 'internal_expert', locator: `expert_note:${expertNote.id}`,
    kind: 'internal_expert', added_by: 'human', active: true,
  }).select('id').single()
  if (srcErr) return { error: `источник: ${srcErr.message}` }

  const { data: snap, error: snapErr } = await seo.from('source_snapshots')
    .insert({ source_id: source.id, http_status: null, changed: true, raw_text: note || claim.statement })
    .select('id').single()
  if (snapErr) return { error: `снимок источника: ${snapErr.message}` }

  const { error: linkErr } = await seo.from('claim_sources').insert({
    claim_id: claimId, snapshot_id: snap.id,
    quote: (note || claim.statement).slice(0, 500), agreement: 'supports',
  })
  if (linkErr) return { error: `связь с источником: ${linkErr.message}` }

  await seo.from('claims').update({
    confidence: 'confirmed',
    status: 'active',
    expires_at: new Date(Date.now() + ttlDays * 864e5).toISOString(),
  }).eq('id', claimId)

  return { ok: true }
}
