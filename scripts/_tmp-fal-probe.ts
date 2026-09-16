import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
const key = process.env.FAL_KEY!
const names = [
  'fal-ai/nano-banana', 'fal-ai/nano-banana/text-to-image',
  'fal-ai/nano-banana-pro', 'fal-ai/nano-banana-pro/text-to-image',
  'fal-ai/nano-banana-2', 'fal-ai/nano-banana-v2',
  'fal-ai/gemini-3-pro-image', 'fal-ai/gemini-3-flash-image',
  'fal-ai/gemini-flash-image', 'fal-ai/gemini-25-flash-image',
]
async function main() {
  for (const m of names) {
    try {
      const res = await fetch(`https://fal.run/${m}`, {
        method: 'POST', headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({}), signal: AbortSignal.timeout(20000),
      })
      console.log(`${m.padEnd(40)} ${res.status === 404 ? '✗ нет' : res.status === 422 ? '✓ есть' : `? ${res.status}`}`)
    } catch (e) { console.log(`${m.padEnd(40)} ? ${(e as Error).message.slice(0, 30)}`) }
  }
}
main()
