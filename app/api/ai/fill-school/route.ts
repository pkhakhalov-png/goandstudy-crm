import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createParserClient, createParserAdminClient } from '@/lib/supabase/parser'
import { getAnthropic } from '@/lib/ai'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const SAVE_TOOL = {
  name: 'save_school_info',
  description:
    'Сохранить найденную информацию об университете. Поля, которые не удалось найти достоверно — передавай null. ВАЖНО: logo_url должен быть прямой ссылкой на лого с официального сайта или Wikimedia (PNG/SVG/JPG). description — длинное (8-15 предложений) описание с секциями ## Сильные стороны / ## Стажировки и работа / ## Известные выпускники / ## Финансовая помощь. curator_note — короткий тизер 1-2 предложения для шапки. video_link — embed-ссылка YouTube (формат https://www.youtube.com/embed/XXXX) официального тура/презентации вуза, если найдёшь.',
  input_schema: {
    type: 'object',
    properties: {
      qs_rank: {
        type: ['integer', 'null'],
        description: 'Текущий QS World University Rank. Если вуз unranked — null.',
      },
      university_type: {
        type: ['string', 'null'],
        enum: ['Государственный', 'Частный', null],
        description: 'Тип финансирования вуза.',
      },
      founded_in: {
        type: ['integer', 'null'],
        description: 'Год основания вуза (4 цифры).',
      },
      logo_url: {
        type: ['string', 'null'],
        description: 'Прямая ссылка на логотип (PNG/SVG/JPG). Только если уверен что URL рабочий — иначе null. Wikimedia Commons или официальный сайт.',
      },
      campus_photo_url: {
        type: ['string', 'null'],
        description: 'ПРЯМАЯ ссылка на ИЗОБРАЖЕНИЕ кампуса. URL ОБЯЗАН заканчиваться на .jpg/.jpeg/.png/.webp (например upload.wikimedia.org/wikipedia/commons/.../1280px-XXX.jpg). НЕЛЬЗЯ возвращать ссылку на HTML-страницу типа en.wikipedia.org/wiki/File:XXX.jpg или сайт вуза. Только сама картинка. Лучший источник: Wikipedia infobox image. Не подходят: логотипы, постановочные фото со студентами, коллажи, карты. Только здания/территория.',
      },
      website: {
        type: ['string', 'null'],
        description: 'Официальный сайт вуза (https://...).',
      },
      curator_note: {
        type: ['string', 'null'],
        description: 'Короткий тизер 1-2 предложения для шапки страницы. Пример: «Один из топ-10 университетов мира, известен факультетом юриспруденции и IT.»',
      },
      description: {
        type: ['string', 'null'],
        description: 'Длинное описание для вкладки «О вузе» (8-15 предложений на русском). Используй секции в формате Markdown: ## Сильные стороны, ## Стажировки и работа, ## Известные выпускники, ## Финансовая помощь, ## Кампус и атмосфера. Без выдумок — только проверенное.',
      },
      video_link: {
        type: ['string', 'null'],
        description: 'YouTube embed URL ТОЛЬКО с ОФИЦИАЛЬНОГО канала самого университета. Формат: https://www.youtube.com/embed/VIDEO_ID. КАТЕГОРИЧЕСКИ запрещено брать видео с каналов агентств / образовательных консультантов / посредников (SMAPS, IDP, ApplyBoard, Crimson Education, Hotcourses, KCM Stars, EduGate, Studyportals, Schoolapply и т.п.) — даже если они рекламируют этот вуз. Если канал не принадлежит самому вузу или ты не уверен — null.',
      },
      // Локация
      address: {
        type: ['string', 'null'],
        description: 'Точный почтовый адрес главного кампуса (улица, дом).',
      },
      city: {
        type: ['string', 'null'],
        description: 'Город (по-русски если для русскоязычной аудитории привычнее, иначе латиницей как на сайте).',
      },
      province: {
        type: ['string', 'null'],
        description: 'Регион/штат/провинция.',
      },
      postal_code: {
        type: ['string', 'null'],
        description: 'Почтовый индекс.',
      },
      latitude: {
        type: ['number', 'null'],
        description: 'Широта главного кампуса (decimal, e.g. 42.3770).',
      },
      longitude: {
        type: ['number', 'null'],
        description: 'Долгота главного кампуса (decimal, e.g. -71.1167).',
      },
      // ─── Цифры / факты для правой колонки карточки ───
      avg_tuition_year_intl: {
        type: ['number', 'null'],
        description: 'Средняя стоимость обучения для ИНОСТРАННОГО студента за год, в первичной валюте вуза. Например 25000 для $25k/year. Для bachelor берём типичную цифру; если несколько уровней — для bachelor.',
      },
      tuition_currency: {
        type: ['string', 'null'],
        enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'CHF', 'SEK', 'DKK', 'NOK', 'CZK', 'PLN', 'HUF', 'JPY', 'CNY', 'KRW', null],
        description: 'Валюта tuition. ISO 4217 (USD/EUR/GBP и т.п.).',
      },
      avg_living_cost_year: {
        type: ['number', 'null'],
        description: 'Средние расходы на проживание студента за год в той же валюте что tuition (жильё+еда+транспорт).',
      },
      avg_application_fee: {
        type: ['number', 'null'],
        description: 'Типичный application fee (взнос за заявку), число в той же валюте.',
      },
      typical_intakes: {
        type: ['array', 'null'],
        description: 'Месяцы старта программ для иностранцев. Пример: ["Сентябрь", "Январь"]. Только реальные intake-окна — не выдумывай.',
        items: { type: 'string' },
      },
      student_count_total: {
        type: ['integer', 'null'],
        description: 'Общее число студентов вуза (приблизительно).',
      },
      international_students_share: {
        type: ['number', 'null'],
        description: 'Доля иностранных студентов в %. Например 23 значит 23%. Если не нашёл — null.',
      },
      acceptance_rate: {
        type: ['number', 'null'],
        description: 'Процент принятых от подавших, в %. Например 5 = 5% (Harvard). Если selective без точной цифры — null.',
      },
      top_specialties: {
        type: ['array', 'null'],
        description: 'Топ-5 направлений вуза на русском. Пример: ["Бизнес", "IT", "Дизайн"]. Берём из Wiki или сайта вуза.',
        items: { type: 'string' },
      },
      accreditations: {
        type: ['array', 'null'],
        description: 'Список признанных аккредитаций (CAA, EQUIS, AACSB, AMBA, ACBSP, NWCCU и т.п.).',
        items: { type: 'string' },
      },
      sources: {
        type: ['array', 'null'],
        description: 'URL-источники откуда взята инфа (для логов).',
        items: { type: 'string' },
      },
    },
    required: [],
  },
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown'
    console.error('[fill-school] uncaught:', e)
    return NextResponse.json({ ok: false, error: `Server: ${msg}` }, { status: 500 })
  }
}

async function checkUrl(url: string, expectImage = false): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })
    if (!r.ok) return false
    if (expectImage) {
      const ct = r.headers.get('content-type') || ''
      if (!ct.startsWith('image/')) return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * YouTube видео можно брать ТОЛЬКО с канала самого вуза.
 * Через oEmbed получаем author_name и сверяем с именем вуза + блок-листом
 * образовательных консультантов / агентств.
 */
const VIDEO_BLOCKLIST_KEYWORDS = [
  'smaps', 'idp', 'applyboard', 'crimson', 'hotcourses', 'kcm', 'edugate',
  'studyportals', 'schoolapply', 'studyabroad', 'edvoy', 'shorelight',
  'mastersportal', 'unipage', 'navitas', 'agency', 'консалт', 'агентств',
  'обучен', 'консультант',
]

async function isOfficialUniversityVideo(embedUrl: string, schoolName: string): Promise<{ ok: boolean; reason: string; author?: string }> {
  // Извлекаем ID видео из embed URL
  const m = /youtube\.com\/embed\/([\w-]+)/.exec(embedUrl)
  if (!m) return { ok: false, reason: 'не youtube embed' }
  const videoId = m[1]
  try {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!oembed.ok) return { ok: false, reason: `oembed ${oembed.status}` }
    const data = await oembed.json() as { author_name?: string; title?: string }
    const author = (data.author_name || '').toLowerCase()
    if (!author) return { ok: false, reason: 'нет author_name' }
    // Блок-лист
    for (const kw of VIDEO_BLOCKLIST_KEYWORDS) {
      if (author.includes(kw)) return { ok: false, reason: `канал содержит «${kw}»`, author: data.author_name }
    }
    // Имя канала должно содержать общую токены с именем вуза
    const schoolTokens = schoolName.toLowerCase().split(/[\s\-,.()/]+/).filter(t => t.length >= 4)
    const matched = schoolTokens.some(t => author.includes(t))
    if (!matched) return { ok: false, reason: 'имя канала не совпадает с вузом', author: data.author_name }
    return { ok: true, reason: 'ok', author: data.author_name }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'oembed error' }
  }
}

async function handle(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['curator', 'admin', 'rop'].includes(profile?.role || '')) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY не настроен' }, { status: 500 })
  }

  let body: { schoolId?: number | string } = {}
  try { body = await req.json() } catch {}
  const schoolId = Number(body.schoolId)
  if (!schoolId) return NextResponse.json({ ok: false, error: 'Missing schoolId' }, { status: 400 })

  const parser = createParserClient()
  const { data: school } = await parser
    .from('schools')
    .select('id, name, country_code, city, province, address, postal_code, latitude, longitude, website, qs_rank, university_type, founded_in, logo_url, curator_note, description, video_link')
    .eq('id', schoolId)
    .maybeSingle()
  if (!school) return NextResponse.json({ ok: false, error: 'School not found' }, { status: 404 })

  const userMessage = `Найди актуальную информацию об университете и вызови tool save_school_info ровно один раз.

Университет: ${school.name}
Страна: ${(school.country_code || '').toUpperCase()}${school.province ? `, ${school.province}` : ''}${school.city ? `, ${school.city}` : ''}
Текущий сайт в БД: ${school.website || 'не указан'}

Что ИИ нужно найти:

1. **QS World University Rank** — текущий. Unranked — null.
2. **Тип финансирования**: Государственный или Частный.
3. **Год основания** (4 цифры).
4. **Логотип** — прямая ссылка на PNG/SVG/JPG. ВАЖНО: убедись что ссылка реально ведёт на изображение. Лучше проверить через web_search ("название_вуза logo wikimedia commons" или "название_вуза logo png"). Если не уверен — null.
4b. **Фото кампуса** (campus_photo_url) — ОДНА горизонтальная фотография кампуса/главного здания. ОБЯЗАТЕЛЬНО первым делом открой статью вуза в English Wikipedia — там в правом infobox-блоке почти всегда есть картинка (URL обычно upload.wikimedia.org/wikipedia/commons/thumb/.../1280px-...jpg или такой же без thumb/). Возьми её. Если в Wiki картинки нет — ищи на официальном сайте вуза в разделе About / Campus. Запрещены: логотипы, постановочные фото со студентами, коллажи, карты. Только здания/территория. Если совсем не нашёл — null.
5. **Официальный сайт** (https://).
6. **curator_note** — короткий тизер 1-2 предложения для шапки страницы (НЕ длинное описание).
7. **description** — ДЛИННОЕ описание (8-15 предложений) с секциями в Markdown:
   ## Сильные стороны
   {какие факультеты сильные, рейтинги, признание}

   ## Стажировки и работа
   {co-op программы, partnership с компаниями, post-graduation work permit, типичные работодатели выпускников}

   ## Известные выпускники
   {3-5 знаменитостей если есть}

   ## Финансовая помощь
   {стипендии, гранты, need-based aid, средняя помощь иностранцам}

   ## Кампус и атмосфера
   {размер кампуса, инфраструктура, культура, спорт}
8. **video_link** — официальный YouTube embed URL вуза. Формат должен быть точно https://www.youtube.com/embed/VIDEO_ID. Проверь что видео существует. Если нет — null.
9. **Локация главного кампуса**:
   - Точный почтовый адрес (улица, дом)
   - Город / Регион / Почтовый индекс
   - Координаты (latitude / longitude в decimal). Возьми из Wikipedia.

10. **Цифры о вузе** (ВАЖНО — куратору нужно показать клиенту, не ленись искать):
   - **avg_tuition_year_intl** — типичная стоимость обучения (bachelor) для иностранца за год, число
   - **tuition_currency** — валюта (USD/EUR/GBP/AED и т.п.)
   - **avg_living_cost_year** — годовой living cost студента в той же валюте
   - **avg_application_fee** — взнос за подачу заявки (число)
   - **typical_intakes** — массив месяцев когда начинаются программы. Например ["Сентябрь"] или ["Сентябрь", "Январь"]
   - **student_count_total** — общее число студентов
   - **international_students_share** — % иностранцев (число от 0 до 100)
   - **acceptance_rate** — % принятых (если selective и есть цифра)
   - **top_specialties** — массив топ-5 направлений на русском (Бизнес, IT, Дизайн и т.п.)
   - **accreditations** — массив аккредитаций (CAA, EQUIS, AACSB, AMBA и т.п.)

Если не уверен — null. Лучше пустое поле чем выдумка. Но цифры из официальных источников / Wiki — не пропускай, они важны куратору.`

  let aiInput: any
  try {
    const anthropic = getAnthropic()
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 6 },
        SAVE_TOOL,
      ] as any,
      messages: [{ role: 'user', content: userMessage }],
    })
    const saveBlock = response.content.find(
      (b: any) => b.type === 'tool_use' && b.name === 'save_school_info'
    ) as any
    if (!saveBlock) {
      return NextResponse.json({
        ok: false,
        error: 'ИИ не вернул структурированный ответ',
        stopReason: response.stop_reason,
      }, { status: 502 })
    }
    aiInput = saveBlock.input || {}
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown'
    return NextResponse.json({ ok: false, error: `AI: ${msg}` }, { status: 500 })
  }

  // Сохраняем — только если ИИ что-то нашёл
  const update: Record<string, unknown> = {}
  if (typeof aiInput.qs_rank === 'number' && aiInput.qs_rank > 0) update.qs_rank = aiInput.qs_rank
  if (aiInput.university_type === 'Государственный' || aiInput.university_type === 'Частный') {
    update.university_type = aiInput.university_type
  }
  if (typeof aiInput.founded_in === 'number' && aiInput.founded_in > 1000 && aiInput.founded_in <= new Date().getFullYear()) {
    update.founded_in = aiInput.founded_in
  }

  // Валидация logo_url HEAD-запросом — не сохраняем 404
  if (aiInput.logo_url && /^https?:\/\//.test(aiInput.logo_url)) {
    const ok = await checkUrl(aiInput.logo_url, true)
    if (ok) update.logo_url = aiInput.logo_url
    else console.warn('[fill-school] logo_url failed HEAD check:', aiInput.logo_url)
  }

  // campus_photo_url — без HEAD (Wikimedia/CDN часто блокируют HEAD).
  // Сохраняем если URL валидный + ведёт на картинку (по расширению).
  // Битые ссылки спрячет onError на клиенте.
  console.log('[fill-school] AI вернул campus_photo_url:', aiInput.campus_photo_url || 'null')
  if (aiInput.campus_photo_url && /^https?:\/\//.test(aiInput.campus_photo_url)) {
    const url = String(aiInput.campus_photo_url).trim()
    const isImage = /\.(jpe?g|png|webp|svg)(\?|#|$)/i.test(url)
    const isHtmlPage = /\/wiki\/File:|\.html?(\?|#|$)/i.test(url)
    if (isImage && !isHtmlPage) {
      update.campus_photo_url = url
      console.log('[fill-school] campus_photo_url accepted ✓')
    } else {
      console.warn('[fill-school] campus_photo_url rejected (не прямая картинка):', url)
    }
  }

  if (aiInput.website && /^https?:\/\//.test(aiInput.website)) update.website = aiInput.website
  if (aiInput.curator_note && String(aiInput.curator_note).length > 20) {
    update.curator_note = String(aiInput.curator_note).trim()
  }
  if (aiInput.description && String(aiInput.description).length > 100) {
    update.description = String(aiInput.description).trim()
  }

  // Видео: формат + проверка через oEmbed что канал принадлежит вузу
  if (aiInput.video_link && /^https:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/.test(aiInput.video_link)) {
    const verdict = await isOfficialUniversityVideo(aiInput.video_link, school.name)
    if (verdict.ok) {
      update.video_link = aiInput.video_link
      console.log('[fill-school] video accepted from channel:', verdict.author)
    } else {
      console.warn('[fill-school] video REJECTED:', verdict.reason, '— канал:', verdict.author || 'неизвестен')
    }
  } else if (aiInput.video_link) {
    console.warn('[fill-school] video bad format, ignored:', aiInput.video_link)
  }

  // Локация
  if (aiInput.address && String(aiInput.address).trim()) update.address = String(aiInput.address).trim()
  if (aiInput.city && String(aiInput.city).trim()) update.city = String(aiInput.city).trim()
  if (aiInput.province && String(aiInput.province).trim()) update.province = String(aiInput.province).trim()
  if (aiInput.postal_code && String(aiInput.postal_code).trim()) update.postal_code = String(aiInput.postal_code).trim()
  if (typeof aiInput.latitude === 'number' && aiInput.latitude >= -90 && aiInput.latitude <= 90) update.latitude = aiInput.latitude
  if (typeof aiInput.longitude === 'number' && aiInput.longitude >= -180 && aiInput.longitude <= 180) update.longitude = aiInput.longitude

  // Цифры → пишем частично в существующие колонки + остальное в raw_data.curator_extras
  if (typeof aiInput.avg_tuition_year_intl === 'number' && aiInput.avg_tuition_year_intl > 0) {
    update.avg_tuition = aiInput.avg_tuition_year_intl
  }
  if (typeof aiInput.avg_living_cost_year === 'number' && aiInput.avg_living_cost_year > 0) {
    update.cost_of_living = aiInput.avg_living_cost_year
  }
  if (typeof aiInput.avg_application_fee === 'number' && aiInput.avg_application_fee >= 0) {
    update.application_fee_range = { value: aiInput.avg_application_fee }
  }
  if (Array.isArray(aiInput.typical_intakes) && aiInput.typical_intakes.length > 0) {
    update.intakes_summary = aiInput.typical_intakes.join(', ')
  }
  if (Array.isArray(aiInput.top_specialties) && aiInput.top_specialties.length > 0) {
    update.top_disciplines = aiInput.top_specialties.slice(0, 5).map((name: string) => ({ name, count: null }))
  }

  // Доп.поля в raw_data.curator_extras (мерджим с существующими если есть)
  const extras: Record<string, unknown> = {}
  if (aiInput.tuition_currency) extras.tuition_currency = aiInput.tuition_currency
  if (typeof aiInput.student_count_total === 'number' && aiInput.student_count_total > 0) {
    extras.student_count_total = aiInput.student_count_total
  }
  if (typeof aiInput.international_students_share === 'number' && aiInput.international_students_share > 0 && aiInput.international_students_share <= 100) {
    extras.international_students_share = aiInput.international_students_share
  }
  if (typeof aiInput.acceptance_rate === 'number' && aiInput.acceptance_rate > 0 && aiInput.acceptance_rate <= 100) {
    extras.acceptance_rate = aiInput.acceptance_rate
  }
  if (Array.isArray(aiInput.accreditations) && aiInput.accreditations.length > 0) {
    extras.accreditations = aiInput.accreditations
  }
  if (Object.keys(extras).length > 0) {
    extras.filled_at = new Date().toISOString()
    // Получим текущий raw_data чтобы смержить
    const parserAdmin = createParserAdminClient()
    const { data: current } = await parserAdmin
      .from('schools').select('raw_data').eq('id', schoolId).maybeSingle()
    const existingRaw = (current?.raw_data as any) || {}
    const existingExtras = existingRaw.curator_extras || {}
    update.raw_data = { ...existingRaw, curator_extras: { ...existingExtras, ...extras } }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, data: { changes: 0, message: 'ИИ не нашёл новых данных' } })
  }

  const admin = createParserAdminClient()
  let { error: dbErr } = await admin.from('schools').update(update).eq('id', schoolId)
  // Если колонки campus_photo_url нет (миграция не применена) — повторяем без неё.
  if (dbErr && /campus_photo_url/.test(dbErr.message)) {
    console.warn('[fill-school] campus_photo_url column missing, retrying without it')
    const { campus_photo_url, ...rest } = update as Record<string, unknown>
    void campus_photo_url
    const r = await admin.from('schools').update(rest).eq('id', schoolId)
    dbErr = r.error
  }
  if (dbErr) return NextResponse.json({ ok: false, error: `DB: ${dbErr.message}` }, { status: 500 })

  revalidatePath(`/curator/universities/${schoolId}`)
  revalidatePath('/curator/universities')

  return NextResponse.json({
    ok: true,
    data: {
      changes: Object.keys(update).length,
      updated: Object.keys(update),
      sources: aiInput.sources || [],
    },
  })
}
