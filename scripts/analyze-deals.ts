/**
 * Прогон разбора по живым сделкам — то, на чём схему видно глазами.
 *
 *   npx tsx scripts/analyze-deals.ts                 # 5 свежих сделок, разбор в консоль, в базу НЕ пишем
 *   npx tsx scripts/analyze-deals.ts --сколько 10    # больше
 *   npx tsx scripts/analyze-deals.ts --сохранить     # записать разборы в deal_analyses
 *   npx tsx scripts/analyze-deals.ts --сделка <uuid> # одну конкретную
 *   npx tsx scripts/analyze-deals.ts --модель claude-sonnet-5
 *   npx tsx scripts/analyze-deals.ts --сколько 10 --отчёт разборы.html   # собрать страницу для чтения
 *
 * По умолчанию ничего не сохраняет: сначала смотрим, согласны ли мы с
 * разбором, и только потом заводим его в базу.
 */
import { config } from 'dotenv'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

config({ path: path.resolve(process.cwd(), '.env.local') })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

function арг(имя: string): string | undefined {
  const i = process.argv.indexOf(имя)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const { collectConversation } = await import('../lib/sales/conversation-source')
  const { analyzeConversation, МОДЕЛЬ_ПО_УМОЛЧАНИЮ } = await import('../lib/sales/analyze-conversation')

  const сохранять = process.argv.includes('--сохранить')
  const модель = арг('--модель') ?? МОДЕЛЬ_ПО_УМОЛЧАНИЮ
  const сколько = Number(арг('--сколько') ?? 5)
  const одна = арг('--сделка')

  // Какие сделки берём: свежие и с живой перепиской. Старый долг сознательно
  // не трогаем — решение владельца от 24.09.2026: работаем с новыми заявками.
  let сделки: { id: string; contact_name: string; created_at: string }[] = []

  if (одна) {
    const { data } = await sb.from('deals').select('id, contact_name, created_at').eq('id', одна).maybeSingle()
    if (!data) { console.error('сделка не найдена'); process.exit(1) }
    сделки = [data]
  } else {
    const с30 = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data } = await sb
      .from('deals')
      .select('id, contact_name, created_at')
      .is('deleted_at', null)
      .gte('created_at', с30)
      .order('created_at', { ascending: false })
      .limit(200)
    сделки = data ?? []
  }

  console.log(`модель: ${модель} · сохранение: ${сохранять ? 'да' : 'НЕТ (сухой прогон)'}\n`)

  const отчёт = арг('--отчёт')
  const карточки: string[] = []

  let разобрано = 0
  let итогоЦена = 0

  for (const d of сделки) {
    if (разобрано >= сколько) break

    const материал = await collectConversation(sb as any, d.id)
    if (материал.empty) continue

    process.stdout.write(`\n${'═'.repeat(78)}\n`)
    console.log(`${d.contact_name ?? '—'}  ·  заявка от ${d.created_at.slice(0, 10)}  ·  реплик: ${материал.messagesCount}`)
    console.log(`${'─'.repeat(78)}`)

    const res = await analyzeConversation(материал, { model: модель })
    if (!res.ok) { console.log(`  ✕ ${res.why}`); continue }

    разобрано++
    итогоЦена += res.costUsd
    печать(res.payload)
    if (отчёт) карточки.push(вHtml(d, материал, res))
    console.log(`\n  ── ${res.tokensIn} → ${res.tokensOut} токенов · $${res.costUsd.toFixed(4)} · ${(res.ms / 1000).toFixed(1)} с`)

    if (сохранять) {
      const p: any = res.payload
      const { error } = await sb.from('deal_analyses').insert({
        deal_id: d.id,
        source: 'chat',
        covered_to: материал.coveredTo,
        items_count: материал.messagesCount,
        client_type: p['тип_клиента'] ?? null,
        next_step: p['следующий_шаг']?.['есть'] ?? null,
        summary: p['резюме'] ?? null,
        payload: res.payload,
        model: res.model,
        cost_usd: res.costUsd,
        ms: res.ms,
      })
      console.log(error ? `  ✕ не сохранилось: ${error.message}` : '  ✓ сохранено')
    }
  }

  if (отчёт && карточки.length) {
    fs.writeFileSync(отчёт, страница(карточки, разобрано, итогоЦена), 'utf8')
    console.log(`\nотчёт: ${path.resolve(отчёт)}`)
  }

  console.log(`\n${'═'.repeat(78)}`)
  console.log(`разобрано сделок: ${разобрано} · всего $${итогоЦена.toFixed(4)} ≈ ${Math.round(итогоЦена * 90)} ₽`)
  if (разобрано > 0) {
    console.log(`в среднем на сделку: $${(итогоЦена / разобрано).toFixed(4)} ≈ ${(итогоЦена / разобрано * 90).toFixed(1)} ₽`)
  }
}

function печать(p: any) {
  const шаг = p['следующий_шаг'] ?? {}
  console.log(`\n  ${p['резюме']}\n`)
  console.log(`  Тип: ${p['тип_клиента']} — ${p['почему_такой_тип']}`)
  console.log(`  Этап по разговору: ${p['рекомендуемый_этап']}`)

  const з = p['запрос'] ?? {}
  console.log(`\n  Запрос: ${з['страна']} · ${з['уровень']} · ${з['сроки']} · бюджет: ${з['бюджет']} · для кого: ${з['для_кого']}`)

  const возр = p['возражения'] ?? []
  if (возр.length) {
    console.log('\n  Возражения:')
    for (const в of возр) {
      console.log(`    · ${в['что']} — ${в['отработано'] ? 'отработано' : 'НЕ отработано'}`)
      console.log(`      клиент: «${обрезать(в['цитата'])}»`)
      if (в['как']) console.log(`      ответ:  ${обрезать(в['как'])}`)
    }
  }

  console.log(`\n  Следующий шаг: ${шаг['есть'] ? '✓ ' + шаг['что'] + ' · ' + шаг['когда'] : '✕ НЕ ЗАФИКСИРОВАН'}`)
  if (шаг['цитата']) console.log(`      «${обрезать(шаг['цитата'])}»`)

  const нет = p['не_выяснено'] ?? []
  if (нет.length) {
    console.log('\n  Менеджер не спросил:')
    for (const н of нет) console.log(`    · ${н}`)
  }

  const риски = p['риски'] ?? []
  if (риски.length) {
    console.log('\n  ⚠ Риски:')
    for (const р of риски) console.log(`    · ${р['что']} — «${обрезать(р['цитата'])}»`)
  }
}

function обрезать(s: unknown, n = 120): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

main().catch(e => { console.error(e?.message ?? e); process.exit(1) })

// ── Страница для чтения глазами ────────────────────────────────────────────
//
// Отчёт собирается локальным файлом и никуда не уходит: в нём дословные
// реплики живых людей с именами и телефонами. Место таким данным — внутри
// периметра, а не на стороннем сервисе ради удобства просмотра.

function экр(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

function вHtml(d: any, м: any, res: any): string {
  const p: any = res.payload
  const шаг = p['следующий_шаг'] ?? {}
  const з = p['запрос'] ?? {}
  const возр = p['возражения'] ?? []
  const риски = p['риски'] ?? []
  const нет = p['не_выяснено'] ?? []
  const цвет: Record<string, string> = { 'горячий': '#d9480f', 'тёплый': '#c97d00', 'холодный': '#4c6ef5', 'нецелевой': '#868e96' }

  return `<article>
  <header>
    <h2>${экр(d.contact_name)}</h2>
    <div class="meta">заявка от ${экр(d.created_at.slice(0, 10))} · реплик: ${м.messagesCount} · ${экр(res.model)} · $${res.costUsd.toFixed(4)}</div>
  </header>
  <p class="summary">${экр(p['резюме'])}</p>
  <div class="row">
    <span class="tag" style="background:${цвет[p['тип_клиента']] ?? '#868e96'}">${экр(p['тип_клиента'])}</span>
    <span class="dim">${экр(p['почему_такой_тип'])}</span>
  </div>
  <div class="row"><b>Этап по разговору:</b> ${экр(p['рекомендуемый_этап'])}</div>
  <table class="req">
    <tr><td>страна</td><td>${экр(з['страна'])}</td></tr>
    <tr><td>уровень</td><td>${экр(з['уровень'])}</td></tr>
    <tr><td>сроки</td><td>${экр(з['сроки'])}</td></tr>
    <tr><td>бюджет</td><td>${экр(з['бюджет'])}</td></tr>
    <tr><td>для кого</td><td>${экр(з['для_кого'])}</td></tr>
  </table>
  <div class="step ${шаг['есть'] ? 'ok' : 'bad'}">
    ${шаг['есть'] ? '✓ Следующий шаг: ' + экр(шаг['что']) + ' · ' + экр(шаг['когда']) : '✕ Следующий шаг не зафиксирован'}
    ${шаг['цитата'] ? '<div class="quote">«' + экр(шаг['цитата']) + '»</div>' : ''}
  </div>
  ${возр.length ? '<h3>Возражения</h3>' + возр.map((в: any) => `
    <div class="obj ${в['отработано'] ? 'ok' : 'bad'}">
      <b>${экр(в['что'])}</b> — ${в['отработано'] ? 'отработано' : 'НЕ отработано'}
      <div class="quote">клиент: «${экр(в['цитата'])}»</div>
      ${в['как'] ? '<div class="dim">ответ: ' + экр(в['как']) + '</div>' : ''}
    </div>`).join('') : ''}
  ${нет.length ? '<h3>Менеджер не спросил</h3><ul>' + нет.map((н: any) => '<li>' + экр(н) + '</li>').join('') + '</ul>' : ''}
  ${риски.length ? '<h3 class="warn">Риски</h3>' + риски.map((р: any) => `
    <div class="obj bad"><b>${экр(р['что'])}</b><div class="quote">«${экр(р['цитата'])}»</div></div>`).join('') : ''}
</article>`
}

function страница(карточки: string[], n: number, цена: number): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Разбор разговоров — goandstudy</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 860px; margin: 0 auto; padding: 28px 18px 80px; background: #faf9f7; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { background:#16151a; color:#e8e6e3 } article { background:#1e1d24 !important; border-color:#2e2d36 !important } .quote { background:#26252e !important } .req td { border-color:#2e2d36 !important } }
  h1 { font-size: 24px; margin: 0 0 4px }
  .lead { color:#77747f; margin: 0 0 24px; font-size: 13px }
  article { background:#fff; border:1px solid #e6e3de; border-radius:14px; padding:20px 22px; margin-bottom:18px }
  h2 { font-size:17px; margin:0 }
  h3 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:#77747f; margin:18px 0 8px }
  h3.warn { color:#c92a2a }
  .meta { font-size:11px; color:#8b8892; margin-top:2px }
  .summary { margin:14px 0 }
  .row { margin:6px 0; font-size:13px }
  .dim { color:#77747f }
  .tag { display:inline-block; padding:2px 9px; border-radius:9px; color:#fff; font-size:11px; font-weight:700; margin-right:6px }
  .req { border-collapse:collapse; font-size:13px; margin:12px 0 }
  .req td { padding:3px 14px 3px 0; border-bottom:1px solid #f0eeea }
  .req td:first-child { color:#8b8892; width:90px }
  .step { margin:14px 0; padding:10px 14px; border-radius:10px; font-size:13px; font-weight:600 }
  .step.ok { background:rgba(22,163,97,.1); color:#116a42 }
  .step.bad { background:rgba(201,42,42,.09); color:#c92a2a }
  .obj { margin:10px 0; padding-left:12px; border-left:3px solid #e6e3de; font-size:13px }
  .obj.ok { border-color:#16a361 }
  .obj.bad { border-color:#c92a2a }
  .quote { background:#f5f3ef; border-radius:8px; padding:7px 11px; margin:6px 0; font-size:13px; font-style:italic }
  ul { margin:6px 0; padding-left:20px; font-size:13px }
  li { margin:3px 0 }
</style></head><body>
<h1>Разбор разговоров</h1>
<p class="lead">${n} сделок · ${(цена * 90).toFixed(0)} ₽ за весь прогон · ${(цена / Math.max(n,1) * 90).toFixed(1)} ₽ на сделку · ${new Date().toLocaleString('ru')}</p>
${карточки.join('\n')}
</body></html>`
}
