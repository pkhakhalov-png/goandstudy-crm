// Импорт собранной семантики и сверка с тем, что уже ранжируется.
//
// Search Console показывает только те запросы, по которым нас уже показывают.
// Запрос, где нас нет вовсе, там не появится никогда — и именно он может быть
// самым ценным. Собранная семантика закрывает эту слепую зону и приносит
// настоящую частотность вместо показов, которые зависят от наших же позиций.
//
//   npx tsx scripts/seo-semantics-import.ts          разбор без записи
//   npx tsx scripts/seo-semantics-import.ts --save   завести темы
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import { loadQueryDays, movements } from '../lib/seo/positions'
import { sameFamily } from '../lib/seo/cannibal'

type Row = {
  query: string; group: string; base: number; exact: number; refined: number
  pageType: string; comment: string
}

const SAVE = process.argv.includes('--save')
const FILE = process.argv.find((a) => a.endsWith('.tsv')) ?? 'data/semantics.tsv'

function read(file: string): Row[] {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
  return lines.slice(1).map((l) => {
    const c = l.split('\t')
    return {
      query: (c[0] ?? '').trim().toLowerCase(),
      group: (c[1] ?? '').trim(),
      base: Number(c[2] ?? 0) || 0,
      exact: Number(c[3] ?? 0) || 0,
      refined: Number(c[4] ?? 0) || 0,
      pageType: (c[5] ?? '').trim(),
      comment: (c[6] ?? '').trim(),
    }
  }).filter((r) => r.query)
}

async function main() {
  const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).schema('seo')
  const rows = read(FILE)
  console.log(`запросов в файле: ${rows.length}, суммарная базовая частотность: ${rows.reduce((s, r) => s + r.base, 0).toLocaleString('ru')}\n`)

  // Где мы уже показываемся — из Search Console за последние три недели
  const gsc = await loadQueryDays(seo, 21)
  const { list } = movements(gsc, { minImpressions: 1 })
  const byQuery = new Map<string, { pos: number; imp: number; clicks: number; url: string }>()
  for (const m of list) {
    const prev = byQuery.get(m.query)
    if (!prev || m.impressions > prev.imp) byQuery.set(m.query, { pos: m.now, imp: m.impressions, clicks: m.clicks, url: m.url })
  }

  const strong: Row[] = []   // есть и стоим хорошо
  const weak: Row[] = []     // показываемся, но глубоко
  const absent: Row[] = []   // нас нет вовсе

  for (const r of rows) {
    const hit = byQuery.get(r.query)
    if (!hit) absent.push(r)
    else if (hit.pos <= 10) strong.push(r)
    else weak.push(r)
  }

  const sum = (a: Row[]) => a.reduce((s, r) => s + r.exact, 0)
  console.log(`в первой десятке:   ${String(strong.length).padStart(3)} запросов · ${sum(strong).toLocaleString('ru')} точной частоты`)
  console.log(`показываемся глубже:${String(weak.length).padStart(3)} запросов · ${sum(weak).toLocaleString('ru')}`)
  console.log(`нас нет вовсе:      ${String(absent.length).padStart(3)} запросов · ${sum(absent).toLocaleString('ru')}  ← слепая зона Search Console`)

  console.log('\nсамое ценное, где нас нет:')
  for (const r of absent.sort((a, b) => b.exact - a.exact).slice(0, 12)) {
    console.log(`  ${String(r.exact).padStart(6)} точной · ${r.pageType || '—'} · «${r.query}»`)
  }

  console.log('\nпоказываемся, но глубоко (дотянуть дешевле, чем писать новое):')
  for (const r of weak.sort((a, b) => b.exact - a.exact).slice(0, 10)) {
    const hit = byQuery.get(r.query)!
    console.log(`  ${String(r.exact).padStart(6)} точной · позиция ${hit.pos.toFixed(1).padStart(5)} · ${hit.url.replace('https://goandstudy.com', '')} · «${r.query}»`)
  }

  if (!SAVE) { console.log('\nэто разбор. Запись тем: --save'); return }

  // Заводим темы только там, где нас нет и спрос заметен: остальное — работа
  // над существующими страницами, а не новые статьи
  const { data: existing } = await seo.from('topics').select('title, primary_keyword')
  const { data: arts } = await seo.from('articles').select('primary_keyword')
  const taken = [
    ...(existing ?? []).map((t: any) => t.primary_keyword ?? t.title),
    ...(arts ?? []).map((a: any) => a.primary_keyword),
  ].filter(Boolean) as string[]

  let saved = 0, skipped = 0
  for (const r of absent.sort((a, b) => b.exact - a.exact)) {
    if (r.exact < 30) continue
    if (taken.some((t) => sameFamily(t, r.query))) { skipped++; continue }

    // business_value — число, а не название типа страницы: сюда шёл текст, и
    // вставка падала молча. Тип страницы кладём в cluster, он для этого и есть.
    const { error } = await seo.from('topics').insert({
      title: r.group || r.query, primary_keyword: r.query,
      search_volume: r.exact,
      business_value: Math.min(100, Math.round(r.exact / 10)),
      cluster: r.pageType || null,
      origin: 'semantics', status: 'new',
      priority: Math.round(r.exact / 10),
    })
    if (error) { console.log(`  ✗ не сохранилась «${r.query}»: ${error.message.slice(0, 90)}`); continue }
    saved++; taken.push(r.query)
  }
  console.log(`\nзаведено тем: ${saved}, пропущено как уже занятые: ${skipped}`)
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
