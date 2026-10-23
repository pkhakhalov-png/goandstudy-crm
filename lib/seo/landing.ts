// Статья-лендинг (формат утверждён владельцем 23.10.2026).
//
// Вид статьи собирает тема сайта (inc/blog-landing.php) из обычных блоков
// тела. От конвейера ей нужен только файл inc/blog-meta/{slug}.json: тексты
// блока заявки под эту статью, фото страны и, где слова заголовка обманывают,
// тон карточек. Есть файл — статья выходит лендингом, нет — прежним видом.
//
// Файл не должен останавливать выпуск: если модель недоступна или ответила
// мимо правил, ставится шаблон по рубрике. Хуже персонального, но статья выходит.

/** Фото для блока заявки — ровно те, что лежат в теме: assets/img/cta/{key}.jpg. */
export const CTA_PHOTOS = [
  'uk', 'usa', 'china', 'australia', 'uae', 'germany', 'france',
  'italy', 'spain', 'netherlands', 'austria', 'hungary', 'turkey',
] as const
export type CtaPhoto = typeof CTA_PHOTOS[number]

/** Рубрика → фото по умолчанию. Тема делает то же, но пусть файл будет полным. */
const CAT_PHOTO: Record<string, CtaPhoto> = {
  'США': 'usa', 'Германия': 'germany', 'Великобритания': 'uk', 'Италия': 'italy',
  'Франция': 'france', 'Китай': 'china', 'ОАЭ': 'uae',
}

/** Страна для подстановки в анкету /book: только если статья про одну страну. */
const PHOTO_COUNTRY: Record<CtaPhoto, string> = {
  uk: 'Великобритания', usa: 'США', china: 'Китай', australia: 'Австралия', uae: 'ОАЭ',
  germany: 'Германия', france: 'Франция', italy: 'Италия', spain: 'Испания',
  netherlands: 'Нидерланды', austria: 'Австрия', hungary: 'Венгрия', turkey: 'Турция',
}

export type Tone = 'good' | 'bad' | 'plain'

export type LandingMeta = {
  cta: {
    /** Короткий вопрос; ключевая часть в <em> — она станет фиолетовой. */
    title: string
    desc: string
    benefits: [string, string, string]
    /** Рукописная подпись со стрелкой. */
    hand: string
    photo: CtaPhoto
    /** Пусто, если статья не про одну страну: тогда анкета спросит сама. */
    country: string
    /** Текст короткой плашки в конце статьи. */
    end: string
  }
  /** Тон карточек по заголовку раздела — только там, где он не нейтральный. */
  tones: Record<string, Tone>
  /** Откуда тексты: модель или шаблон. Для разбора, тема поле не читает. */
  source: 'model' | 'template'
}

/** То, что модель должна вернуть. Схема строгая: лишнего не примет. */
export const LANDING_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    desc: { type: 'string' },
    benefits: { type: 'array', items: { type: 'string' } },
    hand: { type: 'string' },
    photo: { type: 'string', enum: [...CTA_PHOTOS, 'none'] },
    single_country: { type: 'boolean' },
    end: { type: 'string' },
    tones: {
      type: 'array',
      items: {
        type: 'object',
        properties: { h2: { type: 'string' }, tone: { type: 'string', enum: ['good', 'bad', 'plain'] } },
        required: ['h2', 'tone'], additionalProperties: false,
      },
    },
  },
  required: ['title', 'desc', 'benefits', 'hand', 'photo', 'single_country', 'end', 'tones'],
  additionalProperties: false,
} as const

export type LandingAnswer = {
  title: string; desc: string; benefits: string[]; hand: string
  photo: CtaPhoto | 'none'; single_country: boolean; end: string
  tones: { h2: string; tone: Tone }[]
}

export const LANDING_PROMPT = `Ты пишешь короткие тексты для блока «Бесплатная консультация» внутри статьи
образовательного агентства goandstudy (бренд пишется именно так, строчными).
Блок стоит в середине статьи. Его задача — не продать, а предложить читателю
бесплатно разобраться, что прочитанное значит лично для него.

Поля:
— title: вопрос к читателю по теме статьи, 3–7 слов, до 45 знаков. Ключевую часть
  оберни в <em>…</em> (ровно один раз, в конце). Пример: «Планируете поступление
  в <em>Великобританию?</em>», «Мечтаете учиться в вузе <em>из фильма?</em>».
— desc: одно предложение, до 150 знаков: что эксперт goandstudy сделает на
  консультации по теме этой статьи. Без обещаний результата и без цифр.
— benefits: ровно три пункта по 2–4 слова, глагол в будущем времени от «мы»:
  «Оценим ваши шансы», «Посчитаем реальный бюджет», «Подберём программы».
— hand: рукописная подпись, до 40 знаков, тёплая и без восклицательных знаков:
  «Поможем разобраться и сделать первый шаг».
— photo: страна статьи из списка; если статья не про конкретную страну — none.
— single_country: true, только если статья целиком про одну страну.
— end: одна фраза для плашки в конце статьи, до 100 знаков, вопрос + предложение
  разобрать ситуацию на бесплатной консультации.
— tones: для каждого раздела, где пункты списка — ошибки, мифы, минусы,
  укажи bad; где плюсы, сильные стороны, что работает — good. Остальные
  разделы не перечисляй. Не путай тему раздела с тоном: раздел «Деньги: что
  в кино не показывают» про виды финансирования — он нейтральный.

Запрещено: цены, сроки, проценты, гарантии поступления, слова «лучший»,
«гарантируем», «100%», латиница в title, эмодзи, кавычки-ёлочки вокруг всего.`

/** Слова, по которым тема сама красит карточки (inc/blog-landing.php, goandstudy_landing_tone). */
const THEME_GUESSES = /ошибк|неверно|миф|заблужден|честно|плюсы|преимуществ/i

const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

/** Шаблон из ТЗ: универсальный блок, если персональный не получился. */
export function templateLanding(input: { category: string }): LandingMeta {
  const photo = CAT_PHOTO[input.category]
  const country = photo ? PHOTO_COUNTRY[photo] : ''
  const where: Record<string, string> = {
    'США': 'в <em>США?</em>', 'Германия': 'в <em>Германию?</em>', 'Великобритания': 'в <em>Великобританию?</em>',
    'Италия': 'в <em>Италию?</em>', 'Франция': 'во <em>Францию?</em>', 'Китай': 'в <em>Китай?</em>', 'ОАЭ': 'в <em>ОАЭ?</em>',
  }
  return {
    cta: {
      title: where[input.category] ? `Планируете поступление ${where[input.category]}` : 'А какой вариант подходит <em>именно вам?</em>',
      desc: country
        ? `Разберём вашу ситуацию и подскажем, какие университеты и программы в стране вам подходят.`
        : 'Расскажите о своей ситуации — эксперт goandstudy бесплатно поможет разобраться в вариантах и следующих шагах.',
      benefits: ['Оценим ваши шансы', 'Подберём программы', 'Обозначим следующие шаги'],
      hand: 'Поможем разобраться и сделать первый шаг',
      photo: photo ?? 'uk',
      country,
      end: 'Остались вопросы после статьи? Разберём вашу ситуацию на бесплатной консультации',
    },
    tones: {},
    source: 'template',
  }
}

/**
 * Принять ответ модели или вернуть null с причиной. Ограничения длины — из
 * макета: длиннее вопрос не влезает в две строки, длиннее пункт — в три.
 */
export function acceptLanding(a: LandingAnswer, input: { category: string; headings: string[] }):
  { ok: true; meta: LandingMeta } | { ok: false; why: string } {
  const title = a.title.trim().replace(/<(?!\/?em>)[^>]+>/g, '')
  const ems = (title.match(/<em>/g) ?? []).length
  if (ems !== 1 || !/<em>[^<]+<\/em>/.test(title)) return { ok: false, why: 'в заголовке нужен ровно один <em>' }
  if (plain(title).length > 60) return { ok: false, why: `заголовок длинный: ${plain(title).length}` }
  if (/[a-z]/i.test(plain(title))) return { ok: false, why: 'латиница в заголовке' }

  const desc = plain(a.desc)
  if (!desc || desc.length > 170) return { ok: false, why: `описание ${desc.length} знаков` }
  if (a.benefits.length !== 3) return { ok: false, why: `пунктов ${a.benefits.length}, нужно 3` }
  const benefits = a.benefits.map(plain) as [string, string, string]
  if (benefits.some((b) => !b || b.length > 34)) return { ok: false, why: 'пункт пустой или длинный' }
  const hand = plain(a.hand)
  if (!hand || hand.length > 48) return { ok: false, why: 'подпись пустая или длинная' }
  const end = plain(a.end)
  if (!end || end.length > 120) return { ok: false, why: 'фраза в конце пустая или длинная' }

  const all = [plain(title), desc, ...benefits, hand, end].join(' ')
  if (/\d|%|₽|\$|€|гарант|лучш/i.test(all)) return { ok: false, why: 'цифры, цены или обещания в тексте блока' }

  const photo: CtaPhoto = a.photo !== 'none' ? a.photo : (CAT_PHOTO[input.category] ?? 'uk')
  const country = a.single_country && a.photo !== 'none' ? PHOTO_COUNTRY[a.photo] : ''

  // Тон принимаем только для заголовков, которые реально есть в статье.
  // Нейтральный пишем лишь там, где тема сама угадала бы по словам заголовка
  // (ошибки, мифы, плюсы) — иначе он и так нейтральный.
  const known = new Set(input.headings.map(plain))
  const tones: Record<string, Tone> = {}
  for (const t of a.tones) {
    const h = plain(t.h2)
    if (!known.has(h)) continue
    if (t.tone !== 'plain' || THEME_GUESSES.test(h)) tones[h] = t.tone
  }

  return { ok: true, meta: { cta: { title, desc, benefits, hand, photo, country, end }, tones, source: 'model' } }
}

/** Содержимое inc/blog-meta/{slug}.json: ровно то, что читает тема. */
export function landingJson(meta: LandingMeta): string {
  return JSON.stringify({ cta: meta.cta, tones: meta.tones }, null, 2) + '\n'
}

/** Заголовки H2 тела: модели нужны, чтобы назвать тон разделов. */
export function headingsOf(body: string): string[] {
  return [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => plain(m[1]))
}

/**
 * Настройки лендинга для статьи: персональные от модели, при любой неудаче —
 * шаблон по рубрике. Никогда не бросает: блок заявки не повод держать статью.
 */
export async function buildLanding(
  input: { title: string; h1: string; category: string; body: string },
  spend?: Parameters<typeof import('./generate').planLanding>[1],
): Promise<LandingMeta & { why?: string }> {
  const headings = headingsOf(input.body)
  const lead = plain(input.body.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '').slice(0, 600)
  try {
    const { planLanding } = await import('./generate')
    const answer = await planLanding({ title: input.title, h1: input.h1, category: input.category, lead, headings }, spend)
    const accepted = acceptLanding(answer, { category: input.category, headings })
    if (accepted.ok) return accepted.meta
    return { ...templateLanding(input), why: accepted.why }
  } catch (e) {
    return { ...templateLanding(input), why: `модель: ${String(e instanceof Error ? e.message : e).slice(0, 200)}` }
  }
}
