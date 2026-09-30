// Спросить помощника из терминала — от имени конкретного сотрудника.
//
//   npx tsx scripts/care/ask.ts --кто <user_id> "что сегодня важнее всего?"
//   npx tsx scripts/care/ask.ts --кто <user_id> --дело <case_id> "чего не хватает?"
//
// Зачем. Проверять помощника через браузер значит каждый раз логиниться и
// кликать. Здесь тот же код, те же права и та же область — только без
// интерфейса. Удобно и для отладки, и для проверки, что область не течёт.
//
// Права настоящие: инструменты привязаны к сотруднику, и увидеть чужое дело
// отсюда так же нельзя, как из кабинета.
import { config } from 'dotenv'
import path from 'path'

config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const { базаCare } = await import('../../lib/care/db')
  const { спросить } = await import('../../lib/care/ai/assistant')

  function аргумент(имя: string): string | null {
    const i = process.argv.indexOf(`--${имя}`)
    return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null
  }

  const кто = аргумент('кто')
  const дело = аргумент('дело')
  const вопрос = process.argv.filter((а, i) => i >= 2 && !а.startsWith('--') && а !== кто && а !== дело).join(' ')

  if (!кто || !вопрос) {
    console.error('npx tsx scripts/care/ask.ts --кто <user_id> "вопрос"')
    process.exit(1)
  }

  const { data: участник, error } = await базаCare()
    .from('members')
    .select('id, user_id, care_role, team_lead_id, active')
    .eq('user_id', кто)
    .maybeSingle()

  if (error) { console.error('✗', error.message); process.exit(1) }
  if (!участник) { console.error('Такого сотрудника в контуре нет'); process.exit(1) }

  console.log(`\nОт имени: ${участник.care_role} ${участник.id}`)
  console.log(`Область:  ${дело ? `дело ${дело}` : 'все мои клиенты'}`)
  console.log(`Вопрос:   ${вопрос}\n`)

  const начало = Date.now()
  const ответ = await спросить(участник, дело ? { все: false, caseId: дело } : { все: true }, вопрос)

  console.log('─'.repeat(70))
  console.log(ответ.текст)
  console.log('─'.repeat(70))
  console.log(
    `шагов ${ответ.шагов} · ${Math.round((Date.now() - начало) / 100) / 10} с · ` +
      `${ответ.итогоДолларов < 0.01 ? 'меньше цента' : `${ответ.итогоДолларов.toFixed(3)} $`}` +
      (ответ.отказ ? ' · ОТКАЗ' : '')
  )
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
