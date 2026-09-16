import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
config({ path: path.resolve(process.cwd(), '.env.local') })
const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo') as any

async function main() {
  const { data: a } = await seo.from('articles').select('current_version_id').eq('id', 21).single()
  const { data: v } = await seo.from('article_versions').select('meta').eq('id', a.current_version_id).single()
  const meta: any = v.meta ?? {}
  // Шаг обложки упал на пустом балансе и сцену сохранить не успел: пишем её
  // сами по каталогу рубрик из брифа. Тема — оплата обучения, место — Бангкок.
  const scene = meta.images?.scenes?.cover
    ?? 'A student at a university administration counter in Bangkok handing over a payment slip '
     + 'and a folder of documents, a clerk checking papers behind the counter, tall windows with '
     + 'tropical daylight, other students waiting on chairs in the background, seen from behind.'
  console.log('сцена:', scene)

  const { coverPrompt } = await import('../lib/seo/images')
  const prompt = coverPrompt(scene)

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { imageConfig: { aspectRatio: '3:2' } } }),
    signal: AbortSignal.timeout(180000),
  })
  const data: any = await res.json()
  if (!res.ok) { console.log(`✗ ${res.status}: ${JSON.stringify(data?.error?.message ?? data).slice(0, 200)}`); return }
  const part = (data?.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData ?? p.inline_data)
  if (!part) { console.log('✗ картинки в ответе нет'); return }

  const sharp = (await import('sharp')).default
  const raw = Buffer.from((part.inlineData ?? part.inline_data).data, 'base64')
  const buffer = await sharp(raw).resize(1200, 800, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true }).toBuffer()
  const out = path.join(process.argv[2], 'article21-cover.jpg')
  fs.writeFileSync(out, buffer)
  console.log(`✓ обложка ${Math.round(buffer.length / 1024)} КБ → ${out}`)

  await seo.from('article_versions').update({
    meta: { ...meta, cover: { format: 'jpeg', width: 1200, height: 800, bytes: buffer.length, base64: buffer.toString('base64') } },
  }).eq('id', a.current_version_id)
  console.log('✓ записана в версию статьи вместо заглушки')
}
main()
