import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createScholarshipsClient, createScholarshipsAdminClient } from '@/lib/supabase/scholarships'
import { getAnthropic } from '@/lib/ai'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const SAVE_TOOL = {
  name: 'save_idp_scholarship_info',
  description:
    'Сохранить найденную полезную информацию об университетской IDP-стипендии. Поля, в которых не уверен — null. ВАЖНО: description и eligibility должны быть на русском, без воды, только полезное для куратора, который пишет студенту краткую сводку.',
  input_schema: {
    type: 'object',
    properties: {
      description: {
        type: ['string', 'null'],
        description: 'Сводка стипендии 6-12 предложений на русском в Markdown с подсекциями: ## Для кого, ## Что покрывает, ## Как подать, ## Сроки. Без выдумок — только с idp.com или официального сайта вуза.',
      },
      eligibility: {
        type: ['string', 'null'],
        description: 'Условия отбора: GPA, язык, гражданство, академический бэкграунд, специальные требования (волонтёрство, эссе, рекомендации). Markdown-список 4-8 пунктов.',
      },
      gpa_requirement: {
        type: ['string', 'null'],
        description: 'Текстовое требование к GPA если найдено (напр. "3.5+/4.0", "First-class honours").',
      },
      language_requirement: {
        type: ['string', 'null'],
        description: 'Требование к английскому если есть: IELTS 6.5 / TOEFL 90 и т.п.',
      },
      renewable: {
        type: ['boolean', 'null'],
        description: 'Продлевается ли стипендия на следующий год. true / false / null если не нашёл.',
      },
      application_process: {
        type: ['string', 'null'],
        description: 'Короткое описание процесса подачи (1-3 предложения). Кто подаёт автоматически (после поступления), кто отдельной заявкой, нужно ли эссе/рекомендации.',
      },
      official_url: {
        type: ['string', 'null'],
        description: 'Прямая ссылка на страницу стипендии на ОФИЦИАЛЬНОМ сайте вуза (НЕ idp.com и НЕ агрегаторы). Если на сайте вуза стипендии нет — null.',
      },
      sources: {
        type: ['array', 'null'],
        description: 'URL-источники откуда взято (для логов).',
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
    console.error('[fill-idp-scholarship] uncaught:', e)
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
  if (!process.env.SCHOLARSHIPS_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: 'SCHOLARSHIPS_SERVICE_ROLE_KEY не настроен' }, { status: 500 })
  }

  let body: { id?: number | string } = {}
  try { body = await req.json() } catch {}
  const id = Number(body.id)
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })

  const sb = createScholarshipsClient()
  const { data: row } = await sb
    .from('idp_scholarships')
    .select('id, idp_url, name, university_name, country_code, level, funding_type, value_amount, value_currency, value_text, application_deadline, description, eligibility, school:schools(id, name, website)')
    .eq('id', id)
    .maybeSingle()
  if (!row) return NextResponse.json({ ok: false, error: 'IDP-стипендия не найдена' }, { status: 404 })

  const school = Array.isArray((row as any).school) ? (row as any).school[0] : (row as any).school
  const schoolName = school?.name || row.university_name || 'unknown'
  const schoolWebsite = school?.website || 'unknown'
  const valueText = row.value_amount
    ? `${Number(row.value_amount).toLocaleString('ru')} ${row.value_currency || ''}`.trim()
    : row.value_text || 'unknown'

  const userMessage = `Найди полезную информацию об университетской стипендии и вызови tool save_idp_scholarship_info ровно один раз.

Стипендия: ${row.name}
Вуз: ${schoolName}
Страна: ${(row.country_code || '').toUpperCase()}
Уровень: ${row.level || 'unknown'}
Тип финансирования: ${row.funding_type || 'unknown'}
Сумма: ${valueText}
Дедлайн: ${row.application_deadline || 'unknown'}
Сайт вуза: ${schoolWebsite}
IDP page: ${row.idp_url}

Цель: куратор хочет краткую полезную сводку для студента. Через web_search сходи на:
1. Страницу IDP: ${row.idp_url}
2. Сайт вуза (${schoolWebsite}) — найди страницу этой стипендии
3. Поищи в Google: "${row.name} ${schoolName}"

Заполни:
- **description** (Markdown с подсекциями ## Для кого, ## Что покрывает, ## Как подать, ## Сроки) — 6-12 предложений на русском. Без воды, только полезное.
- **eligibility** — Markdown-список 4-8 пунктов (GPA, язык, гражданство, бэкграунд, спец. требования).
- **gpa_requirement** — если найдешь конкретное требование GPA.
- **language_requirement** — IELTS/TOEFL.
- **renewable** — true/false если ясно из источника, иначе null.
- **application_process** — 1-3 предложения о процессе подачи.
- **official_url** — прямая ссылка на странице вуза (НЕ idp.com).

Если на сайте вуза стипендии нет (только через IDP) — заполни max что можно из IDP, но не выдумывай.`

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
      (b: any) => b.type === 'tool_use' && b.name === 'save_idp_scholarship_info'
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

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (aiInput.description && String(aiInput.description).length > 100) {
    update.description = String(aiInput.description).trim()
  }
  if (aiInput.eligibility && String(aiInput.eligibility).length > 30) {
    update.eligibility = String(aiInput.eligibility).trim()
  }

  // Доп. поля складываем в raw_data.curator_extras чтобы не плодить колонки
  const extras: Record<string, unknown> = {}
  if (aiInput.gpa_requirement) extras.gpa_requirement = String(aiInput.gpa_requirement).trim()
  if (aiInput.language_requirement) extras.language_requirement = String(aiInput.language_requirement).trim()
  if (typeof aiInput.renewable === 'boolean') extras.renewable = aiInput.renewable
  if (aiInput.application_process) extras.application_process = String(aiInput.application_process).trim()
  if (aiInput.official_url && /^https?:\/\//.test(aiInput.official_url) && !aiInput.official_url.includes('idp.com')) {
    extras.official_url = aiInput.official_url
  }
  if (aiInput.sources?.length) extras.sources = aiInput.sources
  extras.filled_at = new Date().toISOString()

  if (Object.keys(extras).length > 0) {
    // raw_data — мерджим
    const admin = createScholarshipsAdminClient()
    const { data: current } = await admin
      .from('idp_scholarships')
      .select('raw_data')
      .eq('id', id)
      .maybeSingle()
    const existingRaw = (current?.raw_data as any) || {}
    update.raw_data = { ...existingRaw, curator_extras: extras }
  }

  if (Object.keys(update).length <= 1) {
    return NextResponse.json({ ok: true, data: { changes: 0, message: 'ИИ не нашёл новых данных' } })
  }

  const admin = createScholarshipsAdminClient()
  const { error: dbErr } = await admin.from('idp_scholarships').update(update).eq('id', id)
  if (dbErr) return NextResponse.json({ ok: false, error: `DB: ${dbErr.message}` }, { status: 500 })

  revalidatePath(`/curator/scholarships/idp/${id}`)
  revalidatePath('/curator/scholarships')

  return NextResponse.json({
    ok: true,
    data: {
      changes: Object.keys(update).length - 1,
      updated: Object.keys(update).filter(k => k !== 'updated_at'),
      extras: Object.keys(extras),
      sources: aiInput.sources || [],
    },
  })
}
