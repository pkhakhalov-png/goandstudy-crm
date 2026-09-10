// Применение плана входящих ссылок: вставка ссылки в текст страницы-донора (§8.9).
//
// Это правка живого работающего контента, поэтому здесь только механика, а решение
// принимает человек: §13.1 требует одного изменения за раз, §13.5 — чтобы страницы
// из топ-10 правил человек даже на высшем уровне автономности.
import { wp } from './wp'

export type InsertPlan = {
  donorUrl: string
  donorPostId: number
  anchor: string
  targetUrl: string
  /** Фрагмент до и после — чтобы человек видел, во что именно встанет ссылка. */
  before: string
  after: string
}

export type InsertResult =
  | { ok: true; plan: InsertPlan }
  | { ok: false; reason: string }

/**
 * Найти в HTML страницы место под ссылку и построить новый HTML.
 * Требования: фраза встречается в тексте, ещё не внутри ссылки и не в заголовке.
 */
export function buildInsertion(html: string, anchor: string, targetUrl: string): { html: string; before: string; after: string } | null {
  // Ищем вхождения вне тегов: HTML разбираем грубо, но безопасно —
  // подменяем только текстовые куски между тегами.
  const parts = html.split(/(<[^>]+>)/)
  let insideLink = false
  let insideHeading = false

  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i]
    if (chunk.startsWith('<')) {
      const tag = chunk.toLowerCase()
      if (tag.startsWith('<a')) insideLink = true
      if (tag.startsWith('</a')) insideLink = false
      if (/^<h[1-6]/.test(tag)) insideHeading = true
      if (/^<\/h[1-6]/.test(tag)) insideHeading = false
      continue
    }
    if (insideLink || insideHeading || !chunk.trim()) continue

    const idx = chunk.toLowerCase().indexOf(anchor.toLowerCase())
    if (idx < 0) continue

    const exact = chunk.slice(idx, idx + anchor.length)
    const before = chunk.slice(Math.max(0, idx - 90), idx)
    const after = chunk.slice(idx + anchor.length, idx + anchor.length + 90)

    parts[i] = chunk.slice(0, idx) + `<a href="${targetUrl}">${exact}</a>` + chunk.slice(idx + anchor.length)
    return { html: parts.join(''), before, after }
  }
  return null
}

/** Подготовить вставку: прочитать донора через мост и найти место. Ничего не пишет. */
export async function planInsertion(donorUrl: string, anchor: string, targetUrl: string): Promise<InsertResult & { newHtml?: string }> {
  const resolved = await wp.resolve(donorUrl)
  if (!resolved.found || !resolved.post_id) return { ok: false, reason: 'страницы нет в WordPress' }

  const rendered: any = await wp.rendered(resolved.post_id)
  if (rendered.reason === 'post_not_public') return { ok: false, reason: 'донор не опубликован' }

  // Правим исходный контент записи, а не отрендеренную страницу: в рендере есть меню и подвал.
  // Через /export за ним не сходить — он отдаёт только свежую сотню записей.
  const post = await wp.post(resolved.post_id).catch(() => null)
  if (!post) return { ok: false, reason: 'не удалось прочитать содержимое страницы' }

  const built = buildInsertion(String(post.content ?? ''), anchor, targetUrl)
  if (!built) return { ok: false, reason: `фраза «${anchor}» в тексте не найдена вне ссылок и заголовков` }

  return {
    ok: true,
    plan: {
      donorUrl, donorPostId: resolved.post_id, anchor, targetUrl,
      before: built.before, after: built.after,
    },
    newHtml: built.html,
  }
}

/** Применить вставку. Только после подтверждения человеком — см. §13. */
export async function applyInsertion(seo: any, plan: InsertPlan, newHtml: string, articleId: number | null) {
  const { data: cs, error } = await seo.from('change_sets').insert({
    article_id: articleId,
    kind: 'link_insert',
    reason: `вставка ссылки на ${plan.targetUrl} со страницы ${plan.donorUrl}, анкор «${plan.anchor}»`,
    idempotency_key: `link:${plan.donorPostId}:${plan.targetUrl}`,
    status: 'approved', proposed_by: 'human',
    diff: { anchor: plan.anchor, before: plan.before, after: plan.after },
  }).select('id').single()
  if (error && !String(error.message).includes('duplicate')) throw new Error(`change_sets: ${error.message}`)

  await wp.patchPost(plan.donorPostId, {
    replace_content: newHtml,
    idempotency_key: `link:${plan.donorPostId}:${plan.targetUrl}`,
  })

  if (cs) await seo.from('change_sets').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', cs.id)
  return { changeSetId: cs?.id ?? null }
}
