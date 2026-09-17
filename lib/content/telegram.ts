/**
 * Коннектор Telegram.
 *
 * Написан по разведке `docs/spikes/telegram.md`, и главный её вывод вшит сюда
 * честно: у Bot API нет ключа идемпотентности и нет чтения истории, поэтому
 * `reconcile` возвращает «выяснить нечем», а не притворяется, что проверил.
 * Соврать здесь означало бы получить второй пост в канале.
 *
 * Токен в интерфейс не отдаётся и в логи не попадает: в `channels.secret_ref`
 * лежит имя переменной окружения, а не сам токен.
 */
import type {
  PublishingConnector, Capabilities, Payload, ValidationIssue,
  Outcome, ReconcileResult, RemoteStatus, Metric,
} from './connector'

/** Предел длины подписи к фото меньше, чем у обычного сообщения. */
const ПРЕДЕЛ_ТЕКСТА = 4096
const ПРЕДЕЛ_ПОДПИСИ = 1024

const API = 'https://api.telegram.org'

/**
 * Дописать метки кампании к ссылке.
 *
 * Без меток переход не приписать: реферер из приложения не приходит, и по нему
 * не отличить один пост от другого. Метки — единственный способ, а не
 * дополнительный.
 */
export function ссылкаСМетками(link: string, utm: Record<string, string> = {}): string {
  try {
    const u = new URL(link)
    for (const [k, v] of Object.entries(utm)) if (v) u.searchParams.set(k, v)
    return u.toString()
  } catch {
    // Ссылка не разобралась — возвращаем как была. Испортить ссылку хуже,
    // чем потерять метки: без меток переход не посчитается, а с испорченной
    // ссылкой читатель никуда не попадёт.
    return link
  }
}

/** Публичный адрес поста. Только для каналов с именем: у приватных его нет. */
export function ссылкаНаПост(channelUsername: string | null, messageId: number | string): string | null {
  if (!channelUsername) return null
  const имя = channelUsername.replace(/^@/, '')
  return `https://t.me/${имя}/${messageId}`
}

export class TelegramConnector implements PublishingConnector {
  readonly platform = 'telegram' as const

  constructor(
    private readonly чат: string,
    private readonly токен: string | null,
    private readonly имяКанала: string | null = null,
    private readonly caps: Capabilities | null = null,
  ) {}

  async capabilities(): Promise<Capabilities> {
    // Значения из документации. Пока нет proofRef, всё это — «мы так думаем»:
    // документация описывает намерение авторов площадки, а не поведение
    // конкретного аккаунта с конкретным токеном.
    return this.caps ?? {
      platform: 'telegram',
      formats: ['social_post'],
      maxTextLength: ПРЕДЕЛ_ТЕКСТА,
      supportsPhoto: true,
      linkBehaviour: 'как_есть',
      hasIdempotencyKey: false,
      canReadOwnHistory: false,
      proofRef: null,
      checkedAt: null,
    }
  }

  validate(payload: Payload, caps: Capabilities): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const предел = payload.photoUrl ? ПРЕДЕЛ_ПОДПИСИ : caps.maxTextLength

    if (!payload.text?.trim()) {
      issues.push({ field: 'text', problem: 'пустой текст', blocking: true })
    }
    if (payload.text && payload.text.length > предел) {
      issues.push({
        field: 'text',
        problem: payload.photoUrl
          ? `подпись к фото длиннее ${ПРЕДЕЛ_ПОДПИСИ} знаков (${payload.text.length}) — с фото предел меньше, чем без него`
          : `длиннее ${предел} знаков (${payload.text.length})`,
        blocking: true,
      })
    }
    if (payload.photoUrl && !caps.supportsPhoto) {
      issues.push({ field: 'photoUrl', problem: 'площадка не принимает фото', blocking: true })
    }
    if (payload.link && !payload.utm?.utm_content) {
      // Не блокируем: пост без меток лучше, чем отсутствие поста. Но переход
      // по нему приписать будет нечем, и знать об этом надо заранее.
      issues.push({
        field: 'utm',
        problem: 'нет utm_content с идентификатором публикации — переходы по этой ссылке приписать будет нечем',
        blocking: false,
      })
    }
    if (caps.linkBehaviour === 'не_поддерживаются' && payload.link) {
      issues.push({ field: 'link', problem: 'площадка не отдаёт ссылки', blocking: true })
    }
    return issues
  }

  async prepareMedia(payload: Payload): Promise<Payload> {
    // Telegram скачивает картинку по адресу сам — готовить нечего.
    return payload
  }

  async publish(payload: Payload, idempotencyKey: string): Promise<Outcome> {
    if (!this.токен) return { kind: 'нужна_авторизация', reason: 'токен не задан' }

    const текст = payload.link
      ? `${payload.text}\n\n${ссылкаСМетками(payload.link, payload.utm)}`
      : payload.text

    const метод = payload.photoUrl ? 'sendPhoto' : 'sendMessage'
    const тело: Record<string, unknown> = payload.photoUrl
      ? { chat_id: this.чат, photo: payload.photoUrl, caption: текст }
      : { chat_id: this.чат, text: текст }

    try {
      const res = await fetch(`${API}/bot${this.токен}/${метод}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(тело),
      })
      const json: any = await res.json().catch(() => ({}))
      return разобратьОтвет(res.status, json, this.имяКанала)
    } catch (e: any) {
      // Сетевой обрыв. Отличить «не дошло до Телеграма» от «дошло, а ответ
      // потерялся» нечем, и притворяться, что можно, — самый дорогой способ
      // получить второй пост.
      return { kind: 'исход_неизвестен', reason: `сеть: ${String(e?.message ?? e)}` }
    }
  }

  async reconcile(): Promise<ReconcileResult> {
    // Честный ответ, а не пустая проверка. Bot API не даёт ни ключа повтора,
    // ни чтения истории: метода «покажи последние сообщения канала» нет.
    return {
      kind: 'выяснить_нечем',
      why: 'Bot API не даёт ни ключа идемпотентности, ни чтения истории канала — '
        + 'проверить, ушёл ли пост, нечем. Смотреть в канале человеку.',
    }
  }

  async getStatus(remoteId: string): Promise<RemoteStatus> {
    // «Принял API» не то же самое, что «видно в канале». Проверить вторым
    // вызовом нечем: getMessage в Bot API нет.
    return {
      kind: 'не_проверить',
      why: `Bot API не позволяет запросить сообщение #${remoteId} повторно. `
        + (this.имяКанала ? 'Проверять по публичной ссылке.' : 'У приватного канала публичной ссылки нет.'),
    }
  }

  async fetchMetrics(remoteId: string, date: string): Promise<Metric[]> {
    // Просмотры поста Bot API не отдаёт. Это недоступность, а не ноль:
    // ноль означает «показали ноль раз», и разница видна в отчёте.
    void remoteId; void date
    return [
      { name: 'views', value: null, completeness: 'недоступна', why: 'Bot API не отдаёт просмотры поста' },
      { name: 'forwards', value: null, completeness: 'недоступна', why: 'Bot API не отдаёт пересылки' },
    ]
  }
}

/**
 * Ответ площадки — в исход.
 *
 * Разбор вынесен отдельно и экспортируется: так его можно проверить на
 * настоящих ответах Телеграма, не делая ни одной публикации.
 */
export function разобратьОтвет(status: number, json: any, имяКанала: string | null): Outcome {
  if (status === 200 && json?.ok) {
    const id = json.result?.message_id
    return {
      kind: 'опубликовано',
      remoteId: String(id),
      remoteUrl: ссылкаНаПост(имяКанала, id),
    }
  }

  const код = json?.error_code ?? status
  const текст = String(json?.description ?? `HTTP ${status}`)

  // 401 и 403 — про доступ, и они разные. 401 — токен не тот; 403 — токен
  // тот, но бот не админ канала или его оттуда убрали. Повтор не поможет ни в
  // одном случае, но чинятся они по-разному, и в тексте вопроса это видно.
  if (код === 401) return { kind: 'нужна_авторизация', reason: `токен не принят: ${текст}` }
  if (код === 403) return { kind: 'нужна_авторизация', reason: `доступа к каналу нет: ${текст}` }

  if (код === 429) {
    // Телеграм говорит, сколько ждать. Своя оценка тут хуже: она либо слишком
    // мала и повтор снова упрётся, либо слишком велика и слот уйдёт.
    const сек = Number(json?.parameters?.retry_after ?? 30)
    return { kind: 'повторить_позже', reason: `слишком часто: ${текст}`, retryAfterSec: сек }
  }

  if (код >= 500) return { kind: 'повторить_позже', reason: `на стороне площадки: ${текст}`, retryAfterSec: 60 }

  // 400 и прочие — отказ по существу: слишком длинно, чат не найден, разметка
  // битая. Повтор того же даст то же самое.
  return { kind: 'отказано', reason: текст, code: код }
}
