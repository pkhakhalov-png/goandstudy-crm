/**
 * Что происходит в контент-машине.
 *
 * Главное требование к этим числам: ноль и «нечего показывать» — разные вещи.
 * «Публикаций 0» на экране читается как «машина работает и ничего не выпустила»,
 * а на самом деле сейчас это значит «каналов нет, выпускать некуда». Второе —
 * не результат, а недостроенность, и показывать её нулём значит врать
 * аккуратными цифрами.
 *
 * Поэтому у каждого раздела есть не только число, но и список пробелов: что
 * именно не подключено и почему число такое, какое есть.
 */

export type Counts = Record<string, number>

export type Overview = {
  packages: { total: number; withVersion: number; byStatus: Counts }
  versions: number
  variants: { total: number; byFormat: Counts }
  publications: { total: number; byStatus: Counts; nextSlot: string | null; lastPublished: string | null }
  channels: { total: number; active: number; paused: number; stopped: number }
  attention: { open: number; bySeverity: Counts; oldestOpenedAt: string | null }
  outbox: { unprocessed: number; total: number }
  reviews: { total: number; byVerdict: Counts }
  /** Чего не хватает, чтобы числа выше что-то значили. */
  gaps: string[]
  takenAt: string
}

const tally = (rows: any[] | null | undefined, key: string): Counts => {
  const out: Counts = {}
  for (const r of rows ?? []) {
    const k = String(r[key] ?? '—')
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

export async function contentOverview(content: any): Promise<Overview> {
  const [pkgs, vers, vars, pubs, chans, att, ob, revs] = await Promise.all([
    content.from('packages').select('id, status, current_version_id'),
    content.from('package_versions').select('id'),
    content.from('variants').select('id, format'),
    content.from('publications').select('id, status, scheduled_at'),
    content.from('channels').select('id, mode'),
    content.from('attention_items').select('id, severity, opened_at, resolved_at'),
    content.from('outbox_events').select('event_id, processed_at'),
    content.from('reviews').select('id, verdict'),
  ])

  const gaps: string[] = []

  const chanRows = (chans.data ?? []) as any[]
  const active = chanRows.filter((c) => c.mode === 'active').length
  const pubRows = (pubs.data ?? []) as any[]
  const attRows = ((att.data ?? []) as any[]).filter((a) => !a.resolved_at)
  const obRows = (ob.data ?? []) as any[]

  const scheduled = pubRows
    .filter((p) => p.status === 'scheduled' && p.scheduled_at)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const published = pubRows
    .filter((p) => p.status === 'published' && p.scheduled_at)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))

  // Пробелы называются по имени, а не «данных нет».
  if (!chanRows.length) {
    gaps.push('каналов нет — планировать выпуск некуда. Канал заводится приостановленным, включение отдельное действие')
  } else if (!active) {
    gaps.push(`каналы есть (${chanRows.length}), но ни один не включён — новые публикации не ставятся`)
  }
  if (!(pkgs.data ?? []).length) {
    gaps.push('пакетов нет: событийный мост существует и проверен, но к конвейеру статей ещё не подключён — '
      + 'проверенная статья пока не порождает пакет сама')
  }
  if (!(vars.data ?? []).length && (pkgs.data ?? []).length) {
    gaps.push('у пакетов нет вариантов — адаптация под площадки ещё не запускалась')
  }
  const unprocessed = obRows.filter((e) => !e.processed_at).length
  if (unprocessed) {
    gaps.push(`${unprocessed} событий ждут разбора — обработчик не запускался`)
  }

  return {
    packages: {
      total: (pkgs.data ?? []).length,
      withVersion: ((pkgs.data ?? []) as any[]).filter((p) => p.current_version_id).length,
      byStatus: tally(pkgs.data, 'status'),
    },
    versions: (vers.data ?? []).length,
    variants: { total: (vars.data ?? []).length, byFormat: tally(vars.data, 'format') },
    publications: {
      total: pubRows.length,
      byStatus: tally(pubs.data, 'status'),
      nextSlot: scheduled[0]?.scheduled_at ?? null,
      lastPublished: published[0]?.scheduled_at ?? null,
    },
    channels: {
      total: chanRows.length,
      active,
      paused: chanRows.filter((c) => c.mode === 'paused').length,
      stopped: chanRows.filter((c) => c.mode === 'stopped').length,
    },
    attention: {
      open: attRows.length,
      bySeverity: tally(attRows, 'severity'),
      oldestOpenedAt: attRows.map((a) => a.opened_at).sort()[0] ?? null,
    },
    outbox: { unprocessed, total: obRows.length },
    reviews: { total: (revs.data ?? []).length, byVerdict: tally(revs.data, 'verdict') },
    gaps,
    takenAt: new Date().toISOString(),
  }
}

/** Человеческое название статуса. Латиница на экране — это непереведённый код. */
export const STATUS_RU: Record<string, string> = {
  draft: 'черновик', verified: 'проверен', scheduled: 'запланирован', publishing: 'отправляется',
  published: 'вышел', failed: 'не ушёл', superseded: 'снят как устаревший', cancelled: 'отменён',
  blocked: 'заблокирован', active: 'включён', paused: 'приостановлен', stopped: 'остановлен',
  supported: 'подтверждено', contradicted: 'противоречит', insufficient: 'нет подтверждения',
  stale: 'устарело', passed: 'прошло', failed_review: 'не прошло',
  low: 'низкая', medium: 'средняя', high: 'высокая',
  article: 'статья', social_post: 'пост',
  // Исход отправки, о котором нельзя сказать ни «вышел», ни «не ушёл»: запрос
  // ушёл, ответ не дошёл, а спросить у площадки нечем.
  unknown: 'исход неизвестен',
  // Роли из учёта расходов — на карточке публикации они стоят в разделе «Деньги».
  writer: 'написание', fact_reviewer: 'проверка фактов', context_reviewer: 'проверка контекста',
  embeddings: 'эмбеддинги', image: 'картинки', research: 'исследование',
  // Причины из очереди внимания — на экране канала они стоят вместо кода.
  claim_changed_after_publish: 'под вышедшим постом изменился факт',
  claim_changed_in_draft: 'изменился факт в неопубликованном варианте',
  source_observation_gap: 'источник молчит несколько наблюдений подряд',
  unknown_outcome: 'отправляли, исход неизвестен',
  channel_auth_failed: 'доступ к каналу отозван',
  manual_publish_unverified: 'выложили руками, страницу поста прочитать не удалось',
  manual_publish_no_utm: 'выложили руками, метки публикации в посте нет',
  manual_publish_cancelled: 'снято из очереди ручной выкладки',
}

export const ru = (k: string) => STATUS_RU[k] ?? k

/** «3 дня», «17 минут» — без библиотеки и без «2 days ago». */
export function ago(iso: string | null): string | null {
  if (!iso) return null
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  return `${d} дн назад`
}
