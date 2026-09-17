// Базовый замер видимости в ИИ — техническая часть (E5.16).
//
//   npx tsx scripts/ai-visibility-baseline.ts
//   npx tsx scripts/ai-visibility-baseline.ts --write   # записать в docs/
//
// Что здесь меряется и чего не меряется.
//
// Меряется то, что можно померить запросом: пускают ли краулеров ИИ, видят ли
// они текст без JS, есть ли разметка, одинаково ли называется бренд. Это не
// видимость, а её ПРЕДПОСЫЛКИ: если краулер получает пустую страницу, никакой
// видимости не будет, и выяснить это надо до того, как считать упоминания.
//
// Не меряется главное — цитируют ли нас ассистенты в ответах. Это делается
// руками: задать вопросы и записать, кто упомянут. Я этого сделать не могу и
// не притворяюсь, что могу: спросить самого себя — не замер, а разговор с
// зеркалом.
import fs from 'fs'

const САЙТ = 'https://goandstudy.com'

const КРАУЛЕРЫ = [
  'GPTBot/1.2',
  'ClaudeBot/1.0',
  'PerplexityBot/1.0',
  'Google-Extended',
  'Bytespider',
  // Обычный браузер для сравнения. Строка только латиницей: в заголовок HTTP
  // кириллица не помещается, и первая версия этого замера получила на ней
  // код 0 — ту же ошибку, что нашлась в вебхуке днём раньше.
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
]

type Строка = { что: string; значение: string; вывод?: string }

const текстИз = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

async function достать(url: string, ua: string) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(url, { headers: { 'user-agent': ua }, signal: ctrl.signal, cache: 'no-store' })
    const body = await res.text()
    return { status: res.status, body }
  } catch (e: any) {
    return { status: 0, body: '', error: String(e?.message ?? e) }
  } finally { clearTimeout(timer) }
}

async function main() {
  const строки: Строка[] = []
  const заметки: string[] = []

  // 1. Запрещает ли robots.txt краулеров ИИ.
  const robots = await достать(`${САЙТ}/robots.txt`, 'Mozilla/5.0')
  const блоки = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot', 'Bytespider']
    .filter((b) => new RegExp(`User-agent:\\s*${b}`, 'i').test(robots.body))
  строки.push({
    что: 'robots.txt',
    значение: блоки.length ? `упомянуты: ${блоки.join(', ')}` : 'краулеры ИИ не упомянуты',
    вывод: блоки.length ? 'проверить, разрешены они или запрещены' : 'структурного запрета нет',
  })

  // 2. llms.txt — соглашение о том, что можно брать и как ссылаться.
  const llms = await достать(`${САЙТ}/llms.txt`, 'Mozilla/5.0')
  строки.push({
    что: 'llms.txt',
    значение: llms.status === 200 ? 'есть' : `нет (HTTP ${llms.status})`,
    вывод: llms.status === 200 ? undefined : 'необязателен, но это единственное место, где можно сказать ассистентам, что о нас брать',
  })

  // 3. Отдаётся ли краулерам то же, что людям.
  const ответы: Record<string, { status: number; len: number }> = {}
  for (const ua of КРАУЛЕРЫ) {
    const r = await достать(`${САЙТ}/`, ua)
    ответы[ua] = { status: r.status, len: r.body.length }
  }
  const размеры = [...new Set(Object.values(ответы).map((r) => r.len))]
  const коды = [...new Set(Object.values(ответы).map((r) => r.status))]
  const сломались = Object.entries(ответы).filter(([, r]) => r.status === 0).map(([ua]) => ua)
  if (сломались.length) {
    // Код 0 — это не отказ сайта, это наш запрос не ушёл. Путать одно с
    // другим значит записать в замер вывод про чужой сервер вместо своего.
    заметки.push(`Запрос не ушёл для user-agent: ${сломались.join(', ')}. Это наша ошибка, а не отказ сайта.`)
  }
  строки.push({
    что: 'доступ краулерам',
    значение: `коды ${коды.join(', ')}; размеров ответа ${размеры.length}`,
    вывод: сломались.length ? 'часть запросов не ушла — см. заметки'
      : коды.length === 1 && коды[0] === 200 && размеры.length === 1
        ? 'всем отдаётся одно и то же — краулеров не отсекают'
        : 'ответы различаются — разобраться, кому что отдаётся',
  })

  // 4. Виден ли текст без JS. Краулер, получивший пустую страницу, не
  //    процитирует её никогда, как бы хорошо она ни была написана.
  const карта = await достать(`${САЙТ}/sitemap.xml`, 'ClaudeBot/1.0')
  const статьи = [...карта.body.matchAll(/https:\/\/goandstudy\.com\/blog\/[a-z0-9-]+\//g)].map((m) => m[0])
  const проба = статьи[0]
  let схемы: string[] = []
  if (проба) {
    const r = await достать(проба, 'ClaudeBot/1.0')
    const текст = текстИз(r.body)
    строки.push({
      что: 'текст без JS',
      значение: `${текст.length} знаков на ${проба.replace(САЙТ, '')}`,
      вывод: текст.length > 2000 ? 'страница читается без выполнения скриптов' : 'текста мало — проверить, не рисуется ли он скриптом',
    })

    // 5. Разметка: тип, автор, даты. Без них цитировать нечего и некого.
    const блоки = [...r.body.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
    let автор: string | null = null, дата: string | null = null
    for (const b of блоки) {
      try {
        const d = JSON.parse(b[1])
        const g = Array.isArray(d) ? d : (d['@graph'] ?? [d])
        for (const x of g) {
          if (!x || typeof x !== 'object') continue
          схемы.push(String(x['@type']))
          if (['Article', 'BlogPosting', 'NewsArticle'].includes(String(x['@type']))) {
            автор = typeof x.author === 'object' ? x.author?.name ?? null : x.author ?? null
            дата = x.datePublished ?? null
          }
        }
      } catch { /* битый блок разметки — не повод падать */ }
    }
    строки.push({
      что: 'разметка статьи',
      значение: схемы.length ? схемы.join(', ') : 'нет',
      вывод: автор && дата ? `автор «${автор}», дата ${String(дата).slice(0, 10)}` : 'нет автора или даты — цитировать нечего',
    })

    // 6. Одинаково ли называется бренд. Три написания — три разных сущности
    //    для системы, которая их связывает.
    const заголовок = (r.body.match(/<title>(.*?)<\/title>/) ?? [])[1] ?? ''
    const sitename = (r.body.match(/<meta property="og:site_name" content="([^"]*)"/) ?? [])[1] ?? ''
    const написания = [...new Set([
      (заголовок.match(/Go\s*and\s*Study|goandstudy|GoAndStudy/i) ?? [])[0],
      sitename, автор,
    ].filter(Boolean) as string[])]
    строки.push({
      что: 'написание бренда',
      значение: написания.join(' · ') || '—',
      вывод: написания.length > 1
        ? 'разные написания на одной странице — для системы, связывающей упоминания, это разные сущности'
        : 'единое',
    })
    if (написания.length > 1) {
      заметки.push(`Бренд написан по-разному в пределах одной страницы: ${написания.map((n) => `«${n}»`).join(', ')}. `
        + 'Это не косметика: упоминания «Go and Study» и «goandstudy» связываются в одну сущность не всегда, '
        + 'и часть веса уходит в никуда.')
    }
  }

  строки.push({ что: 'статей в карте сайта', значение: String(статьи.length) })

  console.log(`\nБазовый замер видимости в ИИ · ${new Date().toISOString().slice(0, 10)}\n`)
  for (const s of строки) {
    console.log(`${s.что.padEnd(24)} ${s.значение}`)
    if (s.вывод) console.log(`${''.padEnd(24)} └ ${s.вывод}`)
  }
  if (заметки.length) {
    console.log('\nЗаметки:')
    for (const z of заметки) console.log(` — ${z}`)
  }

  console.log('\nЧего здесь нет: цитируют ли нас ассистенты. Это меряется руками —')
  console.log('см. список вопросов в docs/ai-visibility-baseline.md.')

  if (process.argv.includes('--write')) {
    const md = [
      '<!-- составлено scripts/ai-visibility-baseline.ts, не править руками -->',
      `_Замер ${new Date().toISOString().slice(0, 10)}._`, '',
      '| Что | Значение | Вывод |', '|---|---|---|',
      ...строки.map((s) => `| ${s.что} | ${s.значение} | ${s.вывод ?? ''} |`),
      '',
      ...(заметки.length ? ['### Заметки', '', ...заметки.map((z) => `- ${z}`), ''] : []),
    ].join('\n')
    fs.writeFileSync('docs/ai-visibility-measured.md', md + '\n')
    console.log('\nзаписано: docs/ai-visibility-measured.md')
  }
}
main()
