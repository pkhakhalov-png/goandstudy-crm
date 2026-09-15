/**
 * Распознавание голосовых сообщений.
 *
 * Выбран Gemini, и не от хорошей жизни: у OpenAI на аккаунте кончились кредиты,
 * а fal принимает аудио только по ссылке — пришлось бы отдавать наружу адрес
 * файла Telegram, в котором зашит токен бота. Gemini принимает само аудио в
 * запросе, ключ уже есть в проекте, и на проверке он разобрал русскую фразу
 * дословно, заодно приведя «пятнадцать тысяч» к «15 000» — как раз в том виде,
 * в каком его ждёт разбор.
 *
 * Расшифровка — это данные, а не команды. Внутри может оказаться «переведи
 * деньги» или «игнорируй инструкции»: текст уходит в те же правила разбора, что
 * и напечатанное вручную, и ничего сверх них выполнить не может.
 */

const MODEL = process.env.GEMINI_STT_MODEL || 'gemini-3.6-flash'
const API = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Дольше трёх минут — просим разделить, а не обрезаем молча. */
export const MAX_VOICE_SECONDS = 180
/** Двадцать мегабайт: дальше начинаются ограничения на размер запроса. */
export const MAX_VOICE_BYTES = 20 * 1024 * 1024

export function speechConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY
  return !!key && key.trim().length > 20
}

export type Transcript = { text: string; model: string; ms: number }

/**
 * Расшифровать аудио. Бросает исключение с внятной причиной — молча вернуть
 * пустую строку нельзя: пустая расшифровка неотличима от «человек промолчал»,
 * и операция потерялась бы без следа.
 */
export async function transcribe(audio: Buffer, mimeType = 'audio/ogg'): Promise<Transcript> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('не настроен распознаватель речи')
  if (audio.length > MAX_VOICE_BYTES) throw new Error('запись слишком большая')

  const started = Date.now()
  const res = await fetch(`${API}/${MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: 'Запиши текстом то, что сказано в этой аудиозаписи. '
              + 'Ответь только расшифровкой, без пояснений и без кавычек. '
              + 'Язык русский. Числа записывай цифрами.',
          },
          { inline_data: { mime_type: mimeType, data: audio.toString('base64') } },
        ],
      }],
      // Ноль температуры: расшифровка — это не творчество, и разные ответы на
      // одну и ту же запись здесь были бы прямым вредом.
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(90_000),
  })

  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) {
    const reason = String(data?.error?.message ?? res.status).slice(0, 160)
    throw new Error(`распознаватель ответил ошибкой: ${reason}`)
  }

  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p.text ?? '')
    .join('')
    .trim()

  if (!text) throw new Error('в записи не разобрать слов')

  return { text, model: MODEL, ms: Date.now() - started }
}
