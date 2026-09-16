import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
config({ path: path.resolve(process.cwd(), '.env.local') })

const STYLE = 'Editorial lifestyle photograph, quiet intimate atmosphere, understated magazine aesthetic, muted warm-neutral colors, charcoal blacks, espresso brown, taupe and ivory, restrained amber accents only where motivated by the scene, natural directional light or believable practical lamp light, deep dimensional shadows with preserved texture, controlled highlights, realistic white balance and skin tones, tactile paper wood fabric and metal, subtle fine film grain, candid observational framing, slightly off-center composition, authentic lived-in details, selective focus only where appropriate, photographic realism, visually clear at thumbnail size.'
const AVOID = 'Avoid: generic corporate stock photography, staged advertising poses, exaggerated smiles, glossy commercial lighting, uniform orange or sepia cast, oversaturated colors, HDR halos, crushed shadow detail, blown highlights, plastic skin, excessive blur, artificial heavy grain, decorative clutter, CGI, 3D render, illustration, added headline, quote overlay, watermark, prominent brand logos.'
const FORMAT = 'Horizontal 3:2 framing. Keep the upper third visually calm; do not place faces, hands or key objects near the crop edges. No text, headlines or interface elements inside the image.'

const scene = 'A student desk with a laptop open to an online application form, a passport, printed transcripts and a folder of documents, near a window with daylight in a modest apartment.'

async function run(model: string, extra: Record<string, unknown>) {
  const t = Date.now()
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: { authorization: `Key ${process.env.FAL_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: `${scene}\n\n${STYLE}\n\n${AVOID}\n\n${FORMAT}`, num_images: 1, ...extra }),
    signal: AbortSignal.timeout(180000),
  })
  const data: any = await res.json()
  if (!res.ok) { console.log(`${model}: HTTP ${res.status} ${JSON.stringify(data).slice(0, 220)}`); return }
  const url = data?.images?.[0]?.url
  if (!url) { console.log(`${model}: картинки нет — ${JSON.stringify(data).slice(0, 200)}`); return }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  const sharp = (await import('sharp')).default
  const meta = await sharp(buf).metadata()
  const out = path.join(process.argv[2], `nb2-${model.split('/').pop()}.jpg`)
  fs.writeFileSync(out, buf)
  console.log(`${model}: ✓ ${meta.width}×${meta.height} ${Math.round(buf.length / 1024)} КБ за ${Math.round((Date.now() - t) / 1000)} с`)
}

async function main() {
  await run('fal-ai/nano-banana-2', { aspect_ratio: '3:2', output_format: 'jpeg' })
}
main()
