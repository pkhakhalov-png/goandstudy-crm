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
    'Сохранить найденную информацию об университете. Поля, которые не удалось найти достоверно — передавай null. ВАЖНО: logo_url должен быть прямой ссылкой на лого с официального сайта или Wikipedia (предпочтительно SVG/PNG с прозрачным фоном). curator_note — короткое резюме (3-5 предложений) на русском, без выдумок.',
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
        description: 'Прямая ссылка на логотип вуза (PNG/SVG/JPG). Предпочтительно с официального сайта или Wikimedia Commons.',
      },
      website: {
        type: ['string', 'null'],
        description: 'Официальный сайт вуза (https://...).',
      },
      curator_note: {
        type: ['string', 'null'],
        description: 'Краткое описание вуза для куратора (3-5 предложений на русском). Сильные стороны, известные факты, особенности. Без выдумок — только проверенное из официальных источников.',
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
    .select('id, name, country_code, city, province, address, postal_code, latitude, longitude, website, qs_rank, university_type, founded_in, logo_url, curator_note')
    .eq('id', schoolId)
    .maybeSingle()
  if (!school) return NextResponse.json({ ok: false, error: 'School not found' }, { status: 404 })

  const userMessage = `Найди актуальную информацию об университете и вызови tool save_school_info ровно один раз.

Университет: ${school.name}
Страна: ${(school.country_code || '').toUpperCase()}${school.province ? `, ${school.province}` : ''}${school.city ? `, ${school.city}` : ''}
Текущий сайт в БД: ${school.website || 'не указан'}

Текущие данные:
- QS Rank: ${school.qs_rank || 'нет'}
- Тип: ${school.university_type || 'нет'}
- Основан: ${school.founded_in || 'нет'}
- Лого: ${school.logo_url ? 'есть' : 'нет'}
- Описание: ${school.curator_note ? 'есть' : 'нет'}
- Адрес: ${school.address || 'нет'}
- Координаты: ${school.latitude && school.longitude ? `${school.latitude}, ${school.longitude}` : 'нет'}

Через web_search найди:
1. **QS World University Rank** — текущий (последний доступный год). Если unranked — null.
2. **Тип финансирования**: Государственный или Частный (на русском, точно из этих двух).
3. **Год основания** (4 цифры).
4. **Логотип** — прямая ссылка на PNG/SVG/JPG. Лучше всего с официального сайта (favicon недостаточно — нужен реальный лого). Wikimedia Commons тоже подходит.
5. **Официальный сайт** (https://).
6. **curator_note** — краткое резюме на русском (3-5 предложений): какой это вуз, чем известен, сильные направления, выпускники-знаменитости, рейтинг. Стиль как у консультанта, без воды. Пример: «Один из топ-3 университетов мира. Известен факультетом юриспруденции. Acceptance rate 3%. Выпускники: Обама, Цукерберг, Гейтс. Финансовая помощь покрывает до 100% обучения для семей с доходом ниже $85k.»
7. **Локация главного кампуса**:
   - Точный почтовый адрес (улица, дом)
   - Город / Регион (штат, провинция, земля и т.п.)
   - Почтовый индекс
   - **Координаты** (latitude / longitude в decimal, найди в Wikipedia/Google Maps — они нужны для отображения на карте). Пример: latitude 42.3770, longitude -71.1167 для Harvard.

Если не уверен — null. Лучше пустое поле чем выдумка. Координаты только если найдёшь точные на Wikipedia или Google Maps.`

  let aiInput: any
  try {
    const anthropic = getAnthropic()
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
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

  // Сохраняем — переписываем поля только если ИИ что-то нашёл (не затираем пустыми)
  const update: Record<string, unknown> = {}
  if (typeof aiInput.qs_rank === 'number' && aiInput.qs_rank > 0) update.qs_rank = aiInput.qs_rank
  if (aiInput.university_type === 'Государственный' || aiInput.university_type === 'Частный') {
    update.university_type = aiInput.university_type
  }
  if (typeof aiInput.founded_in === 'number' && aiInput.founded_in > 1000 && aiInput.founded_in <= new Date().getFullYear()) {
    update.founded_in = aiInput.founded_in
  }
  if (aiInput.logo_url && /^https?:\/\//.test(aiInput.logo_url)) update.logo_url = aiInput.logo_url
  if (aiInput.website && /^https?:\/\//.test(aiInput.website)) update.website = aiInput.website
  if (aiInput.curator_note && String(aiInput.curator_note).length > 30) update.curator_note = aiInput.curator_note
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
