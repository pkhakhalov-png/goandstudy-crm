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

  // Только свежие падения.
  //
  // Раньше брались все, и это ломало сторожа изнутри: упавшая задача остаётся
  // упавшей навсегда, ключ `failed:<id>` протухает через шесть часов, и одно и
  // то же падение уходило в чат каждые шесть часов до скончания века. Чистка
  // хвостов через неделю делала только хуже — на восьмой день старая беда
  // приходила как новая. Семнадцать давних падений в очереди означали бы
  // семнадцать сообщений четыре раза в сутки, и к третьему дню их перестали бы
  // читать — ровно то, чего этот модуль пытается избежать.
  //
  // Старые падения никуда не деваются: они видны на экране «Конвейер» и в
  // доле ошибок по дорожке. Сторож говорит о новостях, а не об архиве.
  const failedSince = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: failed } = await seo.from('jobs')
    .select('id, step, attempts, max_attempts, last_error, article_id, created_at')
    .eq('status', 'failed').gte('created_at', failedSince)
    .order('id', { ascending: false }).limit(20)

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

  // ── Голодание дорожек и бюджет ──────────────────────────────────────────
  //
  // Считаются тем же модулем, что и экран «Конвейер». Это важнее, чем экономия
  // кода: сторож и экран, которые считают здоровье по-своему, рано или поздно
  // разойдутся, и тогда человек будет видеть на экране «в норме» при пришедшем
  // тревожном сообщении — и перестанет верить обоим.
  try {
    const { queueHealth, laneIsStale } = await import('./health')
    const health = await queueHealth(seo)

    for (const l of health.lanes) {
      if (!laneIsStale(l)) continue
      alerts.push({
        // Ключ без возраста: иначе каждая минута ожидания выглядела бы новой
        // бедой и сообщения шли бы потоком до самой починки.
        key: `lane-stale:${l.lane}`,
        title: `Дорожка «${l.lane}» стоит`,
        detail: `старейшая ждущая задача не берётся уже ${l.oldestPendingMin} минут; ждут ${l.pendingDue} по сроку`,
      })
    }

    for (const b of health.budget ?? []) {
      if (b.left > b.limit * 0.1) continue
      const spent = b.left <= 0
      alerts.push({
        // Область содержит дату, поэтому назавтра сообщение придёт заново —
        // и это правильно: новый день, новый лимит, новая беда.
        key: `budget:${b.scope}`,
        title: spent ? `Бюджет исчерпан (${b.scope})` : `Бюджет на исходе (${b.scope})`,
        detail: spent
          ? `лимит ${b.limit.toFixed(2)} $ выбран полностью. Платные шаги встанут, пока лимит не поднимут.`
          : `осталось ${b.left.toFixed(2)} $ из ${b.limit.toFixed(2)} $`,
      })
    }
  } catch (e: any) {
    // Здоровье не посчиталось — это само по себе повод сказать, а не повод
    // промолчать: сторож, который тихо не проверил, хуже отсутствующего.
    alerts.push({
      key: 'health-unavailable',
      title: 'Не удалось оценить состояние конвейера',
      detail: String(e?.message ?? e).slice(0, 200),
    })
  }

  // Запас фотографий для VK на исходе.
  //
  // Особая беда: она не ломает ничего сегодня и потому не видна. Загрузить
  // фотографию в момент публикации VK не даёт — ключ сообщества этого не
  // умеет, а ключ пользователя живёт сутки (docs/spikes/vk.md). Значит запас
  // пополняется только человеком, вручную, и узнать об этом он должен ЗАРАНЕЕ.
  // Молчание ленты через неделю — слишком поздний способ узнать.
  //
  // Порог в три штуки выбран по ритму: при посте раз в двое суток это шесть
  // дней на то, чтобы найти полчаса. Ключ тревоги содержит остаток, поэтому на
  // каждое следующее значение приходит новое сообщение, а не повтор старого.
  const { data: vkFlow } = await seo.from('settings').select('value').eq('key', 'vk_flow').maybeSingle()
  if ((vkFlow?.value as any)?.enabled) {
    const { count: left, error: poolErr } = await seo.from('vk_photo_pool')
      .select('*', { count: 'exact', head: true }).is('used_at', null)
    // Таблицы нет — миграция не применена. Молчим: об этом скажет сам шаг,
    // упав с прямым указанием на файл, и дублировать это тревогой не нужно.
    if (!poolErr && (left ?? 0) <= 3) {
      alerts.push({
        key: `vk_pool:${left}`,
        title: left === 0
          ? 'Картинки для VK кончились — поток встал'
          : `Картинки для VK на исходе: осталось ${left}`,
        detail: left === 0
          ? 'Публикации в VK остановлены: постить нечем. Нужна новая партия заготовок.'
          : `Хватит примерно на ${(left ?? 0) * 2} дня. Загрузить новую партию можно только `
            + 'с ключом пользователя VK — он живёт сутки, поэтому это делается руками.',
      })
    }
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
  await seo.from('settings').upsert({ key: 'alerts_sent', value: next }, { onConflict: 'key' }).throwOnError()

  // Если отправить не вышло, не помечаем как сказанное — иначе беда утонет
  if (!ok) return { sent: 0, suppressed: alerts.length - fresh.length }
  return { sent: fresh.length, suppressed: alerts.length - fresh.length }
}
