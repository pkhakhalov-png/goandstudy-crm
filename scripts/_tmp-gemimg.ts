import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
config({ path: path.resolve(process.cwd(), '.env.local') })

const MODEL = 'gemini-3.1-flash-image'
const STYLE = 'Editorial lifestyle photograph, quiet intimate atmosphere, understated magazine aesthetic, muted warm-neutral colors, charcoal blacks, espresso brown, taupe and ivory, restrained amber accents only where motivated by the scene, natural directional light or believable practical lamp light, deep dimensional shadows with preserved texture, controlled highlights, realistic white balance and skin tones, tactile paper wood fabric and metal, subtle fine film grain, candid observational framing, slightly off-center composition, authentic lived-in details, selective focus only where appropriate, photographic realism, visually clear at thumbnail size.'
const AVOID = 'Avoid: generic corporate stock photography, staged advertising poses, exaggerated smiles, glossy commercial lighting, uniform orange or sepia cast, oversaturated colors, HDR halos, crushed shadow detail, blown highlights, plastic skin, excessive blur, artificial heavy grain, decorative clutter, CGI, 3D render, illustration, added headline, quote overlay, watermark, prominent brand logos.'
const FORMAT = 'Horizontal 3:2 framing. Keep the upper third visually calm for a category label; do not place faces, hands or key objects near the crop edges. No text, headlines or interface elements inside the image.'

const scene = 'A student desk with a laptop open to an online application form, a passport, printed transcripts and a folder of documents, near a window with daylight in a modest apartment.'

async function attempt(label: string, body: Record<string, unknown>) {
  const t = Date.now()
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
  })
  const data: any = await res.json()
  if (!res.ok) { console.log(`${label}: HTTP ${res.status}`); console.log(JSON.stringify(data?.error?.details ?? data, null, 1).slice(0, 900)); return null }
  const part = (data?.candidates?.[0]?.content?.parts ?? []).find((p: any) => p.inlineData ?? p.inline_data)
  if (!part) { console.log(`${label}: картинки нет, пришло: ${JSON.stringify(data).slice(0, 200)}`); return null }
  const b64 = (part.inlineData ?? part.inline_data).data
  const buf = Buffer.from(b64, 'base64')
  const out = path.join(process.argv[2], `probe-${label}.jpg`)
  fs.writeFileSync(out, buf)
  const sharp = (await import('sharp')).default
  const meta = await sharp(buf).metadata()
  console.log(`${label}: ✓ ${meta.width}×${meta.height} ${Math.round(buf.length / 1024)} КБ за ${Math.round((Date.now() - t) / 1000)} с → ${out}`)
  return buf
}

async function main() {
  const prompt = `${scene}\n\n${STYLE}\n\n${AVOID}\n\n${FORMAT}`
  await attempt('с-aspect', {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { imageConfig: { aspectRatio: '3:2' } },
  })
  await attempt('без-aspect', { contents: [{ parts: [{ text: prompt }] }] })
}
main()
