import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createScholarshipsClient, createScholarshipsAdminClient } from '@/lib/supabase/scholarships'
import { getAnthropic } from '@/lib/ai'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const SAVE_TOOL = {
  name: 'save_scholarship_verification',
  description:
    'Сохранить результат проверки стипендии: актуальный дедлайн и официальные URL. Передавай null если не уверен — лучше пусто чем выдумано. ВАЖНО: official_url НЕ должен указывать на агрегаторы вроде unipage.net, scholars4dev, scholarshipportal — только официальный сайт стипендии или государственного органа.',
  input_schema: {
    type: 'object',
    properties: {
      application_deadline: {
        type: ['string', 'null'],
        description: 'Дедлайн подачи в формате YYYY-MM-DD. Если в источнике "rolling" / "год назад" / нет точной даты — null.',
      },
      deadline_note: {
        type: ['string', 'null'],
        description: 'Текстовое описание если дедлайн необычный, напр. "varies by country" / "rolling" / "August - November".',
      },
      official_url: {
        type: ['string', 'null'],
        description: 'Официальный сайт стипендии (НЕ агрегатор). Например chevening.org, fulbright.org, daad.de, campusfrance.org.',
      },
      application_url: {
        type: ['string', 'null'],
        description: 'Прямая ссылка на форму заявки или страницу с инструкцией как подать.',
      },
      info_url: {
        type: ['string', 'null'],
        description: 'Доп. страница с информацией (eligibility, FAQ).',
      },
      sources: {
        type: ['array', 'null'],
        description: 'Список URL-источников где нашли инфу (для логов).',
        items: { type: 'string' },
      },
      changes_summary: {
        type: ['string', 'null'],
        description: 'Короткая сводка что изменилось vs текущих данных в БД (1-2 предложения).',
      },
    },
    required: [],
  },
}

const AGGREGATOR_HOSTS = [
  'unipage.net', 'scholars4dev.com', 'scholarshipportal.com', 'scholarship-positions.com',
  'scholarshipdb.net', 'mastersportal.com', 'bachelorsportal.com', 'phdportal.com',
  'studyportals.com', 'admissions24.com',
]

function isAggregator(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const h = new URL(url).hostname.replace(/^www\./, '')
    return AGGREGATOR_HOSTS.some(a => h === a || h.endsWith('.' + a))
  } catch { return false }
}

export async function POST(req: NextRequest) {
  try {
    return await handleVerify(req)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error('[verify-scholarship] uncaught:', e)
    return NextResponse.json({ ok: false, error: `Server: ${msg}` }, { status: 500 })
  }
}

async function handleVerify(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['curator', 'admin', 'rop'].includes(profile?.role || '')) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  // Проверка ключевых env в самом начале — сразу понятная ошибка
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY не настроен в Vercel env' }, { status: 500 })
  }
  if (!process.env.SCHOLARSHIPS_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: 'SCHOLARSHIPS_SERVICE_ROLE_KEY не настроен в Vercel env (после добавления нужен Redeploy)' }, { status: 500 })
  }

  let body: { kind?: 'private' | 'government'; id?: number | string } = {}
  try { body = await req.json() } catch {}
  const kind = body.kind
  const id = Number(body.id)
  if (!id || (kind !== 'private' && kind !== 'government')) {
    return NextResponse.json({ ok: false, error: 'Missing kind/id' }, { status: 400 })
  }

  const sb = createScholarshipsClient()

  let row: any = null
  let userMessage = ''
  if (kind === 'government') {
    const { data, error } = await sb
      .from('government_scholarships')
      .select('id, name, short_name, country_name, country_code, provider, official_url, application_url, info_url, application_deadline, levels')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return NextResponse.json({ ok: false, error: 'Стипендия не найдена' }, { status: 404 })
    row = data
    userMessage = `Перепроверь актуальную информацию о государственной стипендии и вызови tool save_scholarship_verification ровно один раз.

Стипендия: ${row.name}${row.short_name ? ` (${row.short_name})` : ''}
Страна: ${row.country_name || row.country_code || 'unknown'}
Провайдер: ${row.provider || 'unknown'}
Уровни: ${(row.levels || []).join(', ') || 'unknown'}

Текущие данные в БД:
- application_deadline: ${row.application_deadline || 'null'}
- official_url: ${row.official_url || 'null'}
- application_url: ${row.application_url || 'null'}
- info_url: ${row.info_url || 'null'}

Через web_search найди:
1. **Актуальный дедлайн подачи на ближайший раунд** (формат YYYY-MM-DD). Если разные страны имеют разные дедлайны (как Fulbright/DAAD) — берём для России/СНГ или общий, и пиши пояснение в deadline_note.
2. **Официальный сайт стипендии** — НЕ агрегаторы типа unipage.net, scholars4dev, scholarshipportal. Только сайт самой программы (chevening.org, fulbright.org и т.п.) или государственного органа.
3. **Прямую ссылку на форму заявки** (apply page).

Если application_url или official_url в текущих данных ведёт на агрегатор — обязательно замени.`
  } else {
    const { data, error } = await sb
      .from('scholarships_topuni')
      .select('scholarship_id, title, institution_title, application_url, detail_url, deadline, study_levels')
      .eq('scholarship_id', id)
      .maybeSingle()
    if (error || !data) return NextResponse.json({ ok: false, error: 'Стипендия не найдена' }, { status: 404 })
    row = data
    userMessage = `Перепроверь актуальную информацию о частной стипендии и вызови tool save_scholarship_verification ровно один раз.

Стипендия: ${row.title}
Вуз/Институт: ${row.institution_title || 'unknown'}
Уровни: ${(row.study_levels || []).join(', ') || 'unknown'}

Текущие данные:
- deadline: ${row.deadline || 'null'}
- application_url: ${row.application_url || 'null'}

Через web_search найди:
1. **Актуальный дедлайн подачи** (формат YYYY-MM-DD).
2. **Официальный сайт стипендии на сайте вуза** (НЕ агрегаторы вроде topuniversities.com/scholarships, unipage.net).
3. **Прямую ссылку на форму заявки**.

Если ссылка на topuniversities.com — оставь только если на сайте вуза стипендии действительно нет, иначе замени на университетскую.`
  }

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
      (b: any) => b.type === 'tool_use' && b.name === 'save_scholarship_verification'
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

  // Защита: если ИИ вернул агрегатор — игнорируем
  const cleanOfficial = isAggregator(aiInput.official_url) ? null : aiInput.official_url
  const cleanApply = isAggregator(aiInput.application_url) ? null : aiInput.application_url
  const cleanInfo = isAggregator(aiInput.info_url) ? null : aiInput.info_url

  const admin = createScholarshipsAdminClient()
  const now = new Date().toISOString()

  if (kind === 'government') {
    const update: Record<string, unknown> = { last_verified_at: now, updated_at: now }
    if (aiInput.application_deadline) update.application_deadline = aiInput.application_deadline
    if (cleanOfficial) update.official_url = cleanOfficial
    if (cleanApply) update.application_url = cleanApply
    if (cleanInfo) update.info_url = cleanInfo
    if (aiInput.deadline_note) update.application_period = aiInput.deadline_note

    const { error } = await admin.from('government_scholarships').update(update).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: `DB: ${error.message}` }, { status: 500 })
  } else {
    const update: Record<string, unknown> = { updated_at: now, last_seen_at: now }
    if (aiInput.application_deadline) update.deadline = aiInput.application_deadline
    if (cleanApply) update.application_url = cleanApply
    const { error } = await admin.from('scholarships_topuni').update(update).eq('scholarship_id', id)
    if (error) return NextResponse.json({ ok: false, error: `DB: ${error.message}` }, { status: 500 })
  }

  revalidatePath('/curator/scholarships')

  return NextResponse.json({
    ok: true,
    data: {
      application_deadline: aiInput.application_deadline || null,
      official_url: cleanOfficial || null,
      application_url: cleanApply || null,
      info_url: cleanInfo || null,
      deadline_note: aiInput.deadline_note || null,
      changes_summary: aiInput.changes_summary || null,
      sources: aiInput.sources || [],
      filtered_aggregators: {
        official_url: !!aiInput.official_url && !cleanOfficial,
        application_url: !!aiInput.application_url && !cleanApply,
        info_url: !!aiInput.info_url && !cleanInfo,
      },
    },
  })
}
