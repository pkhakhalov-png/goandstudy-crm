import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createParserClient } from '@/lib/supabase/parser'
import { getAnthropic } from '@/lib/ai'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Vercel Pro допускает до 300 сек. Web-поиск + Sonnet легко выходит за 60 сек.
export const maxDuration = 300

const SAVE_TOOL = {
  name: 'save_program_info',
  description:
    'Сохранить собранную информацию о программе. Вызови этот tool ровно один раз, когда собрал все доступные данные. Поля, которые не удалось найти в официальных источниках, передавай как null — НЕ ВЫДУМЫВАЙ значения.',
  input_schema: {
    type: 'object',
    properties: {
      program_length_text: {
        type: ['string', 'null'],
        description: 'Длительность программы человекочитаемо, напр. "1 year master\'s degree"',
      },
      earliest_intake_label: {
        type: ['string', 'null'],
        description: 'Ближайшая дата старта, напр. "September 2026" или "Fall 2026"',
      },
      deadline_label: {
        type: ['string', 'null'],
        description: 'Дедлайн подачи заявок, напр. "July 1, 2026" или "Rolling admissions"',
      },
      gross_tuition_label: {
        type: ['string', 'null'],
        description: 'Стоимость обучения с валютой, напр. "£19,950.00 GBP / First Year"',
      },
      cost_of_living_label: {
        type: ['string', 'null'],
        description: 'Стоимость жизни в год с валютой',
      },
      application_fee_label: {
        type: ['string', 'null'],
        description: 'Взнос за подачу, напр. "Free" или "£90 GBP"',
      },
      other_fees: {
        type: ['array', 'null'],
        description: 'Прочие обязательные сборы',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            amount: { type: ['string', 'number', 'null'] },
            currency: { type: ['string', 'null'] },
            note: { type: ['string', 'null'] },
          },
          required: ['label'],
        },
      },
      min_education_level: {
        type: ['string', 'null'],
        description: 'Напр. "4-Year Bachelor\'s Degree"',
      },
      min_gpa_percent: {
        type: ['number', 'null'],
        description: 'Минимальный GPA в процентах (0–100)',
      },
      ielts_min: { type: ['number', 'null'] },
      toefl_min: { type: ['number', 'null'] },
      pte_min: { type: ['number', 'null'] },
      duolingo_min: { type: ['number', 'null'] },
      pgwp_eligible: {
        type: ['boolean', 'null'],
        description: 'Для Канады/UK — попадает ли программа под Post-Study Work Visa',
      },
      pgwp_text: {
        type: ['string', 'null'],
        description: 'Описание условий PGWP (2-5 предложений)',
      },
      source_urls: {
        type: ['array', 'null'],
        description: 'Список URL-источников, откуда взята инфа',
        items: { type: 'string' },
      },
    },
    required: [],
  },
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!['curator', 'admin', 'rop'].includes(profile?.role || '')) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const admin = await createAdminClient()
  const { data: curatorRec } = await admin.from('curators').select('id').eq('user_id', user.id).maybeSingle()
  const curatorId = curatorRec?.id

  let body: { programId?: number | string } = {}
  try { body = await req.json() } catch {}
  const programId = Number(body.programId)
  if (!programId) return NextResponse.json({ ok: false, error: 'Missing programId' }, { status: 400 })

  const parser = createParserClient()
  const { data: program, error: progErr } = await parser
    .from('programs')
    .select('id, name, raw_data, school:schools(id, name, city, province, country_code)')
    .eq('id', programId)
    .maybeSingle()

  if (progErr || !program) {
    return NextResponse.json({ ok: false, error: 'Program not found' }, { status: 404 })
  }

  const school = program.school as any
  const attr = program.raw_data?.attributes || {}
  const levelText = attr.level_text || ''

  const userMessage = `Найди актуальную информацию об этой программе обучения.

Программа: ${program.name}${levelText ? ` (${levelText})` : ''}
Вуз: ${school?.name || 'unknown'}
Страна: ${String(school?.country_code || '').toUpperCase()}${school?.province ? `, ${school.province}` : ''}${school?.city ? `, ${school.city}` : ''}

Через web_search найди на официальном сайте вуза (или в надёжных источниках вроде ApplyBoard, вузовских порталов) следующие данные и один раз вызови tool save_program_info:
- Длительность программы (напр. "1 year master's degree")
- Earliest intake — ближайшая дата старта (напр. "September 2026")
- Deadline — дедлайн подачи заявок (напр. "July 1, 2026" или "Rolling")
- Gross Tuition — стоимость обучения с валютой
- Cost of Living — стоимость жизни в год
- Application Fee (может быть "Free")
- Other Fees — любые дополнительные сборы (CAS Deposit, Security Deposit и т.д.)
- Minimum Level of Education Completed
- Minimum GPA (в процентах)
- Минимальные баллы по IELTS / TOEFL / PTE / Duolingo
- Post-Study Work Visa — применимость и краткое описание (для Канады/UK)

Критически важно: если поля нет в открытом доступе или ты не уверен — передавай null. Лучше пустое поле, чем выдуманное число.

В source_urls положи 2-5 конкретных URL страниц, где нашёл инфу.`

  try {
    const anthropic = getAnthropic()
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [
        // max_uses=3 даёт достаточно инфы, но экономит ~15-30 сек относительно 5
        { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
        SAVE_TOOL,
      ] as any,
      messages: [{ role: 'user', content: userMessage }],
    })

    const saveBlock = response.content.find(
      (b: any) => b.type === 'tool_use' && b.name === 'save_program_info'
    ) as any

    if (!saveBlock) {
      return NextResponse.json({
        ok: false,
        error: 'ИИ не вернул структурированные данные. Попробуй ещё раз.',
        stopReason: response.stop_reason,
      }, { status: 502 })
    }

    const input = saveBlock.input || {}

    const payload = {
      program_id: programId,
      program_length_text: input.program_length_text ?? null,
      earliest_intake_label: input.earliest_intake_label ?? null,
      deadline_label: input.deadline_label ?? null,
      gross_tuition_label: input.gross_tuition_label ?? null,
      cost_of_living_label: input.cost_of_living_label ?? null,
      application_fee_label: input.application_fee_label ?? null,
      other_fees: input.other_fees ?? null,
      min_education_level: input.min_education_level ?? null,
      min_gpa_percent: typeof input.min_gpa_percent === 'number' ? input.min_gpa_percent : null,
      ielts_min: typeof input.ielts_min === 'number' ? input.ielts_min : null,
      toefl_min: typeof input.toefl_min === 'number' ? input.toefl_min : null,
      pte_min: typeof input.pte_min === 'number' ? input.pte_min : null,
      duolingo_min: typeof input.duolingo_min === 'number' ? input.duolingo_min : null,
      pgwp_eligible: typeof input.pgwp_eligible === 'boolean' ? input.pgwp_eligible : null,
      pgwp_text: input.pgwp_text ?? null,
      source_urls: Array.isArray(input.source_urls) ? input.source_urls : null,
      is_ai_generated: true,
      last_updated_by: curatorId || null,
      last_updated_at: new Date().toISOString(),
    }

    const { error: upsertErr } = await admin
      .from('program_curator_data')
      .upsert(payload, { onConflict: 'program_id' })

    if (upsertErr) {
      console.error('[fill-program] upsert error:', upsertErr)
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 })
    }

    await admin.from('program_curator_data_history').insert({
      program_id: programId,
      snapshot: payload,
      updated_by: curatorId || null,
    })

    revalidatePath(`/curator/programs/${programId}`)

    return NextResponse.json({ ok: true, data: payload })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error('[fill-program] exception:', e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
