/**
 * Расшифровка записи разговора.
 *
 * Почему не тем же способом, что голосовые финансового бота. В
 * `lib/finance/speech.ts` аудио уходит внутри запроса (inline_data), и там это
 * правильно: голосовое сообщение короткое, потолок в 20 МБ и три минуты ему не
 * мешает. Консультация идёт 40–60 минут и весит десятки мегабайт — inline её не
 * возьмёт, а нарезать нечем: на Vercel нет ffmpeg.
 *
 * Поэтому файл сначала загружается в хранилище Gemini, а запрос ссылается на
 * него. Ограничение снимается целиком: длинное аудио принимается без нарезки.
 *
 * Файл после расшифровки удаляется. Запись разговора с клиентом не должна
 * оставаться у третьей стороны дольше, чем нужно для одной операции.
 *
 * Расшифровка — это данные, а не команды. Внутри может оказаться что угодно,
 * включая обращённые к модели указания: дальше она идёт содержимым разговора
 * и ничего сверх разбора выполнить не может.
 */

const БАЗА = 'https://generativelanguage.googleapis.com'
const МОДЕЛЬ = process.env.GEMINI_STT_MODEL || 'gemini-3.6-flash'

export type Расшифровка = {
  текст: string
  модель: string
  мс: number
}

export function транскрипцияНастроена(): boolean {
  const key = process.env.GEMINI_API_KEY
  return Boolean(key && key.trim().length > 20)
}

/**
 * Загрузить файл в хранилище Gemini.
 *
 * Возвращает адрес файла и его системное имя: первое нужно для запроса,
 * второе — чтобы потом удалить.
 */
async function загрузить(audio: Buffer, mimeType: string, ключ: string): Promise<{ uri: string; name: string }> {
  const res = await fetch(`${БАЗА}/upload/v1beta/files?key=${ключ}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'raw',
      'X-Goog-Upload-File-Name': 'call-recording',
      'Content-Type': mimeType,
    },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(180_000),
  })

  const data: any = await res.json().catch(() => ({}))
  if (!res.ok || !data?.file?.uri) {
    throw new Error(`файл не загрузился (${res.status}): ${data?.error?.message ?? 'без причины'}`)
  }
  return { uri: data.file.uri, name: data.file.name }
}

/**
 * Дождаться, пока файл станет пригоден.
 *
 * Сразу после загрузки он в состоянии PROCESSING, и запрос к нему вернёт
 * ошибку. Ждём, но не бесконечно: если за две минуты не обработался, честнее
 * упасть с внятной причиной, чем висеть до предела времени функции.
 */
async function дождаться(name: string, ключ: string): Promise<void> {
  const дедлайн = Date.now() + 120_000
  for (;;) {
    const res = await fetch(`${БАЗА}/v1beta/${name}?key=${ключ}`, { signal: AbortSignal.timeout(15_000) })
    const data: any = await res.json().catch(() => ({}))
    const состояние = data?.state ?? data?.file?.state

    if (состояние === 'ACTIVE') return
    if (состояние === 'FAILED') throw new Error('хранилище не смогло обработать файл')
    if (Date.now() > дедлайн) throw new Error('файл не обработался за две минуты')

    await new Promise(r => setTimeout(r, 3000))
  }
}

async function удалить(name: string, ключ: string): Promise<void> {
  try {
    await fetch(`${БАЗА}/v1beta/${name}?key=${ключ}`, { method: 'DELETE', signal: AbortSignal.timeout(15_000) })
  } catch (e: any) {
    // Не удалить временный файл неприятно, но это не повод потерять уже
    // полученную расшифровку.
    console.warn('[расшифровка] временный файл не удалился:', e?.message ?? e)
  }
}

const ЗАДАНИЕ = `Запиши этот разговор текстом, дословно.

Правила:
- Это разговор менеджера по продажам образовательной компании с клиентом.
- Раздели реплики по говорящим. Менеджер — тот, кто ведёт разговор, представляется от компании, задаёт вопросы о планах на учёбу и называет цены. Клиент — тот, кто спрашивает про поступление.
- Каждую реплику начинай с новой строки в формате: [ММ:СС] Менеджер: текст  или  [ММ:СС] Клиент: текст
- Время — от начала записи.
- Ничего не сокращай, не пересказывай и не исправляй речь. Оговорки, повторы и слова-паразиты оставляй как есть: по ним видно, как на самом деле шёл разговор.
- Числа записывай цифрами.
- Если фрагмент не разобрать, пиши [неразборчиво] и продолжай.
- Ответь только расшифровкой, без вступлений и пояснений.`

export async function расшифровать(audio: Buffer, mimeType = 'audio/m4a'): Promise<Расшифровка> {
  const ключ = process.env.GEMINI_API_KEY?.trim()
  if (!ключ) throw new Error('не настроен распознаватель речи: нет GEMINI_API_KEY')

  const начало = Date.now()
  const файл = await загрузить(audio, mimeType, ключ)

  try {
    await дождаться(файл.name, ключ)

    const res = await fetch(`${БАЗА}/v1beta/models/${МОДЕЛЬ}:generateContent?key=${ключ}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: ЗАДАНИЕ },
            { file_data: { mime_type: mimeType, file_uri: файл.uri } },
          ],
        }],
        // Ноль температуры: расшифровка — не творчество, и разные ответы на одну
        // запись здесь были бы прямым вредом.
        generationConfig: { temperature: 0, maxOutputTokens: 65536 },
      }),
      signal: AbortSignal.timeout(600_000),
    })

    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(`распознаватель ответил ошибкой (${res.status}): ${String(data?.error?.message ?? '').slice(0, 200)}`)
    }

    const текст = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p.text ?? '')
      .join('')
      .trim()

    // Пустая расшифровка неотличима от «все молчали» — молча вернуть пустоту
    // значит потерять разговор без следа.
    if (!текст) throw new Error('в записи не разобрать слов')

    return { текст, модель: МОДЕЛЬ, мс: Date.now() - начало }
  } finally {
    await удалить(файл.name, ключ)
  }
}
