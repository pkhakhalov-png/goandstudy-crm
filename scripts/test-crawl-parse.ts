import { safeFetch } from '../lib/seo/safe-fetch'
import { parseHtml, classifyUrl } from '../lib/seo/crawl'
import { normalizeUrl } from '../lib/seo/normalize'
const URLS = [
  'https://goandstudy.com/',
  'https://goandstudy.com/blog/chto-takoe-ekzamen-gmat/',
  'https://goandstudy.com/sitemap.xml',
]
async function main(){
  // sitemap отдельно
  const sm = await safeFetch('https://goandstudy.com/sitemap.xml')
  if (sm.ok){ const locs=[...sm.body.toString('utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m=>m[1]); console.log('SITEMAP: ok,', locs.length, 'URL; пример:', locs[0]) }
  else console.log('SITEMAP fail:', sm.reason)
  for (const u of URLS.slice(0,2)){
    const r = await safeFetch(u)
    if (!r.ok){ console.log(`\n${u} → FAIL ${r.reason}`); continue }
    const p = parseHtml(r.body.toString('utf8'), r.finalUrl, r.status)
    const cls = classifyUrl(new URL(r.finalUrl))
    console.log(`\n${u}`)
    console.log('  platform/type:', cls.platform, cls.page_type)
    console.log('  title:', p.title?.slice(0,70))
    console.log('  h1:', p.h1?.slice(0,70))
    console.log('  meta_desc:', p.metaDesc?.slice(0,70) ?? '—')
    console.log('  canonical:', p.canonical ?? '—', '| noindex:', p.noindex, '| schema:', p.hasSchema)
    console.log('  words:', p.wordCount, '| links:', p.links.length,
      '(internal', p.links.filter(l=>{try{return new URL(l.href).hostname.endsWith('goandstudy.com')}catch{return false}}).length, ')')
    console.log('  blocks:', [...new Set(p.links.map(l=>l.block))].join(','))
  }
}
main().catch(e=>{console.error(e);process.exit(1)})
