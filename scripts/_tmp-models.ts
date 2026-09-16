import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })

async function gemini() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}&pageSize=200`)
  const data: any = await res.json()
  const models = (data.models ?? [])
    .filter((m: any) => /image|imagen/i.test(m.name) || (m.supportedGenerationMethods ?? []).includes('predict'))
    .map((m: any) => `${m.name.replace('models/', '').padEnd(40)} ${m.displayName ?? ''}`)
  console.log('GEMINI / IMAGEN:')
  console.log(models.length ? models.map((m: string) => '  ' + m).join('\n') : '  — ничего не нашлось —')
}

async function falProbe() {
  const key = process.env.FAL_KEY!
  const candidates = [
    'fal-ai/flux/schnell', 'fal-ai/flux/dev', 'fal-ai/flux-pro/v1.1', 'fal-ai/flux-pro/v1.1-ultra',
    'fal-ai/flux-pro/kontext', 'fal-ai/recraft-v3', 'fal-ai/recraft/v3/text-to-image',
    'fal-ai/ideogram/v3', 'fal-ai/imagen4/preview', 'fal-ai/imagen4/preview/ultra',
    'fal-ai/bytedance/seedream/v4/text-to-image', 'fal-ai/qwen-image', 'fal-ai/nano-banana',
  ]
  console.log('\nFAL — что отвечает (пробный запрос без генерации):')
  for (const m of candidates) {
    try {
      const res = await fetch(`https://fal.run/${m}`, {
        method: 'POST',
        headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),           // пустой запрос: 422 = модель есть, 404 = нет
        signal: AbortSignal.timeout(20000),
      })
      const mark = res.status === 404 ? '✗ нет' : res.status === 422 ? '✓ есть' : `? ${res.status}`
      console.log(`  ${m.padEnd(44)} ${mark}`)
    } catch (e) {
      console.log(`  ${m.padEnd(44)} ? ${(e as Error).message.slice(0, 40)}`)
    }
  }
}

async function main() { await gemini(); await falProbe() }
main()
