// Проверка, что одну задачу не выдают двум исполнителям.
//
//   npx tsx scripts/seo-claim-race.ts
//
// Selftest проверяет то же самое, но одним прогоном — и потому ловит дубль
// через раз. Здесь прогонов много подряд: если защита сломана, это видно сразу
// и с долей, а не «иногда падает».
//
// Так был найден дефект во второй фазе seo.claim_jobs: внутренний SELECT
// фильтровал только по списку идентификаторов, без проверки статуса, и задача,
// уже помеченную первым исполнителем, забирал второй. До починки —
// 5 дублей из 12. Починка: 20260917000000_claim_jobs_no_double.sql.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const ROUNDS = Number(process.argv[2] ?? 12)

async function main() {
  let doubles = 0, singles = 0, zeros = 0
  for (let i = 0; i < ROUNDS; i++) {
    const { data: job, error } = await seo.from('jobs')
      .insert({ step: 'noop', lane: 'test', priority: 1, payload: {}, runner: 'agent' }).select('id').single()
    if (error) throw new Error(`постановка задачи: ${error.message}`)
    try {
      const [a, b] = await Promise.all([
        seo.rpc('claim_jobs', { p_worker: 'race-a', p_limit: 5, p_runner: 'agent' }),
        seo.rpc('claim_jobs', { p_worker: 'race-b', p_limit: 5, p_runner: 'agent' }),
      ])
      const mine = [...(a.data ?? []), ...(b.data ?? [])].filter((j: any) => j.id === job.id)
      if (mine.length > 1) { doubles++; console.log(`  прогон ${i + 1}: выдана ${mine.length} раз — дубль`) }
      else if (mine.length === 1) singles++
      else zeros++
    } finally {
      // Прибираем за собой всегда: тестовые задачи не должны оседать в очереди
      await seo.from('jobs').delete().eq('id', job.id)
    }
  }
  console.log(`\nдублей: ${doubles} | выдана одному: ${singles} | не выдана (занята дорожка): ${zeros}`)
  if (doubles > 0) {
    console.log('\n✗ защита от двойного захвата не работает')
    process.exit(1)
  }
  console.log('\n✓ одну задачу дважды не выдали ни разу')
}

main().catch((e) => { console.error('✗', e.message || e); process.exit(1) })
