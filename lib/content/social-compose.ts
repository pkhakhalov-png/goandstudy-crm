/**
 * Сборка поста по профилю площадки (E4.7).
 *
 * Пост собирается из частей, а не пишется одним куском. Причина простая: только
 * так можно проверить, что в нём есть тезис, а не разгон на весь экран, что
 * ссылка стоит там, где площадка её не наказывает, и что оговорка про цену
 * появилась именно тогда, когда в тексте есть цена.
 *
 * Модели здесь нет и база не нужна: на вход приходят готовые части, на выходе —
 * текст и список замечаний. Это позволяет прогнать сборку и проверки тестом, а
 * проверку, которую нельзя прогнать, не прогоняют.
 */
import { findSemanticClaims } from '../seo/semantic-claims'
import {
  profileFor, requiredDisclosures,
  type CompositionBlock, type Platform, type SocialProfile,
} from './social-profile'

export type PostParts = {
  /** Первая строка: решает, читают ли вторую. */
  hook: string
  /** Один тезис поста. Два тезиса не запоминаются ни один. */
  thesis: string
  /** Смысловые пункты: шаги, условия, различия. */
  body: string[]
  /** Откуда это известно. */
  proof?: string
  cta?: string
  /** Ссылка с метками: без меток переход не приписать площадке. */
  link?: string
  hashtags?: string[]
  /** Готовые тексты оговорок — подставленные, с датой и периодом. */
  disclosures?: string[]
  /** Пост выйдет с картинкой: у Телеграма от этого падает предел длины. */
  withImage?: boolean
}

export type ComposedPost = {
  platform: Platform
  text: string
  chars: number
  /** Что попало в видимую часть — то, что прочитают до сворачивания ленты. */
  visible: string
  blocks: { id: CompositionBlock['id']; text: string; chars: number }[]
}

/* ── Сборка ───────────────────────────────────────────────────────────────── */

/**
 * Собрать пост.
 *
 * Порядок блоков берётся из профиля, а не задаётся здесь: в ВК ссылка обязана
 * стоять в конце отдельной строкой, в Телеграме — в призыве, и это свойство
 * площадки, а не вкус сборщика.
 */
export function composePost(platform: Platform, parts: PostParts): ComposedPost {
  const profile = profileFor(platform)
  const blocks: ComposedPost['blocks'] = []

  const push = (id: CompositionBlock['id'], text: string) => {
    const t = text.trim()
    if (t) blocks.push({ id, text: t, chars: t.length })
  }

  for (const block of profile.composition) {
    switch (block.id) {
      case 'hook': push('hook', parts.hook); break
      case 'thesis': push('thesis', parts.thesis); break
      case 'body': push('body', bodyFor(profile, parts.body)); break
      case 'proof': push('proof', parts.proof ?? ''); break
      case 'cta': push('cta', ctaFor(profile, parts)); break
      case 'disclosure': push('disclosure', (parts.disclosures ?? []).join(' ')); break
      case 'tags': push('tags', (parts.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')); break
    }
  }

  const text = blocks.map((b) => b.text).join('\n\n')
  return {
    platform,
    text,
    chars: text.length,
    visible: text.slice(0, profile.limits.visibleChars),
    blocks,
  }
}

/** Пункты: в Телеграме — список, в ВК — абзацы. Это и есть разная глубина. */
function bodyFor(profile: SocialProfile, body: string[]): string {
  const items = body.map((s) => s.trim()).filter(Boolean)
  if (!items.length) return ''
  return profile.platform === 'telegram'
    ? items.map((s) => `— ${s}`).join('\n')
    : items.join('\n\n')
}

/** Призыв со ссылкой там, где площадка её терпит. */
function ctaFor(profile: SocialProfile, parts: PostParts): string {
  const words = (parts.cta ?? profile.cta.wording[0]).trim()
  if (!parts.link) return words
  return profile.platform === 'vk'
    ? `${words}\n${parts.link}`        // отдельной строкой: ссылка внутри фразы у ВК теряется в переходнике
    : `${words} — ${parts.link}`
}

/* ── Проверки ─────────────────────────────────────────────────────────────── */

export type PostProblem = {
  level: 'блокирует' | 'замечание'
  what: string
  why: string
}

export type PostCheck = {
  ok: boolean
  problems: PostProblem[]
}

/**
 * Можно ли это выпускать.
 *
 * Блокирует то, что делает пост неработающим или опасным: перебор по жёсткому
 * пределу площадки, обещание результата, отсутствующий тезис, пропущенная
 * обязательная оговорка. Остальное — замечания: длина сверх рабочей, лишние
 * метки, ссылка в первом абзаце ВК.
 */
export function checkPost(post: ComposedPost, parts: PostParts = { hook: '', thesis: '', body: [] }): PostCheck {
  const profile = profileFor(post.platform)
  const problems: PostProblem[] = []
  const say = (level: PostProblem['level'], what: string, why: string) => problems.push({ level, what, why })

  /* Длина */
  const hard = parts.withImage && profile.limits.captionChars < profile.limits.hardChars
    ? profile.limits.captionChars
    : profile.limits.hardChars
  if (post.chars > hard) {
    say('блокирует', `${post.chars} знаков при пределе ${hard}`,
      parts.withImage
        ? 'с картинкой пост становится подписью, и предел площадки другой — текст обрежется на публикации'
        : 'площадка не примет текст целиком')
  } else if (post.chars > profile.limits.targetChars) {
    say('замечание', `${post.chars} знаков при рабочей длине ${profile.limits.targetChars}`,
      'дочитывают всё реже, а пост всё равно не заменяет статью')
  }

  /* Обязательные блоки */
  for (const block of profile.composition.filter((b) => b.required)) {
    if (!post.blocks.some((b) => b.id === block.id)) {
      say('блокирует', `нет блока «${block.id}»`, block.why)
    }
  }

  /* Видимая часть: до сворачивания должен быть смысл, а не разгон */
  const thesisHead = parts.thesis.trim().slice(0, 30).toLowerCase()
  if (thesisHead && !post.visible.toLowerCase().includes(thesisHead)) {
    say('замечание', 'тезис не попал в видимую часть',
      `лента показывает первые ${profile.limits.visibleChars} знаков; дальше читатель решает, разворачивать ли`)
  }

  /* Ссылки */
  const links = post.text.match(/https?:\/\/\S+/g) ?? []
  if (links.length > profile.limits.links) {
    say('блокирует', `ссылок ${links.length} при пределе ${profile.limits.links}`,
      'площадка считает такой пост спамом и занижает охват')
  }
  for (const link of links) {
    if (!/[?&]utm_/.test(link)) {
      say('блокирует', `ссылка без меток: ${link}`,
        profile.link.attribution.why)
    }
  }
  if (profile.platform === 'vk' && links.length) {
    const firstPara = post.text.split('\n\n')[0] ?? ''
    if (links.some((l) => firstPara.includes(l))) {
      say('замечание', 'ссылка в первом абзаце',
        'охват поста с внешней ссылкой ВК занижает; ссылке место в конце отдельной строкой')
    }
  }

  /* Метки */
  const tags = post.text.match(/#[\p{L}\d_]+/gu) ?? []
  if (tags.length > profile.limits.hashtags) {
    say('замечание', `меток ${tags.length} при пределе ${profile.limits.hashtags}`,
      'больше меток не даёт больше охвата, но делает пост похожим на спам')
  }

  /* Оговорки */
  for (const d of requiredDisclosures(profile, post.text)) {
    const key = d.text.split('{')[0].trim().slice(0, 18).toLowerCase()
    if (!post.text.toLowerCase().includes(key)) {
      say('блокирует', `нет оговорки «${d.id}»`, d.why)
    }
  }

  /* Рискованные формулировки — тот же гейт, что у статей */
  for (const f of findSemanticClaims(post.text)) {
    const blocks = f.kind === 'promise' || f.kind === 'visa_requirement' || f.kind === 'work_rights'
    say(blocks ? 'блокирует' : 'замечание', `${f.category}: «${f.trigger}»`,
      `${f.why}. В посте это опаснее, чем в статье: пост читают целиком и без оговорок вокруг`)
  }

  return { ok: !problems.some((p) => p.level === 'блокирует'), problems }
}

/**
 * Развести два варианта одного пакета по углу.
 *
 * Не проверка, а подсказка: что каждая площадка берёт и что оставляет другой.
 * Нужна там, где вариант пишется — если обеим площадкам дать один и тот же
 * вопрос читателя, получится один пост дважды, и проверка на дубль это поймает
 * уже постфактум.
 */
export function anglesFor(platforms: Platform[]): { platform: Platform; question: string; depth: string; leavesOut: string }[] {
  return platforms.map((p) => {
    const profile = profileFor(p)
    return {
      platform: p,
      question: profile.angle.question,
      depth: profile.angle.depth,
      leavesOut: profile.angle.leavesOut,
    }
  })
}
