/**
 * Коннектор VK.
 *
 * Написан по разведке `docs/spikes/vk.md`. Главное её открытие вшито сюда и
 * определяет всю форму коннектора: VK режет методы не по выданным правам, а по
 * типу авторизации, и ключ сообщества на стене **умеет только писать**.
 *
 *   wall.post                  ✓
 *   photos.getWallUploadServer ✗ 27: method is unavailable with group auth
 *   wall.getById               ✗ 27
 *   wall.delete                ✗ 27
 *
 * Отсюда три следствия, каждое из которых видно в коде:
 *
 *   1. `prepareMedia` ничего не загружает. Загрузить фотографию ключом
 *      сообщества нельзя, а ключ пользователя живёт сутки и для автопостинга
 *      не годится. Поэтому фотографии готовятся заранее, партией, и сюда
 *      приходит готовый идентификатор вида `photo-123_456`.
 *
 *   2. `reconcile` и `getStatus` не читают стену через API — нечем. Разбор
 *      идёт по публичной странице поста, как у Телеграма, и честно возвращает
 *      «не проверить», когда разметка не опознана.
 *
 *   3. `fetchMetrics` всегда «недоступна». Ноль здесь означал бы «показали
 *      ноль раз», а это другое утверждение.
 *
 * Токен в интерфейс не отдаётся и в логи не попадает: в `channels.secret_ref`
 * лежит имя переменной окружения, а не сам токен.
 */
import type {
  PublishingConnector, Capabilities, Payload, ValidationIssue,
  Outcome, ReconcileResult, RemoteStatus, Metric,
} from './connector'

/** Домен сменился в 2025-м: вызовы идут на api.vk.ru, а не api.vk.com. */
const API = 'https://api.vk.ru/method'
const ВЕРСИЯ = '5.199'

/**
 * Предел текста поста — 16384 по документации. Ставим ниже осознанно:
 * длинные полотна в ленте не читают, а обрезать пост на стороне площадки
 * хуже, чем не дать его написать.
 */
const ПРЕДЕЛ_ТЕКСТА = 4096

const ТАЙМАУТ = 30_000

/** Идентификатор уже загруженной фотографии: photo{owner}_{id}, owner бывает отрицательным. */
export const ВЛОЖЕНИЕ_ФОТО = /^photo-?\d+_\d+$/

/**
 * Дописать метки кампании к ссылке.
 *
 * Для VK это не улучшение отчёта, а единственный способ вообще увидеть
 * переход: площадка переписывает внешние ссылки своим переходником, и
 * реферером приходит сам VK, а не пост. Без меток все переходы сольются в
 * одну безымянную кучу.
 */
export function ссылкаСМетками(link: string, utm: Record<string, string> = {}): string {
  try {
    const u = new URL(link)
    for (const [k, v] of Object.entries(utm)) if (v) u.searchParams.set(k, v)
    return u.toString()
  } catch {
    // Испортить ссылку хуже, чем потерять метки: без меток переход не
    // посчитается, а по испорченной ссылке читатель никуда не попадёт.
    return link
  }
}

/** Ссылка на пост. Минус перед id сообщества обязателен: у сообществ owner_id отрицательный. */
export function ссылкаНаПост(groupId: string | number, postId: string | number): string {
  const g = String(groupId).replace(/^-/, '')
  return `https://vk.com/wall-${g}_${postId}`
}

/**
 * Ответ площадки — в исход.
 *
 * Вынесено отдельно и экспортируется: разбор проверяется на настоящих ответах
 * VK, не делая ни одной публикации. Для площадки без удаления это не
 * педантизм — опубликованный по ошибке пост ключом сообщества не убрать.
 */
export function разобратьОтвет(status: number, json: any, groupId: string): Outcome {
  if (status === 200 && json?.response?.post_id) {
    const id = String(json.response.post_id)
    return { kind: 'опубликовано', remoteId: id, remoteUrl: ссылкаНаПост(groupId, id) }
  }

  const код = json?.error?.error_code ?? status
  const текст = String(json?.error?.error_msg ?? `HTTP ${status}`)

  // 5 — токен не принят или отозван. 27 — ключ от другого сообщества либо
  // метод закрыт для группового доступа. Оба чинятся токеном, а не повтором,
  // но разными действиями, и текст вопроса это сохраняет.
  if (код === 5) return { kind: 'нужна_авторизация', reason: `токен не принят: ${текст}` }
  if (код === 27) return { kind: 'нужна_авторизация', reason: `ключ не подходит этому сообществу: ${текст}` }

  // 15 и 200 — права. 214 — настройки самого сообщества запрещают публикацию
  // от его имени. Повтор не поможет ни в одном случае.
  if (код === 15 || код === 200) return { kind: 'нужна_авторизация', reason: `нет права публикации: ${текст}` }
  if (код === 214) return { kind: 'отказано', reason: `сообщество запретило публикации от своего имени: ${текст}`, code: код }

  // 6 — слишком часто, 9 — антифлуд на повторяющемся содержимом. Второе важно
  // отличать: это не сбой, а VK опознал наш текст как дубль уже стоящего
  // поста. Повторять тот же текст бессмысленно, но через время — уместно.
  if (код === 6) return { kind: 'повторить_позже', reason: `слишком часто: ${текст}`, retryAfterSec: 3 }
  if (код === 9) return { kind: 'повторить_позже', reason: `антифлуд, содержимое похоже на уже опубликованное: ${текст}`, retryAfterSec: 3600 }
  if (код === 29) return { kind: 'повторить_позже', reason: `исчерпан лимит вызовов: ${текст}`, retryAfterSec: 600 }

  if (Number(код) >= 500) return { kind: 'повторить_позже', reason: `на стороне площадки: ${текст}`, retryAfterSec: 60 }

  return { kind: 'отказано', reason: текст, code: код }
}

/**
 * Есть ли пост на публичной странице.
 *
 * Через API стену ключом сообщества не прочитать, поэтому смотрим то же, что
 * увидит человек. Разбор вынесен и экспортируется: проверяется на сохранённых
 * ответах, без сети.
 */
export function разобратьСтраницуПоста(html: string, url: string): RemoteStatus {
  if (/Материал удалён|wall_post_deleted|Post not found/i.test(html)) return { kind: 'исчез' }
  // Разметка настоящего поста содержит его дату со ссылкой на себя же.
  if (/post_date|PostHeaderSubtitle|class="wall_post_text"/i.test(html)) return { kind: 'на_месте', remoteUrl: url }
  // Ни того, ни другого. Это «не проверили», а не «исчез»: объявлять пост
  // пропавшим из-за смены чужой вёрстки нельзя — по такому сигналу система
  // начнёт публиковать заново.
  return { kind: 'не_проверить', why: 'разметка страницы не опознана — возможно, изменилась или пост скрыт от гостей' }
}

export class VkConnector implements PublishingConnector {
  readonly platform = 'vk' as const

  constructor(
    private токен: string,
    /** Числовой id сообщества, без минуса. Минус подставляется при вызове. */
    private groupId: string,
    private проверено: { proofRef: string | null; checkedAt: string | null } = { proofRef: null, checkedAt: null },
  ) {}

  async capabilities(): Promise<Capabilities> {
    return {
      platform: 'vk',
      formats: ['social_post'],
      maxTextLength: ПРЕДЕЛ_ТЕКСТА,
      // Фотография возможна, но только уже загруженная: сам коннектор
      // загрузить её не может — см. шапку файла.
      supportsPhoto: true,
      linkBehaviour: 'переписывается',
      // guid у wall.post — настоящий ключ повтора: второй вызов с тем же guid
      // не создаёт второй пост. Для площадки без чтения истории это
      // единственная защита от дубля, и она же делает повтор безопасным.
      hasIdempotencyKey: true,
      canReadOwnHistory: false,
      proofRef: this.проверено.proofRef,
      checkedAt: this.проверено.checkedAt,
    }
  }

  validate(payload: Payload, caps: Capabilities): ValidationIssue[] {
    const проблемы: ValidationIssue[] = []
    const текст = payload.text?.trim() ?? ''

    if (!текст && !payload.photoUrl) {
      проблемы.push({ field: 'text', problem: 'пустой пост: нет ни текста, ни фотографии', blocking: true })
    }
    if (текст.length > caps.maxTextLength) {
      проблемы.push({
        field: 'text',
        problem: `${текст.length} символов при пределе ${caps.maxTextLength}`,
        blocking: true,
      })
    }
    // Фотография к этому моменту обязана быть идентификатором, а не ссылкой.
    // Ссылка означала бы, что prepareMedia не отработал, и пост уйдёт без
    // картинки молча — это худший вид ошибки: заметен он только глазами.
    if (payload.photoUrl && !ВЛОЖЕНИЕ_ФОТО.test(payload.photoUrl)) {
      проблемы.push({
        field: 'photoUrl',
        problem: `ожидается готовое вложение вида photo-123_456, пришло «${payload.photoUrl.slice(0, 40)}»`,
        blocking: true,
      })
    }
    if (payload.link && !payload.utm?.utm_source) {
      // Не блокируем: пост со ссылкой без меток лучше, чем отсутствие поста.
      проблемы.push({
        field: 'utm',
        problem: 'ссылка без меток: VK переписывает её переходником, и переход будет не приписать',
        blocking: false,
      })
    }
    return проблемы
  }

  /**
   * Подготовить медиа — точнее, убедиться, что готовить нечего.
   *
   * Загрузка фотографии ключом сообщества закрыта (27), а ключ пользователя
   * живёт сутки и в автопостинге неприменим. Фотографии грузятся партией
   * заранее, отдельной операцией, и сюда приходит готовый идентификатор.
   * Этот метод существует, чтобы поймать нарушение этого договора здесь, а не
   * в момент публикации.
   */
  async prepareMedia(payload: Payload): Promise<Payload> {
    if (!payload.photoUrl) return payload
    if (ВЛОЖЕНИЕ_ФОТО.test(payload.photoUrl)) return payload
    throw new Error(
      'VK: фотографию нельзя загрузить ключом сообщества — нужен готовый идентификатор '
      + `photo-123_456 из партии заготовок, пришло «${payload.photoUrl.slice(0, 60)}»`,
    )
  }

  async publish(payload: Payload, idempotencyKey: string): Promise<Outcome> {
    const части: string[] = []
    if (payload.text?.trim()) части.push(payload.text.trim())
    if (payload.link) части.push(ссылкаСМетками(payload.link, payload.utm ?? {}))
    const текст = части.join('\n\n')

    const u = new URL(`${API}/wall.post`)
    u.searchParams.set('v', ВЕРСИЯ)
    u.searchParams.set('access_token', this.токен)
    u.searchParams.set('owner_id', `-${this.groupId}`)
    // from_group=1 — от имени сообщества. Без него пост уйдёт от имени
    // человека, чей ключ, и в ленте это будет видно всем.
    u.searchParams.set('from_group', '1')
    u.searchParams.set('message', текст)
    // guid — ключ повтора самой площадки. Именно он делает безопасным повтор
    // после неизвестного исхода.
    u.searchParams.set('guid', idempotencyKey.slice(0, 64))
    if (payload.photoUrl) u.searchParams.set('attachments', payload.photoUrl)

    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(ТАЙМАУТ), cache: 'no-store' })
      const json = await res.json().catch(() => null)
      return разобратьОтвет(res.status, json, this.groupId)
    } catch (e: any) {
      // Запрос ушёл, ответ не дошёл. Опубликовано или нет — неизвестно, и
      // соврать здесь дороже всего: удалить лишний пост ключом сообщества
      // нельзя. Спасает guid — повтор с тем же ключом второго поста не даст.
      const почему = e?.name === 'TimeoutError'
        ? `wall.post не ответил за ${ТАЙМАУТ / 1000} с`
        : 'wall.post: сеть недоступна'
      return { kind: 'исход_неизвестен', reason: почему }
    }
  }

  /**
   * Разобрать неизвестный исход.
   *
   * Через API нечем: `wall.getById` ключу сообщества закрыт. Но guid у
   * `wall.post` — настоящий ключ повтора, поэтому правильное действие здесь
   * не «искать», а «повторить с тем же ключом»: если пост прошёл, второго не
   * появится. Это и говорим вызывающему, вместо того чтобы притворяться, что
   * проверили.
   */
  async reconcile(idempotencyKey: string, sentAt: Date): Promise<ReconcileResult> {
    void idempotencyKey; void sentAt
    return {
      kind: 'выяснить_нечем',
      why: 'ключу сообщества закрыт wall.getById (ошибка 27). Безопасный выход — повторить '
        + 'wall.post с тем же guid: площадка сама не создаст второй пост',
    }
  }

  async getStatus(remoteId: string): Promise<RemoteStatus> {
    const url = ссылкаНаПост(this.groupId, remoteId)
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(ТАЙМАУТ), cache: 'no-store' })
      if (res.status === 404) return { kind: 'исчез' }
      if (!res.ok) return { kind: 'не_проверить', why: `страница поста ответила ${res.status}` }
      return разобратьСтраницуПоста(await res.text(), url)
    } catch {
      return { kind: 'не_проверить', why: 'страница поста недоступна' }
    }
  }

  async fetchMetrics(remoteId: string, date: string): Promise<Metric[]> {
    // Просмотры и лайки лежат в wall.getById, а он ключу сообщества закрыт.
    // Ноль здесь означал бы «показали ноль раз» — другое утверждение, и в
    // отчёте разница видна.
    void remoteId; void date
    return [
      { name: 'views', value: null, completeness: 'недоступна', why: 'wall.getById закрыт для ключа сообщества (27)' },
      { name: 'likes', value: null, completeness: 'недоступна', why: 'wall.getById закрыт для ключа сообщества (27)' },
    ]
  }
}
