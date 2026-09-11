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
import { sendTelegramMessage } from '../telegram'

/**
 * Кому писать. Отдельная переменная, а не общий чат заявок: беда конвейера
 * касается не продавцов, и мешать одно с другим — верный способ, чтобы
 * перестали читать и то и другое.
 */
function alertChat(): string | null {
  return process.env.SEO_ALERT_CHAT_ID || process.env.TELEGRAM_BOOKINGS_CHAT_ID || null
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

/** Отправить то, о чём ещё не говорили. Возвращает, сколько ушло. */
export async function notifyAlerts(seo: any): Promise<{ sent: number; suppressed: number }> {
  const alerts = await collectAlerts(seo)
  if (!alerts.length) return { sent: 0, suppressed: 0 }

  const { data: state } = await seo.from('settings').select('value').eq('key', 'alerts_sent').maybeSingle()
  const sentBefore: Record<string, string> = (state?.value as any) ?? {}
  const now = Date.now()

  const fresh = alerts.filter((a) => {
    const last = sentBefore[a.key] ? Date.parse(sentBefore[a.key]) : 0
    return now - last > QUIET_HOURS * 3600 * 1000
  })

  if (!fresh.length) return { sent: 0, suppressed: alerts.length }

  const text = [
    fresh.length === 1 ? '⚠️ Конвейер: поломка' : `⚠️ Конвейер: ${fresh.length} поломки`,
    '',
    ...fresh.slice(0, 5).map((a) => `• ${a.title}\n${a.detail}`),
    '',
    'Разбор: crm.goandstudy.com/admin/seo/articles',
  ].join('\n')

  const chat = alertChat()
  const ok = chat
    ? await sendTelegramMessage(chat, text).then(() => true).catch(() => false)
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
