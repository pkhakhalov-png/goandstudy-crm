// Протокол проверки статьи (E2.8).
//
//   npx tsx scripts/seo-review-test.ts            # теневой прогон, моделей не зовём
//   npx tsx scripts/seo-review-test.ts --models   # с двумя проверками моделью (платно)
//
// Главное, что здесь проверяется, — что ревьюер не может подтвердить то, чего
// код не нашёл в источниках. Это гейт этапа, и если он не держит, всё
// остальное в протоколе не имеет значения.
import { config } from 'dotenv'; import path from 'path'
config({ path: path.resolve(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import {
  worst, settle, codeVerdict, mergeStatements, reviewersNote, reviewArticle,
  type Statement, type CodeCheck, type ReviewerNote,
} from '../lib/seo/review-protocol'
import type { Expiry } from '../lib/seo/expiry'
import { subjectKeysFor } from '../lib/seo/claims'

const seo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).schema('seo')
const WITH_MODELS = process.argv.includes('--models')

let passed = 0, failed = 0
function ok(name: string, cond: boolean, note = '') {
  if (cond) { passed++; console.log(`✓ ${name}${note ? ' — ' + note : ''}`) }
  else { failed++; console.log(`✗ ${name}${note ? ' — ' + note : ''}`) }
}

const st = (over: Partial<Statement> = {}): Statement => ({
  fragment: 'Обучение стоит 76 000 батов за семестр', offset: 100,
  kind: 'tuition_fee', claimId: 21, via: 'реестр', ...over,
})
const note = (v: ReviewerNote['verdict'], who = 'fact_reviewer'): ReviewerNote => ({
  reviewer: who, claimId: 21, fragment: 'x', evidenceId: 2, verdict: v,
  explanation: `проверка сочла: ${v}`, suggestedFix: null,
})
const live: Expiry = { at: new Date('2027-01-01'), reason: 'политика', expired: false, neverVerified: false, parts: [], volatile: false }
const dead: Expiry = { at: new Date('2023-10-09'), reason: 'источник', expired: true, neverVerified: false, parts: [], volatile: false }

async function main() {
  ok('тяжесть вердиктов упорядочена',
    worst('supported', 'stale') === 'stale' && worst('insufficient', 'stale') === 'insufficient'
    && worst('contradicted', 'insufficient') === 'contradicted' && worst('supported', 'supported') === 'supported')

  // ── Гейт этапа: согласие обеих проверок не подтверждает утверждение.
  const noEvidence = codeVerdict(st(), null, null)
  const bothSayYes = settle(noEvidence, [note('supported'), note('supported', 'context_reviewer')])
  ok('обе проверки сказали «подтверждено» — утверждение всё равно блокируется',
    bothSayYes.verdict === 'insufficient' && bothSayYes.level === 'blocking',
    `итог: ${bothSayYes.verdict}, ${bothSayYes.level}`)
  ok('и об этом сказано вслух, а не молча', /вердикт кода сильнее/.test(bothSayYes.why))

  // ── Ухудшать ревьюер может.
  const withEvidence = codeVerdict(st(), { id: 2, quote: '76,000 (2,200)' }, live)
  ok('код подтверждает только при выдержке из источника', withEvidence.verdict === 'supported')
  const contradicted = settle(withEvidence, [note('contradicted'), note('supported', 'context_reviewer')])
  ok('проверка может ухудшить подтверждённое',
    contradicted.verdict === 'contradicted' && contradicted.level === 'blocking')

  // ── Разногласие — человеку, а не большинству.
  ok('разногласие помечено, а не усреднено', contradicted.disagreement)
  const agreed = settle(withEvidence, [note('supported'), note('supported', 'context_reviewer')])
  ok('согласие не помечается разногласием', !agreed.disagreement && agreed.verdict === 'supported')
  const twoAgainstOne = settle(withEvidence, [note('contradicted'), note('supported', 'context_reviewer')])
  ok('голосования нет: одна проверка против — уже блокировка', twoAgainstOne.verdict === 'contradicted')

  // ── Истёкшая годность.
  const staleCheck = codeVerdict(st(), { id: 2, quote: '76,000 (2,200)' }, dead)
  ok('истёкшая годность даёт stale, а не supported', staleCheck.verdict === 'stale',
    staleCheck.why)
  ok('истёкшее критичное блокирует', settle(staleCheck, []).level === 'blocking')

  // ── Некритичный вид истекает без блокировки.
  const soft = codeVerdict(st({ kind: 'system_basics' }), null, null)
  ok('некритичный вид даёт предупреждение, а не блокировку', settle(soft, []).level === 'warning')

  // ── Дедупликация.
  const merged = mergeStatements(
    [st({ fragment: 'Обучение стоит 76 000 батов', offset: 100 })],
    [
      { fragment: 'Обучение стоит 76 000 батов', offset: 100, kind: 'tuition_fee', claimId: null, via: 'формулировка' },
      { fragment: 'Визу дают всем без исключения', offset: 400, kind: 'visa_requirement', claimId: null, via: 'формулировка' },
    ],
  )
  ok('одна находка двумя способами — одно замечание', merged.length === 2, `осталось ${merged.length}`)
  ok('связь с реестром при дедупликации не теряется', merged[0].claimId === 21)

  // ── Формулировка про ревьюеров честная.
  const same = reviewersNote({ provider: 'anthropic', model: 'claude-opus-5' }, { provider: 'anthropic', model: 'claude-opus-5' })
  ok('про одинаковые модели сказано, что ошибки общие', /два прогона одной модели/.test(same))
  const diff = reviewersNote({ provider: 'anthropic', model: 'claude-opus-5' }, { provider: 'openai', model: 'gpt-x' })
  ok('про разные — что риск связанный, а не независимый', /риск ошибки связанный/.test(diff) && !/независим/.test(diff))

  // ── Живые статьи.
  //
  // Ключи предмета берутся из темы статьи той же функцией, что и в конвейере.
  // Подставить их руками — значит проверить не то: утверждение про Китай
  // «принимают до 25 лет» найдётся в любой статье, где встречается число 25,
  // и именно предмет не даёт этому случиться.
  const { data: arts } = await seo.from('article_versions')
    .select('article_id, title, body').not('body', 'is', null).order('id', { ascending: false }).limit(6)
  for (const art of (arts ?? []) as any[]) {
    const keys = subjectKeysFor(String(art.title))
    const res = await reviewArticle(seo, {
      text: art.body, subjectKeys: keys, askModels: WITH_MODELS, articleId: art.article_id,
    })
    console.log(`\nстатья #${art.article_id} «${String(art.title).slice(0, 52)}» → предмет ${keys.length ? keys.join(', ') : '—'}`)
    console.log(`  ${res.checked} утверждений, ${res.blocking.length} блокирующих, ${res.warnings.length} предупреждений`)
    for (const f of res.findings.slice(0, 4)) {
      console.log(`  [${f.verdict}/${f.level}] ${f.statement.fragment.slice(0, 58)}`)
      console.log(`     ${f.why.slice(0, 110)}`)
    }
  }
  const art = (arts ?? [])[0] as any
  if (art) {
    const res = await reviewArticle(seo, {
      text: art.body, subjectKeys: subjectKeysFor(String(art.title)), askModels: WITH_MODELS, articleId: art.article_id,
    })
    ok('протокол отрабатывает на живой статье', res.checked >= 0,
      `${res.checked} утверждений, ${res.blocking.length} блокирующих`)
    console.log(`\n  ${res.note}`)
  }

  console.log(`\n${passed} пройдено, ${failed} провалено`)
  process.exit(failed ? 1 : 0)
}
main()
