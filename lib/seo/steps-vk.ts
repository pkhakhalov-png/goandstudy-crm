/**
 * Самостоятельный выпуск в VK.
 *
 * Сделан по образцу `article_autopublish`: дешёвый шаг, который ставится в
 * очередь раз в час и сам решает, пора ли. Расписание не хранится нигде
 * отдельно — пауза считается от факта последней публикации, а не от плана.
 * Разница важна при перезапуске воркера: план можно проспать и наверстать
 * двойным выпуском, факт — нельзя.
 *
 * Чем этот поток отличается от статей на сайте. Там шаг решает, ЧТО выпускать,
 * из очереди готовых статей. Здесь выбирать не из чего: пост привязан к
 * заранее загруженной фотографии, потому что загрузить её в момент публикации
 * невозможно — ключ сообщества этого не умеет, а ключ пользователя живёт сутки
 * (docs/spikes/vk.md). Поэтому очередь публикаций — это и есть запас
 * фотографий, и кончается он молча, если за остатком не следить. За остатком
 * следит сторож: см. `collectAlerts`.
 */
import { registerStep, type Job, type StepOutcome } from './steps'
import { VkConnector } from '@/lib/content/vk'
import { ПУБЛИКАЦИЯ } from '@/lib/content/platforms'

/** Настройки потока. Ключ `vk_flow` в seo.settings. */
type VkFlow = {
  /** Выключено по умолчанию: включение — решение человека, а не следствие выкатки. */
  enabled: boolean
  /** Пауза между постами. Двое суток — то, о чём договаривались. */
  everyHours: number
  /** Числовой id сообщества, без минуса. */
  groupId: string
}

const ПО_УМОЛЧАНИЮ: VkFlow = { enabled: false, everyHours: 48, groupId: '' }

export async function loadVkFlow(seo: any): Promise<VkFlow> {
  const { data } = await seo.from('settings').select('value').eq('key', 'vk_flow').maybeSingle()
  return { ...ПО_УМОЛЧАНИЮ, ...((data?.value as any) ?? {}) }
}

/**
 * Текст поста из того, что есть у статьи.
 *
 * Заходы чередуются по номеру публикации: одинаковая первая строка у
 * восьмидесяти девяти постов подряд читается как машина, и это замечают
 * раньше, чем любую ошибку в содержании.
 */
const ЗАХОДЫ = [
  'Коротко о том, что спрашивают чаще всего.',
  'Разобрали вопрос, на котором спотыкаются почти все.',
  'Тема, которую откладывают до последнего — и зря.',
  'Собрали в одном месте то, что обычно ищут по форумам.',
]
const КОНЦОВКИ = [
  'Есть вопрос по вашей ситуации — пишите в комментариях.',
  'Если планируете поступать, с этого стоит начать.',
  'Спрашивайте в комментариях, разберём ваш случай.',
  'Сохраните, чтобы не искать потом.',
]

export function текстПоста(
  строка: { title: string; description: string | null },
  номер: number,
): string {
  const части = [строка.title, '', ЗАХОДЫ[номер % ЗАХОДЫ.length]]
  if (строка.description?.trim()) части.push('', строка.description.trim())
  части.push('', КОНЦОВКИ[номер % КОНЦОВКИ.length])
  return части.join('\n')
}

registerStep('vk_autopost', async (_job: Job, seo: any): Promise<StepOutcome> => {
  const flow = await loadVkFlow(seo)
  if (!flow.enabled) {
    return { outcome: 'done', result: { skipped: 'самостоятельный выпуск в VK выключен', cost: 0 } }
  }

  const токен = process.env.VK_ACCESS_TOKEN?.trim()
  if (!токен) {
    // Не падаем: отсутствие токена — это состояние настройки, а не поломка
    // конвейера. Падение здесь каждый час забивало бы сторожа шумом.
    return { outcome: 'done', result: { skipped: 'VK_ACCESS_TOKEN не задан', cost: 0 } }
  }
  if (!flow.groupId) {
    return { outcome: 'done', result: { skipped: 'в настройке vk_flow не указан groupId', cost: 0 } }
  }

  // Пауза считается от факта последней публикации. Именно от публикации, а не
  // от последней потраченной фотографии: неудачная попытка тратит запас, но
  // паузу отсчитывать от неё нельзя — иначе одна ошибка сдвинет весь график.
  const { data: последняя } = await seo.from('vk_photo_pool')
    .select('used_at').not('remote_post_id', 'is', null)
    .order('used_at', { ascending: false }).limit(1).maybeSingle()
  const былаВ = последняя?.used_at ? Date.parse(последняя.used_at) : 0
  const пораВ = былаВ + flow.everyHours * 3600 * 1000
  if (Date.now() < пораВ) {
    const часов = Math.round((пораВ - Date.now()) / 36e5)
    return { outcome: 'done', result: { skipped: `следующий пост через ${часов} ч`, cost: 0 } }
  }

  const { data: свободные } = await seo.from('vk_photo_pool')
    .select('id, slug, article_url, title, description, attachment')
    .is('used_at', null).order('id').limit(1)
  const строка = свободные?.[0]
  if (!строка) {
    // Запас кончился. Тревогу поднимает сторож — он это делает заранее, на
    // остатке в три штуки, и повторяет не чаще раза в шесть часов. Здесь
    // молчим, чтобы не дублировать одно и то же сообщение каждый час.
    return { outcome: 'done', result: { skipped: 'запас фотографий пуст', cost: 0 } }
  }

  const { count: выпущено } = await seo.from('vk_photo_pool')
    .select('*', { count: 'exact', head: true }).not('remote_post_id', 'is', null)

  const connector = new VkConnector(токен, flow.groupId)
  const payload = {
    text: текстПоста(строка, выпущено ?? 0),
    photoUrl: строка.attachment,
    link: строка.article_url,
    utm: { utm_source: 'vk', utm_medium: 'social', utm_campaign: 'blog' },
  }

  const caps = await connector.capabilities()
  const блокеры = connector.validate(payload, caps).filter((и) => и.blocking)
  if (блокеры.length) {
    return {
      outcome: 'failed',
      result: { error: `пост не прошёл проверку: ${блокеры.map((и) => `${и.field}: ${и.problem}`).join('; ')}`, cost: 0 },
    }
  }

  // Фотографию помечаем потраченной ДО отправки.
  //
  // Порядок тот же, что у попыток публикации в контракте коннектора, и по той
  // же причине: если процесс умрёт сразу после wall.post, а отметки не будет,
  // следующий проход возьмёт ту же фотографию и опубликует второй пост. Удалить
  // его ключом сообщества нельзя. Потерять одну фотографию из запаса дешевле,
  // чем получить дубль в ленте у тысячи трёхсот подписчиков.
  await seo.from('vk_photo_pool').update({ used_at: new Date().toISOString() }).eq('id', строка.id).throwOnError()

  const исход = await connector.publish(payload, `vk:${строка.slug}`)

  if (исход.kind === 'опубликовано') {
    await seo.from('vk_photo_pool')
      .update({ remote_post_id: исход.remoteId, remote_url: исход.remoteUrl })
      .eq('id', строка.id)

    // Право публикации доказано — и доказано единственным возможным способом.
    // Экран подключений пишет «подключено» только после живого вызова; для VK
    // таким вызовом может быть исключительно состоявшийся пост, потому что
    // права ключа сообщества по API не спросить (account.getAppPermissions
    // работает для пользовательских токенов). Пишем это сюда сами — иначе
    // карточка VK навсегда останется в состоянии «доступ есть, публикация не
    // доказана», хотя посты идут.
    //
    // Ошибку записи глотаем: пост уже ушёл, и ронять из-за неё шаг значит
    // получить повтор публикации ради строчки на экране.
    try {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const content = (await createAdminClient()).schema('content' as any)
      await content.from('connector_capabilities').upsert({
        platform: 'vk',
        account_external_id: '*',
        verified_formats: ['social_post'],
        verified_actions: ['auth', ПУБЛИКАЦИЯ],
        checked_at: new Date().toISOString(),
        proof_ref: `wall.post опубликовал ${исход.remoteUrl ?? исход.remoteId}`.slice(0, 500),
      }, { onConflict: 'platform,account_external_id' })
    } catch { /* экран подождёт, публикация важнее */ }

    const осталось = (await seo.from('vk_photo_pool')
      .select('*', { count: 'exact', head: true }).is('used_at', null)).count ?? 0

    return {
      outcome: 'done',
      result: { published: исход.remoteUrl, slug: строка.slug, poolLeft: осталось, cost: 0 },
    }
  }

  if (исход.kind === 'повторить_позже') {
    // Фотография уже помечена потраченной, и возвращать её в запас нельзя:
    // между отметкой и ответом пост мог уйти. Повтор возьмёт следующую.
    return { outcome: 'retry', result: { error: исход.reason, retryAfterSec: исход.retryAfterSec, cost: 0 } }
  }

  if (исход.kind === 'исход_неизвестен') {
    // Ушёл ли пост — неизвестно, и через API не выяснить. Но у wall.post есть
    // guid, и мы им пользуемся: повтор с тем же ключом второго поста не создаст.
    return { outcome: 'retry', result: { error: `${исход.reason}; повтор безопасен: guid тот же`, cost: 0 } }
  }

  return { outcome: 'failed', result: { error: `${исход.kind}: ${(исход as any).reason}`, slug: строка.slug, cost: 0 } }
})
