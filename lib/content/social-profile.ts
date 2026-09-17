/**
 * Профиль площадки для постов (E4.7).
 *
 * Профиль — это данные, а не кусок промпта. Из данных можно посчитать, проверить
 * и показать человеку, почему пост выглядит так, а не иначе; из абзаца текста в
 * промпте — нельзя ничего, кроме как надеяться.
 *
 * Телеграм и ВК различаются не длиной поста. Главное различие — что площадка
 * делает со ссылкой, и отсюда следует, можно ли вообще приписывать ей переходы:
 *
 *   · В Телеграме ссылка в теле кликабельна и ведёт наружу как есть. Переход
 *     видно, но только если в ссылке стоит метка: браузер в приложении реферер
 *     не отдаёт, и без utm переход придёт «ниоткуда».
 *   · ВК внешнюю ссылку переписывает на свой переходник и занижает охват постов
 *     с ней. Реферер у такого перехода — сам ВК, а не пост, поэтому без метки с
 *     идентификатором поста приписать переход конкретной публикации нельзя даже
 *     теоретически. Это не «сложно», это «невозможно».
 *
 * Поэтому в профиле лежит не «поддерживает ссылки», а как именно, и что из этого
 * следует для учёта переходов.
 *
 * Про «проверено». Всё, что здесь написано про поведение площадки, — наше
 * ожидание, а не факт: ожидание живёт в поле `assumed`. Факт появляется, когда
 * в content.connector_capabilities ложится успешный вызов со ссылкой на себя
 * (proof_ref). До этого момента «поддерживает ссылки» означает «мы так думаем»,
 * и профиль обязан говорить это вслух, а не подразумевать.
 */

export type Platform = 'telegram' | 'vk'

/** Как площадка обходится со ссылкой в теле поста. */
export type LinkBehaviour =
  | 'clickable'      // ссылка уходит наружу как есть
  | 'wrapped'        // площадка подменяет ссылку своим переходником
  | 'demoted'        // площадка занижает охват поста со ссылкой
  | 'unknown'        // не проверяли

/** Можно ли приписать переход этому посту — и почему. */
export type Attribution = {
  /** Возможна ли привязка перехода к конкретной публикации. */
  possible: boolean
  /** Чем именно привязывается: без этого «возможна» ничего не значит. */
  requires: string[]
  why: string
}

export type SocialProfile = {
  platform: Platform
  /** Кто это читает и в каком состоянии. */
  audience: string
  /** Задача поста. Не «рассказать о статье», а что должно случиться с читателем. */
  job: string
  tone: string[]
  /** Чего в посте быть не должно — ограничения площадки и наши. */
  avoid: string[]

  limits: {
    /** Сколько знаков читают до того, как лента свернёт текст. */
    visibleChars: number
    /** Рабочая длина: дальше пост перестаёт быть постом. */
    targetChars: number
    /** Жёсткий предел площадки. */
    hardChars: number
    /** Сколько знаков занимает подпись под медиа, если пост с картинкой. */
    captionChars: number
    hashtags: number
    /** Ссылок в теле. Больше — площадка считает пост спамом. */
    links: number
  }

  link: {
    inBody: LinkBehaviour
    /** Куда ставить ссылку, чтобы она работала на площадке. */
    placement: string
    attribution: Attribution
    /** Это ожидание, а не проверенный факт. Снимается через proof_ref. */
    assumed: boolean
  }

  media: {
    /** Пост без картинки на этой площадке жизнеспособен? */
    requiresImage: boolean
    aspect: string
    note: string
    assumed: boolean
  }

  /** Композиция: из каких частей собирается пост и зачем каждая. */
  composition: CompositionBlock[]

  cta: {
    /** Что просим сделать. Одно действие, а не список. */
    action: string
    wording: string[]
  }

  /** Оговорки, без которых пост выпускать нельзя. */
  disclosures: Disclosure[]

  /**
   * Угол подачи. Ключевое требование PRD: адаптация меняет угол и глубину, а не
   * синонимы. Два поста об одном пакете обязаны отвечать на разные вопросы
   * читателя, иначе это один пост, выпущенный дважды.
   */
  angle: {
    question: string
    depth: 'что делать' | 'как устроено' | 'что это значит'
    /** Чего этот угол НЕ берёт — то, что достанется другой площадке. */
    leavesOut: string
  }
}

export type CompositionBlock = {
  id: 'hook' | 'thesis' | 'body' | 'proof' | 'cta' | 'disclosure' | 'tags'
  /** Зачем этот блок. Без ответа блок не нужен. */
  why: string
  required: boolean
  /** Сколько знаков на блок: сумма не должна превышать targetChars. */
  chars: [number, number]
}

export type Disclosure = {
  id: string
  /** Когда оговорка обязательна. */
  when: 'всегда' | 'если есть цена' | 'если есть срок' | 'если есть статистика'
  text: string
  why: string
}

/* ── Общие оговорки ───────────────────────────────────────────────────────── */

const DISCLOSURES: Disclosure[] = [
  {
    id: 'not_offer',
    when: 'всегда',
    text: 'Не оферта: условия поступления определяет вуз.',
    why: 'пост читают как обещание, если не сказано обратного — а поступление решаем не мы',
  },
  {
    id: 'price_checked_at',
    when: 'если есть цена',
    text: 'Цена на {дата проверки} — вузы пересматривают её ежегодно.',
    why: 'цена без даты проверки живёт в посте вечно и устаревает молча; ревизия архива нашла таких 93 штуки',
  },
  {
    id: 'deadline_year',
    when: 'если есть срок',
    text: 'Срок приёма {год} — на следующий год сверяйтесь с сайтом вуза.',
    why: 'приёмная кампания сдвигается каждый год, а пост остаётся в ленте и в поиске',
  },
  {
    id: 'own_stat',
    when: 'если есть статистика',
    text: 'Данные наши, по клиентам за {период}.',
    why: 'без указания, чьи это числа и за какой срок, статистика читается как отраслевая',
  },
]

/* ── Композиции ───────────────────────────────────────────────────────────── */

const TELEGRAM_COMPOSITION: CompositionBlock[] = [
  { id: 'hook', why: 'лента пролистывается: первая строка решает, читают ли вторую', required: true, chars: [40, 120] },
  { id: 'thesis', why: 'один тезис на пост — два тезиса не запоминаются ни один', required: true, chars: [80, 220] },
  { id: 'body', why: 'три шага или три условия: столько удерживается без прокрутки', required: true, chars: [200, 500] },
  { id: 'proof', why: 'откуда это известно — иначе пост неотличим от чужого пересказа', required: false, chars: [40, 140] },
  { id: 'cta', why: 'одно действие; «ссылка в статье» без действия — это не призыв', required: true, chars: [30, 120] },
  { id: 'disclosure', why: 'оговорка про цену и срок, если они в тексте есть', required: false, chars: [0, 120] },
]

const VK_COMPOSITION: CompositionBlock[] = [
  { id: 'hook', why: 'лента сворачивает текст: до «Показать полностью» должен быть смысл, а не разгон', required: true, chars: [60, 180] },
  { id: 'thesis', why: 'пост обязан быть самодостаточным: переход по ссылке здесь дороже, чем в Телеграме', required: true, chars: [120, 320] },
  { id: 'body', why: 'разбор, а не список: ВК читают дольше и ждут объяснения, а не команды', required: true, chars: [400, 900] },
  { id: 'proof', why: 'откуда это известно', required: false, chars: [40, 160] },
  { id: 'cta', why: 'одно действие; ссылка отдельной строкой, а не внутри фразы', required: true, chars: [30, 120] },
  { id: 'disclosure', why: 'оговорка про цену и срок, если они в тексте есть', required: false, chars: [0, 140] },
  { id: 'tags', why: 'метки — единственный способ попасть в тематическую выдачу ВК', required: false, chars: [0, 80] },
]

/* ── Профили ──────────────────────────────────────────────────────────────── */

export const TELEGRAM: SocialProfile = {
  platform: 'telegram',
  audience: 'подписчики канала, читают в приложении между личными чатами; пришли за пользой, а не за листанием',
  job: 'дать один законченный ответ и повод открыть подробности',
  tone: ['разговорно, но без панибратства', 'короткие абзацы', 'глаголы вместо отглагольных существительных'],
  avoid: ['канцелярит', 'обещание результата', 'больше одного тезиса', 'эмодзи вместо структуры'],

  limits: {
    // Лента показывает первые строки; дальше читатель решает, разворачивать ли
    visibleChars: 250,
    targetChars: 900,
    hardChars: 4096,
    captionChars: 1024,
    hashtags: 3,
    links: 2,
  },

  link: {
    inBody: 'clickable',
    placement: 'в призыве, последней строкой; первая ссылка разворачивается в превью — его отключаем, если картинка своя',
    attribution: {
      possible: true,
      requires: ['utm_source=telegram', 'utm_medium=post', 'utm_content=<id публикации>'],
      why: 'ссылка уходит наружу как есть, но браузер в приложении реферер не передаёт: без меток переход придёт «ниоткуда» и припишется прямому заходу',
    },
    assumed: true,
  },

  media: {
    requiresImage: false,
    aspect: '3:2',
    note: 'с картинкой пост становится подписью — предел падает с 4096 до 1024 знаков',
    assumed: true,
  },

  composition: TELEGRAM_COMPOSITION,

  cta: {
    action: 'открыть статью по ссылке',
    wording: ['Разобрали по шагам — ссылка ниже', 'Полный разбор со сроками и суммами'],
  },

  disclosures: DISCLOSURES,

  angle: {
    question: 'что делать прямо сейчас',
    depth: 'что делать',
    leavesOut: 'как устроена система и почему так — это угол для ВК',
  },
}

export const VK: SocialProfile = {
  platform: 'vk',
  audience: 'лента сообщества вперемешку с рекомендациями и рекламой; читают дольше, но отвлекаются чаще',
  job: 'дать самодостаточный разбор, который полезен даже без перехода',
  tone: ['спокойно и обстоятельно', 'абзацы по 2–3 предложения', 'без сленга'],
  avoid: ['обещание результата', 'ссылка в первом абзаце', 'больше одной внешней ссылки', 'кликбейт в первой строке'],

  limits: {
    // «Показать полностью» — граница, за которой текста для большинства нет
    visibleChars: 350,
    targetChars: 1600,
    hardChars: 16000,
    captionChars: 16000,
    hashtags: 5,
    links: 1,
  },

  link: {
    inBody: 'wrapped',
    placement: 'отдельной строкой в конце; в первом абзаце ссылку не ставим — охват поста с внешней ссылкой площадка занижает',
    attribution: {
      possible: true,
      requires: ['utm_source=vk', 'utm_medium=post', 'utm_content=<id публикации>'],
      why: 'ВК ведёт переход через свой переходник, поэтому реферером придёт сам ВК, а не пост: без метки с идентификатором публикации приписать переход конкретному посту нельзя в принципе, а не «трудно»',
    },
    assumed: true,
  },

  media: {
    requiresImage: true,
    aspect: '3:2',
    note: 'пост без картинки в ленте ВК визуально проваливается между карточками с медиа',
    assumed: true,
  },

  composition: VK_COMPOSITION,

  cta: {
    action: 'прочитать полный разбор',
    wording: ['Полная версия с таблицами и сроками', 'Разобрали подробно, со ссылками на источники'],
  },

  disclosures: DISCLOSURES,

  angle: {
    question: 'как это устроено и почему',
    depth: 'как устроено',
    leavesOut: 'пошаговый порядок действий — это угол для Телеграма',
  },
}

export const PROFILES: Record<Platform, SocialProfile> = { telegram: TELEGRAM, vk: VK }

export function profileFor(platform: Platform): SocialProfile {
  const p = PROFILES[platform]
  if (!p) throw new Error(`нет профиля площадки «${platform}»`)
  return p
}

/* ── Проверено или мы так думаем ──────────────────────────────────────────── */

/** Строка из content.connector_capabilities — то, что подтверждено вызовом. */
export type VerifiedCapabilities = {
  platform: string
  account_external_id?: string | null
  verified_formats?: string[] | null
  verified_actions?: string[] | null
  checked_at?: string | null
  /** Ссылка на успешный вызов. Пусто — значит, не проверено, что бы ни было в списках. */
  proof_ref?: string | null
}

export type CapabilityAnswer = {
  /** Умеет ли площадка это по нашим данным. */
  supported: boolean
  /** Проверено вызовом или мы так думаем. */
  proven: boolean
  why: string
  proofRef?: string | null
  checkedAt?: string | null
}

/**
 * Умеет ли площадка действие — и откуда мы это знаем.
 *
 * Правило одно: `proven` становится true только при наличии proof_ref. Запись в
 * connector_capabilities без ссылки на успешный вызов — это чья-то уверенность,
 * записанная в базу, и она не должна выглядеть как проверка. Так же и пустая
 * таблица: пока вызовов не было, ответ «мы так думаем», и это честно.
 */
export function capability(
  profile: SocialProfile,
  action: string,
  verified?: VerifiedCapabilities | null,
): CapabilityAnswer {
  const listed = (verified?.verified_actions ?? []).includes(action)
    || (verified?.verified_formats ?? []).includes(action)
  const proof = verified?.proof_ref ?? null

  if (listed && proof) {
    return {
      supported: true, proven: true, proofRef: proof, checkedAt: verified?.checked_at ?? null,
      why: `проверено вызовом ${proof}${verified?.checked_at ? ` от ${String(verified.checked_at).slice(0, 10)}` : ''}`,
    }
  }
  if (listed && !proof) {
    return {
      supported: true, proven: false, proofRef: null, checkedAt: verified?.checked_at ?? null,
      why: 'записано в connector_capabilities без proof_ref — это «мы так думаем», а не проверка',
    }
  }
  return {
    supported: DEFAULT_ACTIONS[profile.platform].includes(action),
    proven: false,
    proofRef: null,
    why: 'вызовов не было: ответ основан на профиле площадки, а не на проверке',
  }
}

/** Что мы ожидаем от площадки до первого успешного вызова. */
const DEFAULT_ACTIONS: Record<Platform, string[]> = {
  telegram: ['post_text', 'post_photo', 'edit', 'delete', 'link_in_body', 'disable_preview'],
  vk: ['post_text', 'post_photo', 'edit', 'delete', 'link_in_body'],
}

/**
 * Можно ли приписывать площадке переходы.
 *
 * Отдельная функция, потому что это не свойство ссылки, а вывод из двух вещей:
 * как площадка ведёт себя со ссылкой и проверяли ли мы это вызовом. Пока не
 * проверяли, ответ «возможно при условии меток, но не подтверждено» — и учёт
 * переходов не должен выдавать его за измеренный факт.
 */
export function linkAttribution(
  profile: SocialProfile,
  verified?: VerifiedCapabilities | null,
): Attribution & { proven: boolean; note: string } {
  const cap = capability(profile, 'link_in_body', verified)
  return {
    ...profile.link.attribution,
    proven: cap.proven,
    note: cap.proven
      ? `поведение ссылки подтверждено: ${cap.why}`
      : `поведение ссылки не подтверждено вызовом (${cap.why}); метки обязательны в любом случае, но приписанные переходы считаем оценкой, а не измерением`,
  }
}

/**
 * Оговорки, обязательные для этого текста.
 *
 * Профиль перечисляет все возможные, а нужны те, что относятся к содержанию:
 * оговорка про цену в посте без единой суммы — шум, который учит не читать
 * оговорки вовсе.
 */
export function requiredDisclosures(profile: SocialProfile, text: string): Disclosure[] {
  const hasPrice = /\d[\d\s ]*\s*(?:₽|руб|€|\$|¥|£|евро|доллар|рубл)/iu.test(text)
  const hasDeadline = /(?:дедлайн|срок подачи|до\s+\d{1,2}\s+(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр))/iu.test(text)
  const hasStat = /(?:наши\s+(?:студент|клиент)|по\s+нашему\s+опыту|\d+\s*%\s+(?:наших|студентов|клиентов))/iu.test(text)

  return profile.disclosures.filter((d) =>
    d.when === 'всегда'
    || (d.when === 'если есть цена' && hasPrice)
    || (d.when === 'если есть срок' && hasDeadline)
    || (d.when === 'если есть статистика' && hasStat))
}
