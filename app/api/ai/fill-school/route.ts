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
        description: 'YouTube embed URL официального видео-тура или промо вуза. Формат: https://www.youtube.com/embed/VIDEO_ID. Если не уверен или нет — null.',
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

Если не уверен — null. Лучше пустое поле чем выдумка.`

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

  if (aiInput.website && /^https?:\/\//.test(aiInput.website)) update.website = aiInput.website
  if (aiInput.curator_note && String(aiInput.curator_note).length > 20) {
    update.curator_note = String(aiInput.curator_note).trim()
  }
  if (aiInput.description && String(aiInput.description).length > 100) {
    update.description = String(aiInput.description).trim()
  }

  // YouTube embed: должен начинаться с https://www.youtube.com/embed/ — иначе игнорируем
  if (aiInput.video_link && /^https:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/.test(aiInput.video_link)) {
    update.video_link = aiInput.video_link
  }

  // Локация
  if (aiInput.address && String(aiInput.address).trim()) update.address = String(aiInput.address).trim()
  if (aiInput.city && String(aiInput.city).trim()) update.city = String(aiInput.city).trim()
  if (aiInput.province && String(aiInput.province).trim()) update.province = String(aiInput.province).trim()
  if (aiInput.postal_code && String(aiInput.postal_code).trim()) update.postal_code = String(aiInput.postal_code).trim()
  if (typeof aiInput.latitude === 'number' && aiInput.latitude >= -90 && aiInput.latitude <= 90) update.latitude = aiInput.latitude
  if (typeof aiInput.longitude === 'number' && aiInput.longitude >= -180 && aiInput.longitude <= 180) update.longitude = aiInput.longitude

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, data: { changes: 0, message: 'ИИ не нашёл новых данных' } })
  }

  const admin = createParserAdminClient()
  const { error: dbErr } = await admin.from('schools').update(update).eq('id', schoolId)
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
