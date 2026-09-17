// Проверки профилей площадок, сборки поста и антидублей (E4.7).
//
// Базы не требуют намеренно: схема content ещё закрыта для PostgREST, а
// проверка, которую нельзя прогнать сегодня, не прогоняется никогда.
//
// Запуск: npx tsx scripts/content-social-test.ts
import { profileFor, capability, linkAttribution, requiredDisclosures } from '../lib/content/social-profile'
import { composePost, checkPost, anglesFor } from '../lib/content/social-compose'
import { variantsAreDistinct, variantOverlap, contentFingerprint, thesisSimilarity, findRepeats } from '../lib/content/social-dedupe'

let passed = 0, failed = 0
function test(name: string, fn: () => string | void) {
  try {
    const note = fn()
    passed++; console.log(`✓ ${name}${note ? ` — ${note}` : ''}`)
  } catch (e) {
    failed++; console.log(`✗ ${name}\n    ${e instanceof Error ? e.message : String(e)}`)
  }
}
function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg) }

/* ── Профиль ──────────────────────────────────────────────────────────────── */

test('площадки различаются поведением ссылки, а не длиной', () => {
  const tg = profileFor('telegram')
  const vk = profileFor('vk')
  assert(tg.link.inBody !== vk.link.inBody,
    `ссылка ведёт себя одинаково (${tg.link.inBody}) — тогда площадки не различаются в главном`)
  assert(vk.link.inBody === 'wrapped', 'ВК переписывает внешнюю ссылку своим переходником — это должно быть в профиле')
  assert(tg.angle.question !== vk.angle.question, 'у площадок один и тот же угол — значит, будет один пост дважды')
  return `${tg.link.inBody} против ${vk.link.inBody}, углы разные`
})

test('без proof_ref возможность остаётся предположением', () => {
  const vk = profileFor('vk')

  const nothing = capability(vk, 'link_in_body', null)
  assert(nothing.proven === false, 'без записи в connector_capabilities возможность нельзя считать проверенной')

  // Запись есть, ссылки на успешный вызов нет — это чья-то уверенность в базе
  const claimed = capability(vk, 'link_in_body', { platform: 'vk', verified_actions: ['link_in_body'], proof_ref: null })
  assert(claimed.supported === true && claimed.proven === false,
    'запись без proof_ref выдана за проверку — ровно то, против чего заведено поле')

  const proved = capability(vk, 'link_in_body', {
    platform: 'vk', verified_actions: ['link_in_body'],
    proof_ref: 'publication_attempts:1201', checked_at: '2026-09-17T10:00:00Z',
  })
  assert(proved.proven === true && proved.proofRef === 'publication_attempts:1201', 'успешный вызов не засчитан')
  return 'три состояния: не знаем, думаем, проверили'
})

test('переходы не выдаются за измеренные, пока вызов не подтверждён', () => {
  const vk = profileFor('vk')
  const guess = linkAttribution(vk, null)
  assert(guess.proven === false, 'непроверенное поведение ссылки отдано как факт')
  assert(guess.requires.some((r) => r.includes('utm_content')),
    'для ВК нужна метка с идентификатором публикации: реферером придёт сам ВК, а не пост')
  assert(/оценк/i.test(guess.note), 'не сказано, что приписанные переходы — оценка, а не измерение')

  const proved = linkAttribution(vk, { platform: 'vk', verified_actions: ['link_in_body'], proof_ref: 'publication_attempts:7' })
  assert(proved.proven === true, 'подтверждённый вызов не снял оговорку')
  return 'метки обязательны в обоих случаях, разница — в том, как это называть'
})

test('оговорка появляется от содержания, а не по списку', () => {
  const tg = profileFor('telegram')
  const withPrice = requiredDisclosures(tg, 'Год обучения в Болонье — 2 500 евро.')
  const without = requiredDisclosures(tg, 'Разобрали, как устроен приём в итальянские вузы.')
  assert(withPrice.some((d) => d.id === 'price_checked_at'), 'в посте есть цена, а оговорки про дату проверки нет')
  assert(!without.some((d) => d.id === 'price_checked_at'),
    'оговорка про цену в посте без единой суммы — шум, который учит не читать оговорки')
  assert(without.some((d) => d.id === 'not_offer'), 'оговорка «не оферта» обязательна всегда')
  return `${withPrice.length} оговорки с ценой, ${without.length} без неё`
})

/* ── Сборка ───────────────────────────────────────────────────────────────── */

const partsTg = {
  hook: 'Дедлайны в итальянские вузы ближе, чем кажется.',
  thesis: 'Подача на бесплатное место в Италии закрывается раньше, чем начинается приём документов в вузе.',
  body: [
    'Сначала подаётся заявка на грант DSU, и у неё свой срок.',
    'Документы для вуза собираются параллельно, а не после.',
    'Легализация диплома занимает недели и делается заранее.',
  ],
  proof: 'Сроки взяты с сайтов региональных агентств DSU.',
  cta: 'Разобрали порядок по шагам',
  link: 'https://goandstudy.com/blog/kak-poehat-uchitsya-v-italiyu/?utm_source=telegram&utm_medium=post&utm_content=1201',
  disclosures: ['Не оферта: условия поступления определяет вуз.'],
}

test('пост собирается по композиции площадки', () => {
  const post = composePost('telegram', partsTg)
  const ids = post.blocks.map((b) => b.id)
  assert(ids[0] === 'hook', `первый блок «${ids[0]}» — в ленте первая строка решает, читают ли вторую`)
  assert(ids.includes('thesis') && ids.includes('cta'), 'нет тезиса или призыва')
  assert(post.text.includes('— Сначала подаётся'), 'в Телеграме пункты идут списком')
  assert(post.visible.length <= profileFor('telegram').limits.visibleChars, 'видимая часть длиннее, чем показывает лента')
  return `${post.chars} знаков, блоков ${post.blocks.length}`
})

test('ссылка без меток выпускать не даёт', () => {
  const post = composePost('telegram', { ...partsTg, link: 'https://goandstudy.com/blog/kak-poehat-uchitsya-v-italiyu/' })
  const check = checkPost(post, partsTg)
  assert(!check.ok, 'пост со ссылкой без меток прошёл проверку')
  assert(check.problems.some((p) => p.what.includes('без меток')), 'не названа причина')
  return 'без utm переход придёт «ниоткуда» и припишется прямому заходу'
})

test('обещание результата не проходит в пост', () => {
  const post = composePost('telegram', {
    ...partsTg,
    thesis: 'Мы гарантируем поступление в итальянский вуз на бесплатное место.',
  })
  const check = checkPost(post, partsTg)
  assert(!check.ok, 'обещание результата прошло проверку')
  assert(check.problems.some((p) => p.what.includes('guarantee')), 'обещание не опознано как обещание')
  return 'тот же гейт, что у статей'
})

test('картинка меняет предел длины, и это проверяется', () => {
  const long = { ...partsTg, body: [partsTg.body.join(' ').repeat(12)], withImage: true }
  const post = composePost('telegram', long)
  const check = checkPost(post, long)
  assert(post.chars > 1024, 'проверка бессмысленна: текст короче предела подписи')
  assert(check.problems.some((p) => p.level === 'блокирует' && p.what.includes('1024')),
    'с картинкой пост становится подписью, предел 1024 — это не поймано')
  return 'предел 4096 против 1024 с картинкой'
})

test('углы площадок разведены до того, как текст написан', () => {
  const angles = anglesFor(['telegram', 'vk'])
  assert(angles[0].question !== angles[1].question, 'обеим площадкам дан один вопрос — получится один пост дважды')
  assert(angles.every((a) => a.leavesOut), 'не сказано, что каждый угол оставляет другому')
  return `${angles[0].question} / ${angles[1].question}`
})

/* ── Антидубли ────────────────────────────────────────────────────────────── */

const original = `Подача на грант DSU закрывается раньше, чем приём документов в вузе.
Заявка на грант подаётся первой, у неё отдельный срок.
Документы для вуза собираются параллельно, а не после.
Легализация диплома занимает несколько недель.`

test('пересказ теми же словами — это дубль, а не вариант', () => {
  // Синонимы и перестановка: ровно то, что PRD называет не адаптацией
  const retold = `Подача на грант DSU завершается раньше, чем приём бумаг в университете.
Заявление на грант подаётся первым, у него отдельный срок.
Бумаги для университета собираются параллельно, а не после.
Легализация диплома занимает несколько недель.`
  const v = variantsAreDistinct(original, retold)
  assert(!v.ok, `пересказ признан вариантом (совпадение ${Math.round(v.overlap * 100)}%)`)
  assert(v.examples.length > 0, 'человеку не показано, какие именно предложения совпали')
  assert(/угол и глубину/.test(v.why), 'в объяснении не сказано, чем адаптация отличается от пересказа')
  return `совпадение ${Math.round(v.overlap * 100)}%`
})

test('другой угол на тот же материал — это вариант', () => {
  // Тот же пакет, но вопрос другой: не «что делать», а «как устроено»
  const другой = `Региональные агентства DSU и университеты — это две разные очереди.
Грант распределяет регион по доходу семьи, а место на программе — вуз по документам.
Поэтому сроки не совпадают: регион закрывает приём летом, вуз работает до осени.
Тот, кто ждёт решения по гранту, чтобы подать в вуз, теряет год.`
  const v = variantsAreDistinct(original, другой)
  assert(v.ok, `разные углы признаны дублем (совпадение ${Math.round(v.overlap * 100)}%)`)
  return `совпадение ${Math.round(v.overlap * 100)}%`
})

test('короткий пост внутри длинного — тоже дубль', () => {
  const short = 'Заявка на грант подаётся первой, у неё отдельный срок. Документы для вуза собираются параллельно, а не после.'
  const v = variantsAreDistinct(short, original)
  assert(!v.ok, 'короткий текст, целиком вложенный в длинный, признан отдельным вариантом')
  return `совпадение ${Math.round(v.overlap * 100)}% — доля считается от короткого текста`
})

test('отпечаток содержания не зависит от порядка абзацев', () => {
  const shuffled = original.split('\n').reverse().join('\n')
  assert(contentFingerprint(original).hash === contentFingerprint(shuffled).hash,
    'перестановка абзацев изменила отпечаток — тогда по нему нельзя ловить повторы')
  const other = 'Стоимость общежития в Германии зависит от земли и города.'
  assert(contentFingerprint(original).hash !== contentFingerprint(other).hash, 'разные темы дали один отпечаток')
  assert(thesisSimilarity(original, other) < 0.2, 'разные темы признаны похожими')
  return 'порядок не влияет, тема влияет'
})

test('третий раз за месяц один тезис другими словами — повтор', () => {
  const history = [
    { id: 'tg-1', publishedAt: '2026-09-02', platform: 'telegram',
      text: 'Грант DSU закрывает приём заявок раньше, чем университет начинает принимать документы. Заявление на грант подаётся первым.' },
    { id: 'vk-1', publishedAt: '2026-09-11', platform: 'vk',
      text: 'Срок подачи на грант DSU наступает раньше приёма документов в вузе, поэтому заявка на грант подаётся первой.' },
  ]
  const r = findRepeats(original, history, { now: new Date('2026-09-17') })
  assert(r.repeated, `повтор не пойман: ${JSON.stringify(r.hits.map((h) => h.similarity))}`)
  assert(r.hits.length === 2, `найдено ${r.hits.length} совпадений вместо двух`)
  assert(/3-й пост/.test(r.why), `объяснение не называет, который это по счёту: ${r.why}`)
  return r.why
})

test('возвращение к теме через полгода — не повтор', () => {
  const history = [
    { id: 'tg-0', publishedAt: '2026-02-01', platform: 'telegram', text: original },
  ]
  const r = findRepeats(original, history, { now: new Date('2026-09-17') })
  assert(!r.repeated && r.hits.length === 0, 'старый пост за пределами окна посчитан повтором')
  return 'окно 30 дней: вернуться к теме через полгода нормально'
})

test('похожий пост неделю назад — предупреждение, а не запрет', () => {
  const history = [
    { id: 'vk-9', publishedAt: '2026-09-10', platform: 'vk', text: original },
  ]
  const r = findRepeats(original, history, { now: new Date('2026-09-17') })
  assert(!r.repeated, 'одно совпадение заблокировало выпуск — порог в два поста не соблюдён')
  assert(r.hits.length === 1 && /угол стоит сменить/.test(r.why), `нет подсказки про угол: ${r.why}`)
  return r.why
})

test('совпадение считается по смыслу, а не по буквам', () => {
  const a = 'Заявка на грант подаётся первой, у неё отдельный срок.'
  const b = 'У заявки на грант отдельный срок, и подаётся она первой.'
  const r = variantOverlap(a, b)
  assert(r.overlap === 1, `перестановка слов не опознана как то же предложение (${r.overlap})`)
  return 'переставленные слова внутри фразы ничего не меняют'
})

console.log(`\n${passed} пройдено, ${failed} провалено`)
process.exit(failed ? 1 : 0)
