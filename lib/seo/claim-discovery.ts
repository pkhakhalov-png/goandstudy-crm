/**
 * Завести в реестр то, чего в нём не хватило.
 *
 * Раньше цепочка обрывалась на жалобе: проверка находила в статье число, за
 * которым не стоит ни один факт реестра, писала «не подтверждено» — и на этом
 * всё. Ждать, пока человек заведёт утверждение руками, значит держать статью
 * столько, сколько у него не доходят руки. Именно так две недели простояли
 * стипендии CSC.
 *
 * Теперь ненайденное становится задачей: число попадает в реестр как
 * неподтверждённое утверждение, а часовой шаг claims_autoverify идёт за
 * источником сам.
 *
 * Вид у таких утверждений намеренно нестрогий — `observed_number`.
 *
 * Это не осторожность, а необходимость. Виды из CRITICAL_KINDS (цена, дедлайн,
 * виза, право на поступление) блокируют выпуск, пока не подтверждены. Заводи
 * мы найденное число ценой, каждая статья немедленно блокировала бы сама себя
 * собственными цифрами — и конвейер встал бы наглухо вместо того, чтобы
 * ускориться. Поэтому найденное число ничего не блокирует: оно лишь встаёт в
 * очередь на проверку, а подтвердившись, перестаёт быть «числом без основания».
 * Повысить вид до материального может человек — это решение редакции, а не
 * регулярного выражения.
 */

export type Unbacked = { value: string; context: string }

/** Полгода: столько же живут утверждения, заведённые руками. */
const TTL_DAYS = 180

function parseValue(v: string): { num: number | null; unit: string | null } {
  const m = v.match(/^([\d\s  ,.]+)\s*(.+)$/)
  if (!m) return { num: null, unit: null }
  const num = Number(m[1].replace(/[\s  ]/g, '').replace(',', '.'))
  return { num: Number.isFinite(num) ? num : null, unit: m[2].trim() || null }
}

/**
 * @param subjectKey  предмет статьи: страновой код, а не 'global' — иначе
 *                    утверждение нельзя будет подтвердить страновым источником
 * @returns сколько утверждений завелось
 */
export async function recordUnbackedClaims(
  seo: any,
  articleId: number,
  subjectKey: string,
  unbacked: Unbacked[],
): Promise<number> {
  if (!unbacked.length || !subjectKey || subjectKey === 'global') return 0

  // Что уже есть по этому предмету — чтобы повторный прогон не плодил дубли.
  const { data: existing } = await seo.from('claims')
    .select('id, value, statement').eq('subject_key', subjectKey)
  const seen = new Set<string>()
  for (const c of existing ?? []) {
    if ((c as any).value) seen.add(String((c as any).value).toLowerCase().replace(/\s+/g, ''))
  }

  const expiresAt = new Date(Date.now() + TTL_DAYS * 86400_000).toISOString()
  const rows: Record<string, unknown>[] = []

  for (const u of unbacked) {
    const key = u.value.toLowerCase().replace(/\s+/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    const { num, unit } = parseValue(u.value)
    rows.push({
      subject_key: subjectKey,
      // Человекочитаемое имя предмета: у заведённых руками там «Возрастные
      // рамки CSC», «ÖH-Beitrag». У находки осмысленного имени нет, поэтому
      // честно пишем, откуда она взялась, а не выдумываем заголовок.
      subject: `Число из статьи #${articleId}`,
      kind: 'observed_number',
      statement: u.context.slice(0, 500),
      value: u.value,
      value_num: num,
      unit,
      confidence: 'single_source',
      status: 'unverified',
      expires_at: expiresAt,
      version: 1,
      article_id: articleId,
      qualifiers: { origin: 'discovered', article_id: articleId },
    })
  }

  if (!rows.length) return 0
  const { error } = await seo.from('claims').insert(rows)
  if (error) {
    console.warn('[реестр] находки не записались:', error.message)
    return 0
  }
  return rows.length
}
