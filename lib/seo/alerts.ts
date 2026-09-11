/**
 * Оповещение о поломках конвейера.
 *
 * Смысл не в том, чтобы завести ещё один экран, а в том, чтобы человек узнал
 * о беде, не заходя никуда. Конвейер работает ночью; если он встанет в три
 * часа, до утра об этом никто не узнает — а с ритмом «статья в день» это
 * потерянные сутки.
 *
 * Шлём редко и по делу: одно сообщение на одну беду, повтор не раньше чем
 * через шесть часов. Иначе на третий день уведомления начнут игнорировать,
 * и они перестанут работать совсем.
 */
/** Отправка своим токеном: общий помощник жёстко привязан к одному боту. */
async function sendRaw(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`telegram ${res.status}: ${(await res.text()).slice(0, 120)}`)
}

/**
 * Кому писать. Отдельная переменная, а не общий чат заявок: беда конвейера
 * касается не продавцов, и мешать одно с другим — верный способ, чтобы
 * перестали читать и то и другое.
 */
function alertChat(): string | null {
  // Только свой чат. Запасного варианта нет намеренно: свалить сообщения
  // конвейера в чат заявок — значит мешать работе продавцов ради удобства
  // настройки. Нет отдельного чата — значит уведомлений нет.
  return process.env.SEO_ALERT_CHAT_ID || null
}

/**
 * Бот и чат должны быть от одной пары: токен бота заявок шлёт в чат заявок,
 * общий бот — в свой. Перепутать легко, а ошибка тихая: Telegram отвечает
 * «chat not found», и сообщение просто не приходит.
 */
function alertToken(): string | null {
  return process.env.SEO_ALERT_CHAT_ID ? (process.env.TELEGRAM_BOT_TOKEN ?? null) : null
}

const QUIET_HOURS = 6

export type Alert = {
  key: string
  title: string
  detail: string
}

/** Что считается бедой: задача сдалась окончательно или висит слишком долго. */
export async function collectAlerts(seo: any): Promise<Alert[]> {
  const alerts: Alert[] = []

  const { data: failed } = await seo.from('jobs')
    .select('id, step, attempts, max_attempts, last_error, article_id')
    .eq('status', 'failed').order('id', { ascending: false }).limit(20)

  for (const j of failed ?? []) {
    alerts.push({
      key: `failed:${j.id}`,
      title: `Задача «${j.step}» сдалась после ${j.attempts} попыток`,
      detail: [
        j.article_id ? `статья #${j.article_id}` : null,
        String(j.last_error ?? '').slice(0, 200),
      ].filter(Boolean).join('\n'),
    })
  }

  // Зависшая — та, что взята в работу и не завершилась за полчаса. Очередь
  // разблокирует её через десять минут сама, поэтому получасовое зависание
  // означает, что что-то не так с самим исполнителем.
  const halfHourAgo = new Date(Date.now() - 30 * 60000).toISOString()
  const { data: stuck } = await seo.from('jobs')
    .select('id, step, locked_by, locked_at, attempts')
    .eq('status', 'running').lt('locked_at', halfHourAgo).limit(10)

  for (const j of stuck ?? []) {
    const minutes = Math.round((Date.now() - Date.parse(j.locked_at)) / 60000)
    alerts.push({
      key: `stuck:${j.id}`,
      title: `Задача «${j.step}» висит ${minutes} минут`,
      detail: `исполнитель: ${j.locked_by ?? 'неизвестен'}, попыток ${j.attempts}`,
    })
  }

  // Конвейер молчит: ни одной завершённой задачи за сутки при включённом потоке
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count: recent } = await seo.from('jobs')
    .select('*', { count: 'exact', head: true }).eq('status', 'done').gte('created_at', dayAgo)
  const { data: flow } = await seo.from('settings').select('value').eq('key', 'article_flow').maybeSingle()

  if ((flow?.value as any)?.enabled && (recent ?? 0) === 0) {
    alerts.push({
      key: 'silence',
      title: 'Конвейер молчит сутки',
      detail: 'поток включён, но ни одна задача не завершилась. Похоже, воркер не приходит.',
    })
  }

  return alerts
}

/**
 * Хорошие новости и тупики: то, что человек должен узнать, не заходя в CRM.
 *
 * Конвейер пишет ночью. Если он молчит, статья лежит готовая до тех пор, пока
 * кто-нибудь случайно не откроет экран, — а очередь тем временем упирается в
 * предел вычитки и работа встаёт. Это не поломка, поэтому и тон другой.
 */
export async function collectNews(seo: any): Promise<Alert[]> {
  const news: Alert[] = []

  const { data: ready, error } = await seo.from('articles')
    .select('id, primary_keyword, status, created_at')
    .eq('status', 'ready_for_review').order('id')
  // Молча вернуть пусто — худшее, что может сделать сторож: он тогда
  // «не видит» бед и выглядит исправным
  if (error) throw new Error(`не прочитать статьи на вычитке: ${error.message}`)

  for (const a of ready ?? []) {
    news.push({
      key: `ready:${a.id}`,
      title: `Статья готова к вычитке: «${a.primary_keyword}»`,
      detail: `crm.goandstudy.com/admin/seo/articles/${a.id}`,
    })
  }

  // Поток встал из-за очереди на вычитку — об этом надо сказать отдельно,
  // иначе выглядит как будто конвейер просто перестал работать
  const { data: flow } = await seo.from('settings').select('value').eq('key', 'article_flow').maybeSingle()
  const settings: any = flow?.value ?? {}
  if (settings.enabled && (ready?.length ?? 0) >= (settings.maxInReview ?? 5)) {
    news.push({
      key: `stalled:${ready!.length}`,
      title: `Конвейер остановлен: на вычитке ${ready!.length}`,
      detail: 'Новые статьи не запускаются, пока не разберёте накопившееся. '
        + 'Это защита от завала, а не поломка: предел настраивается на экране «Статьи».',
    })
  }

  return news
}

/** Отправить то, о чём ещё не говорили. Возвращает, сколько ушло. */
export async function notifyAlerts(seo: any): Promise<{ sent: number; suppressed: number }> {
  // Настройка важнее удобства: о готовой статье сообщать не нужно, если человек
  // и так заходит в CRM. Оставляем по умолчанию только поломки — их пропустить
  // дороже, чем прочитать лишнее.
  const { data: cfg } = await seo.from('settings').select('value').eq('key', 'alerts').maybeSingle()
  const want = { problems: true, news: false, ...((cfg?.value as any) ?? {}) }

  if (!alertChat()) return { sent: 0, suppressed: 0 }

  const [problems, news] = await Promise.all([
    want.problems ? collectAlerts(seo) : Promise.resolve([]),
    want.news ? collectNews(seo) : Promise.resolve([]),
  ])
  const alerts = [...problems, ...news]
  if (!alerts.length) return { sent: 0, suppressed: 0 }

  const { data: state } = await seo.from('settings').select('value').eq('key', 'alerts_sent').maybeSingle()
  const sentBefore: Record<string, string> = (state?.value as any) ?? {}
  const now = Date.now()

  const fresh = alerts.filter((a) => {
    const last = sentBefore[a.key] ? Date.parse(sentBefore[a.key]) : 0
    // О готовой статье напоминаем раз в сутки: она никуда не денется, а частые
    // напоминания о том же превращаются в шум
    const quiet = a.key.startsWith('ready:') ? 24 : QUIET_HOURS
    return now - last > quiet * 3600 * 1000
  })

  if (!fresh.length) return { sent: 0, suppressed: alerts.length }

  const broken = fresh.filter((a) => a.key.startsWith('failed:') || a.key.startsWith('stuck:') || a.key === 'silence')
  const good = fresh.filter((a) => !broken.includes(a))

  const text = [
    broken.length ? `⚠️ Конвейер: ${broken.length === 1 ? 'поломка' : `поломок ${broken.length}`}` : '📄 Конвейер',
    '',
    ...broken.slice(0, 5).map((a) => `• ${a.title}\n${a.detail}`),
    broken.length && good.length ? '' : null,
    ...good.slice(0, 8).map((a) => `• ${a.title}\n${a.detail}`),
    '',
    'Разбор: crm.goandstudy.com/admin/seo/articles',
  ].filter((l) => l !== null).join('\n')

  const chat = alertChat()
  const token = alertToken()
  const ok = chat && token
    ? await sendRaw(token, chat, text).then(() => true).catch(() => false)
    : false

  const next = { ...sentBefore }
  if (ok) for (const a of fresh) next[a.key] = new Date().toISOString()
  // Чистим хвосты, чтобы запись не росла бесконечно
  for (const k of Object.keys(next)) {
    if (now - Date.parse(next[k]) > 7 * 864e5) delete next[k]
  }
  await seo.from('settings').upsert({ key: 'alerts_sent', value: next }, { onConflict: 'key' })

  // Если отправить не вышло, не помечаем как сказанное — иначе беда утонет
  if (!ok) return { sent: 0, suppressed: alerts.length - fresh.length }
  return { sent: fresh.length, suppressed: alerts.length - fresh.length }
}
