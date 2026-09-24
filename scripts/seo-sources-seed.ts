// Завести источники и утверждения из реестра и проверить их по живым страницам.
//
//   npx tsx scripts/seo-sources-seed.ts            # показать, ничего не менять
//   npx tsx scripts/seo-sources-seed.ts --apply    # записать
//
// Что делает по порядку: заводит источники (или обновляет уже заведённые),
// заводит утверждения со статусом «непроверено», снимает снимок каждой
// страницы и ищет в её тексте дословное место под каждое утверждение. Активным
// утверждение становится только там, где место нашлось, — это делает
// verifyClaimAgainst, и обойти его здесь нечем.
//
// Почему «непроверено» — начальный статус, а не «активно». Утверждение, которое
// завели активным и не подтвердили, ведёт себя ровно как подтверждённое: fact
// gate его пропускает, генератор берёт число в статью. Разница видна только
// человеку, который полезет в claim_sources. Поэтому активность здесь —
// результат проверки, а не намерение того, кто заводил.
//
// Скрипт идемпотентен: источник узнаётся по URL, утверждение — по паре
// «ключ предмета + формулировка». Повторный прогон ничего не задваивает и
// заново подтверждает то, что подтверждалось (проверка при этом берётся из
// кэша — пара «версия утверждения × версия источника» считается один раз).
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { snapshotSource, findEvidence, verifyClaimAgainst, extractText } from '../lib/seo/provenance'
import { safeFetch } from '../lib/seo/safe-fetch'
import { ИСТОЧНИКИ, ОТКРЫТЫЕ_ВОПРОСЫ, type SourceSpec, type ClaimSpec } from './seo-sources-registry'

const seo = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
).schema('seo')

const APPLY = process.argv.includes('--apply')
const ТОЛЬКО = (() => {
  const i = process.argv.indexOf('--страна')
  return i > 0 ? process.argv[i + 1] : null
})()

/** Сколько живёт факт этого вида. Значение по умолчанию задано политикой. */
async function срокиЖизни(): Promise<Map<string, number>> {
  const { data } = await seo.from('claim_policy').select('kind, default_ttl')
  const out = new Map<string, number>()
  for (const r of (data ?? []) as any[]) {
    // Интервал приходит строкой вида «180 days»; месяцев и лет политика не
    // использует, поэтому разбираем только дни и не изобретаем календарь.
    const дней = Number(String(r.default_ttl ?? '').match(/(\d+)\s*day/)?.[1] ?? 180)
    out.set(r.kind, дней)
  }
  return out
}

/**
 * Прочитать страницу, ничего не записывая.
 *
 * Нужно ровно для режима показа до первой записи: источника в базе ещё нет,
 * значит нет и куда положить снимок, а посмотреть, подтвердится ли
 * утверждение, надо именно сейчас — до того, как что-то заведено.
 */
async function прочитатьНасухо(url: string) {
  const res = await safeFetch(url, process.env.SEO_CRAWL_USER_AGENT || 'goandstudy-seo-bot')
  if (!res.ok) return { id: -1, sourceId: -1, finalUrl: null, httpStatus: res.status ?? null, text: '', contentHash: null, error: res.reason }
  return {
    id: -1, sourceId: -1, finalUrl: res.finalUrl, httpStatus: res.status,
    text: extractText(res.body.toString('utf8')), contentHash: null, error: null,
  }
}

function доменИз(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

/** Завести источник или подтянуть его к тому, что написано в реестре. */
async function завестиИсточник(спец: SourceSpec): Promise<{ id: number; действие: string }> {
  const поля = {
    source_type: 'web',
    url: спец.url,
    domain: доменИз(спец.url),
    kind: спец.kind,
    lang: спец.lang,
    owner: спец.owner,
    subject_key: спец.subjectKey,
    critical: спец.critical,
    recheck_hours: спец.recheckHours ?? null,
    active: true,
    added_by: 'registry',
  }

  const { data: есть } = await seo.from('sources').select('id, critical, recheck_hours, subject_key').eq('url', спец.url).maybeSingle()

  if (есть) {
    const менялось = есть.critical !== спец.critical
      || (есть.recheck_hours ?? null) !== (спец.recheckHours ?? null)
      || есть.subject_key !== спец.subjectKey
    if (APPLY && менялось) await seo.from('sources').update(поля).eq('id', есть.id).throwOnError()
    return { id: есть.id, действие: менялось ? 'обновлён' : 'уже есть' }
  }

  if (!APPLY) return { id: -1, действие: 'будет заведён' }
  const { data, error } = await seo.from('sources').insert(поля).select('id').single()
  if (error) throw new Error(`источник ${спец.url}: ${error.message}`)
  return { id: data.id, действие: 'заведён' }
}

/** Завести утверждение. Найденное по формулировке не переписываем. */
async function завестиУтверждение(
  спец: ClaimSpec,
  subjectKey: string,
  ttl: Map<string, number>,
): Promise<{ id: number; действие: string }> {
  const { data: есть } = await seo.from('claims')
    .select('id, status').eq('subject_key', subjectKey).eq('statement', спец.statement).maybeSingle()
  if (есть) return { id: есть.id, действие: `уже есть (${есть.status})` }
  if (!APPLY) return { id: -1, действие: 'будет заведено' }

  const дней = спец.ttlDays ?? ttl.get(спец.kind) ?? 180
  const { data, error } = await seo.from('claims').insert({
    kind: спец.kind,
    subject: спец.subject,
    subject_key: subjectKey,
    statement: спец.statement,
    value: спец.value ?? null,
    value_num: спец.valueNum ?? null,
    unit: спец.unit ?? null,
    qualifiers: спец.qualifiers ?? {},
    confidence: 'single_source',
    // Ровно один официальный источник — значит «непроверено», пока выдержка не
    // нашлась. Подтверждение проставит verifyClaimAgainst и только оно.
    status: 'unverified',
    expires_at: new Date(Date.now() + дней * 86_400_000).toISOString(),
  }).select('id').single()
  if (error) throw new Error(`утверждение «${спец.statement.slice(0, 40)}»: ${error.message}`)
  return { id: data.id, действие: 'заведено' }
}

async function main() {
  console.log(APPLY ? 'РЕЖИМ ЗАПИСИ\n' : 'режим показа — ничего не меняется, для записи добавь --apply\n')

  const ttl = await срокиЖизни()
  const список = ТОЛЬКО ? ИСТОЧНИКИ.filter((s) => s.subjectKey === ТОЛЬКО) : ИСТОЧНИКИ
  if (!список.length) { console.log(`в реестре нет источников по ключу «${ТОЛЬКО}»`); return }

  let подтверждено = 0, ненайдено = 0, критичныхБезОпоры = 0

  for (const спец of список) {
    const { id: sourceId, действие } = await завестиИсточник(спец)
    console.log(`── ${спец.subjectKey.toUpperCase()} ${доменИз(спец.url)}${спец.critical ? '  [критичный]' : ''}`)
    console.log(`   ${спец.url}`)
    console.log(`   источник: ${действие}${sourceId > 0 ? ` (#${sourceId})` : ''}, перепроверка раз в ${спец.recheckHours ?? (спец.critical ? 6 : 168)} ч`)
    console.log(`   почему так: ${спец.why}`)

    const утверждения: { id: number; спец: ClaimSpec }[] = []
    for (const c of спец.claims) {
      const { id, действие: д } = await завестиУтверждение(c, спец.subjectKey, ttl)
      console.log(`   • [${c.kind}] ${c.statement} — ${д}`)
      утверждения.push({ id, спец: c })
    }

    // Страницу читаем всегда, даже в режиме показа: иначе показывать нечего —
    // весь вопрос в том, найдётся ли выдержка, а найдётся она только в тексте.
    // Разница между режимами в том, записывается ли снимок: пока источника нет
    // в базе, писать наблюдение некуда, поэтому читаем напрямую и ничего не
    // сохраняем.
    let снимок
    try {
      снимок = sourceId > 0 ? await snapshotSource(seo, sourceId, { maxAgeMin: 10 }) : await прочитатьНасухо(спец.url)
    } catch (e: any) {
      console.log(`   ✗ снимок не снялся: ${e?.message ?? e}\n`); continue
    }
    if (снимок.error) {
      console.log(`   ✗ страница не прочиталась: ${снимок.error}`)
      console.log('     строка со снимком записана: недоступность — это наблюдение, а не его отсутствие\n')
      continue
    }
    console.log(снимок.id > 0
      ? `   снимок #${снимок.id}: HTTP ${снимок.httpStatus}, ${снимок.text.length} символов`
      : `   страница прочитана без записи: HTTP ${снимок.httpStatus}, ${снимок.text.length} символов`)

    let опорных = 0
    for (const { id, спец: c } of утверждения) {
      const найдено = findEvidence(снимок.text, {
        value_num: c.valueNum ?? null, value: c.value ?? null, statement: c.statement, unit: c.unit ?? null,
      })
      if (!найдено) {
        ненайдено++
        console.log(`   ✗ не нашлось на странице: ${c.statement.slice(0, 60)}`)
        continue
      }
      подтверждено++; опорных++
      console.log(`   ✓ ${c.statement.slice(0, 60)}`)
      console.log(`      «${найдено.quote.slice(0, 150)}»`)
      if (APPLY && id > 0 && снимок.id > 0) {
        const ev = await verifyClaimAgainst(seo, id, снимок as any)
        if (!ev) console.log('      ⚠ связь не записалась — проверь subject_key источника и утверждения')
      }
    }
    if (спец.critical && !опорных) {
      критичныхБезОпоры++
      console.log('   ⚠ критичный источник без единого подтверждённого утверждения — сторожить ему нечего')
    }
    console.log('')
  }

  console.log(`подтверждено выдержками: ${подтверждено}`)
  console.log(`не нашлось в тексте: ${ненайдено}`)
  if (критичныхБезОпоры) console.log(`критичных источников без утверждений: ${критичныхБезОпоры}`)
  if (!APPLY) console.log('\nчтобы записать: npx tsx scripts/seo-sources-seed.ts --apply')

  console.log('\nОткрытые вопросы — решает человек, не скрипт:')
  for (const в of ОТКРЫТЫЕ_ВОПРОСЫ) console.log(`  — ${в}`)
}

main().catch((e) => { console.error('✗', e?.message ?? e); process.exit(1) })
