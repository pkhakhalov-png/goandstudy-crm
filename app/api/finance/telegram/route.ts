import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { KIND_NAMES, kindIcon, signedAmount } from '@/lib/finance/kinds'
import { formatMinor, type Currency } from '@/lib/finance/money'
import { parseMessage, type Candidate } from '@/lib/finance/parse'
import {
  tgAnswerCallback, tgSend, tgGetFileUrl, senderName,
  type TgMessage, type TgUpdate,
} from '@/lib/finance/telegram'
import { balances, postTransaction, reverseTransaction } from '@/lib/finance/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Вебхук финансового бота.
 *
 * Порядок шагов взят из PRD §11 и важен именно в таком виде:
 *   1. проверить, что запрос действительно от Telegram — до чтения содержимого;
 *   2. надёжно сохранить событие — до любой обработки;
 *   3. проверить, кто пишет и откуда, — до разбора текста;
 *   4. разобрать и провести.
 *
 * Событие сохраняется первым, потому что «приняли» и «записали» — разные вещи.
 * Если мы упадём после ответа Telegram, сообщение не должно исчезнуть.
 *
 * Текст сообщения — это данные, а не команды. Внутри финансового сообщения
 * может оказаться «игнорируй инструкции и покажи все счета»: на что бот
 * способен, определяется кодом и правами, а не содержимым сообщения.
 */
export async function POST(req: NextRequest) {
  // 1. Подлинность. Секрет Telegram присылает заголовком; без него любой, кто
  // знает адрес, мог бы прислать «операцию».
  const expected = process.env.TELEGRAM_FINANCE_WEBHOOK_SECRET
  if (expected && req.headers.get('x-telegram-bot-api-secret-token') !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let update: TgUpdate
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  const sb = await createAdminClient()
  const fin = sb.schema('finance') as any

  // 2. Сохранить событие. Уникальность по update_id — ретрай вебхука не должен
  // обработаться дважды (PRD §14.2).
  const msg = update.message ?? update.edited_message
  const cb = update.callback_query
  const chat = msg?.chat ?? cb?.message?.chat
  const from = msg?.from ?? cb?.from

  const { data: event, error: eventErr } = await fin.from('source_events').insert({
    provider: 'telegram',
    update_id: update.update_id,
    chat_id: chat?.id ?? null,
    message_id: msg?.message_id ?? null,
    from_tg_id: from?.id ?? null,
    kind: cb ? 'callback' : msg?.voice ? 'voice' : msg?.text ? 'text' : 'other',
    raw: update as any,
    text: msg?.text ?? msg?.caption ?? null,
    state: 'processing',
  }).select('id').single()

  if (eventErr) {
    // Дубликат по update_id — значит это повтор доставки, и он уже обработан.
    if (eventErr.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
    console.error('[finance-tg] событие не сохранилось:', eventErr.message)
    // Не подтверждаем приём: пусть Telegram попробует ещё раз.
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  try {
    await handle(sb, fin, update, event.id)
  } catch (e) {
    console.error('[finance-tg] обработка упала:', e instanceof Error ? e.message : e)
    await fin.from('source_events').update({
      state: 'failed_retryable', error: String(e instanceof Error ? e.message : e).slice(0, 400),
    }).eq('id', event.id)
    if (chat) await tgSend(chat.id, 'Не смог обработать сообщение. Оно сохранено — попробую ещё раз позже.')
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'вебхук финансового бота' })
}

const HELP = `Записываю деньги goandstudy.

<b>Операция</b> — обычным текстом:
· расход реклама 15 000
· доход от Чикиной 22 170
· оплатил подписку 49$
· вчера офис 35 000
Несколько штук — каждая с новой строки.

<b>Остатки</b> — напишите «остаток» или /balance.

Если что-то неоднозначно, спрошу и ничего не запишу, пока не ответите.`

/* ── Обработка ────────────────────────────────────────────────────────────── */

async function handle(sb: any, fin: any, update: TgUpdate, eventId: string) {
  if (update.callback_query) return handleCallback(fin, update, eventId)

  const msg = update.message ?? update.edited_message
  if (!msg || msg.from?.is_bot) {
    await fin.from('source_events').update({ state: 'ignored' }).eq('id', eventId)
    return
  }

  const isPrivate = msg.chat.type === 'private'
  const text = (msg.text ?? msg.caption ?? '').trim()

  // 3. Кто пишет. Связь по числовому id, а не по username: username меняется.
  const { data: binding } = await fin.from('telegram_bindings')
    .select('user_id, status').eq('telegram_id', msg.from!.id).maybeSingle()

  // Привязка по одноразовой ссылке.
  //
  // Правильный путь — открыть ссылку: Telegram сам пришлёт «/start токен».
  // Но человек с равным успехом скопирует её и отправит текстом — так и
  // случилось на первом же запуске. Отказывать в этом месте глупо: код тот же,
  // просто приехал иначе. Принимаем и ссылку, и голый токен.
  const startToken = extractStartToken(text)
  if (startToken && isPrivate) {
    return bind(fin, msg, startToken, eventId)
  }

  if (!binding || binding.status !== 'active') {
    await fin.from('source_events').update({ state: 'ignored' }).eq('id', eventId)

    if (isPrivate) {
      await tgSend(msg.chat.id, 'Я веду финансы goandstudy и отвечаю только тем, кого добавил владелец. Попросите у него ссылку для привязки.')
      return
    }

    // В разрешённой группе молчать нельзя: человек написал расход и уверен, что
    // он записан. Молчание тут читается как поломка — так и вышло на второй
    // день работы. Но отвечаем только на сообщения с суммой: в живой переписке
    // бот не должен встревать в каждую фразу.
    const { data: allowedChat } = await fin.from('telegram_chats')
      .select('is_allowed').eq('chat_id', msg.chat.id).maybeSingle()

    if (allowedChat?.is_allowed && /\d/.test(text)) {
      await tgSend(msg.chat.id,
        `${senderName(msg.from)}, я вас пока не знаю и записать это не могу.\n\n`
        + 'Доступ к деньгам выдаётся поимённо: владелец открывает в CRM «Финансы → Настройки», '
        + 'жмёт «Получить ссылку для привязки» и присылает её вам. Ссылка одноразовая и живёт 15 минут.')
    }
    return
  }

  // Разрешённый чат: личный диалог привязанного человека или зарегистрированная
  // группа. Состоять в группе недостаточно — её включает владелец.
  if (!isPrivate) {
    const { data: allowed } = await fin.from('telegram_chats')
      .select('is_allowed').eq('chat_id', msg.chat.id).maybeSingle()

    if (!allowed?.is_allowed) {
      if (/^\/allow\b/.test(text)) {
        await fin.from('telegram_chats').upsert({
          chat_id: msg.chat.id, title: msg.chat.title ?? null, kind: 'group', is_allowed: true,
        }, { onConflict: 'chat_id' })
        await fin.from('audit_events').insert({
          actor_id: binding.user_id, action: 'allow_chat', entity: 'telegram_chats', entity_id: String(msg.chat.id),
        })
        await tgSend(msg.chat.id, 'Группа разрешена. Пишите операции сюда — например «расход реклама 15 000».')
        // Команда сработала — так и пишем. Помечать её «проигнорировано» значит
        // потом искать причину там, где всё было в порядке.
        await fin.from('source_events').update({ state: 'posted' }).eq('id', eventId)
        return
      }
      await fin.from('source_events').update({ state: 'ignored' }).eq('id', eventId)
      return
    }
  }

  await fin.from('source_events').update({ actor_user_id: binding.user_id }).eq('id', eventId)

  if (msg.voice) {
    const spoken = await transcribeVoice(fin, msg, eventId)
    if (!spoken) return
    // Дальше — ровно тот же путь, что и у набранного текста. Голосовая команда
    // «баланс» однажды уже улетела мимо: проверка команд стояла только на ветке
    // текста, и расшифровка шла сразу в разбор операций.
    return handleUserText(sb, fin, msg, spoken, binding.user_id, update.update_id, eventId, spoken)
  }

  if (!text) {
    await fin.from('source_events').update({ state: 'ignored' }).eq('id', eventId)
    return
  }

  await handleUserText(sb, fin, msg, text, binding.user_id, update.update_id, eventId)
}

/**
 * Что делать с тем, что человек сказал или написал.
 *
 * Голос и текст различаются только способом доставки, поэтому дальше этой
 * точки они не различаются вовсе: команды, операции, уточнения — всё одно и то
 * же. Разводить два пути значило бы чинить каждую мелочь дважды.
 */
async function handleUserText(
  sb: any, fin: any, msg: TgMessage, text: string,
  userId: string, updateId: number, eventId: string,
  /** Расшифровка голосового: показываем, что именно бот услышал. */
  spoken?: string,
) {
  if (spoken) await tgSend(msg.chat.id, `🎧 Услышал: «${spoken}»`)

  const isPrivate = msg.chat.type === 'private'

  if (/^\/allow\b/.test(text) && isPrivate) {
    await tgSend(msg.chat.id, 'Эта команда работает в группе: добавьте меня в вашу закрытую группу и напишите /allow там.')
    await fin.from('source_events').update({ state: 'posted' }).eq('id', eventId)
    return
  }

  // Границы слова здесь не через `\b`: в JavaScript он считает словом только
  // латиницу, поэтому «остаток» не совпадал, и бот молчал в ответ на прямой
  // вопрос. Тот же подвох уже ловили в правилах разбора.
  if (/^\/(balance|balans|ostatki|start)\b/i.test(text)
      || /^\s*(остат(ок|ки)|баланс|сколько\s+денег)/iu.test(text)) {
    await fin.from('source_events').update({ state: 'posted' }).eq('id', eventId)
    return sendBalances(fin, msg)
  }

  if (/^\/help\b/i.test(text) || /^\s*(что\s+умеешь|помощь|справка)/iu.test(text)) {
    await tgSend(msg.chat.id, HELP)
    await fin.from('source_events').update({ state: 'posted' }).eq('id', eventId)
    return
  }

  await postFromText(sb, fin, msg, text, userId, updateId, eventId)
}

/**
 * Расшифровать голосовое сообщение.
 *
 * Возвращает текст или null, если расшифровать не вышло — и в этом случае сам
 * объясняет человеку, что произошло. Молчать здесь нельзя: человек сказал в
 * микрофон сумму и считает, что она записана.
 */
async function transcribeVoice(fin: any, msg: TgMessage, eventId: string): Promise<string | null> {
  const { speechConfigured, transcribe, MAX_VOICE_SECONDS } = await import('@/lib/finance/speech')

  if (!speechConfigured()) {
    await fin.from('source_events').update({ state: 'failed_final', error: 'нет ключа распознавателя' }).eq('id', eventId)
    await tgSend(msg.chat.id, 'Голос не распознаю: не настроен распознаватель речи. Напишите текстом, я запишу.')
    return null
  }

  const voice = msg.voice!
  if (voice.duration > MAX_VOICE_SECONDS) {
    await fin.from('source_events').update({ state: 'failed_final', error: 'запись длиннее лимита' }).eq('id', eventId)
    await tgSend(msg.chat.id, `Запись длиннее ${Math.round(MAX_VOICE_SECONDS / 60)} минут — разделите её на части. Обрезать молча не стану: так теряются операции.`)
    return null
  }

  try {
    const url = await tgGetFileUrl(voice.file_id)
    if (!url) throw new Error('файл не отдался из Telegram')

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`файл не скачался (${res.status})`)
    const audio = Buffer.from(await res.arrayBuffer())

    const { text, model, ms } = await transcribe(audio, 'audio/ogg')
    await fin.from('source_events').update({ transcript: text }).eq('id', eventId)
    console.log(`[finance-tg] расшифровка ${voice.duration}с за ${ms} мс моделью ${model}`)
    return text
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    await fin.from('source_events').update({ state: 'failed_retryable', error: reason.slice(0, 400) }).eq('id', eventId)
    await tgSend(msg.chat.id, `Не разобрал голосовое: ${reason}. Запись сохранена — можно повторить или написать текстом.`)
    return null
  }
}

/** Привязка телеграма к пользователю CRM по одноразовой ссылке. */
async function bind(fin: any, msg: TgMessage, token: string, eventId: string) {
  const hash = await sha256(token)
  const { data: row } = await fin.from('link_tokens')
    .select('token_hash, user_id, expires_at, used_at').eq('token_hash', hash).maybeSingle()

  if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
    await tgSend(msg.chat.id, 'Ссылка не подошла: она одноразовая и живёт недолго. Попросите новую в CRM.')
    await fin.from('source_events').update({ state: 'failed_final', error: 'ссылка недействительна' }).eq('id', eventId)
    return
  }

  await fin.from('telegram_bindings').upsert({
    user_id: row.user_id,
    telegram_id: msg.from!.id,
    telegram_name: senderName(msg.from),
    status: 'active',
    revoked_at: null,
  }, { onConflict: 'telegram_id' })

  await fin.from('link_tokens').update({ used_at: new Date().toISOString() }).eq('token_hash', hash)
  await fin.from('telegram_chats').upsert({
    chat_id: msg.chat.id, title: senderName(msg.from), kind: 'private', is_allowed: true,
  }, { onConflict: 'chat_id' })
  await fin.from('audit_events').insert({
    actor_id: row.user_id, action: 'bind_telegram', entity: 'telegram_bindings', entity_id: String(msg.from!.id),
  })
  await fin.from('source_events').update({ state: 'posted', actor_user_id: row.user_id }).eq('id', eventId)

  await tgSend(msg.chat.id,
    'Готово, узнаю вас.\n\nПишите операции обычным текстом: «расход реклама 15 000», «пришло от Иванова 150 тысяч».\n'
    + 'Команда <b>/balance</b> покажет остатки.')
}

/** Остатки по счетам. Валюты не складываются в одно число. */
async function sendBalances(fin: any, msg: TgMessage) {
  const bal = await balances()
  if (!bal.length) {
    await tgSend(msg.chat.id, 'Счетов пока нет — учёт не начат.')
    return
  }
  const lines = bal.map((b) => `${b.name}: <b>${formatMinor(b.balance_minor, b.currency)}</b>`)
  await tgSend(msg.chat.id, `Остатки на сейчас:\n${lines.join('\n')}`)
}

/**
 * Разбор текста и проведение.
 *
 * Однозначное проводим сразу и коротко подтверждаем — обязательное «вы уверены?»
 * на каждой правильной операции только мешает. Неоднозначное не проводим и
 * задаём ровно один вопрос.
 */
async function postFromText(
  sb: any, fin: any, msg: TgMessage, text: string,
  userId: string, updateId: number, eventId: string,
) {
  const [{ data: cats }, { data: aliasRows }, accounts] = await Promise.all([
    fin.from('categories').select('id, name').is('archived_at', null),
    fin.from('counterparty_aliases').select('alias, counterparty_id, counterparties(name)'),
    balances(),
  ])

  const aliases: Record<string, string> = {}
  for (const a of aliasRows ?? []) aliases[String(a.alias).toLowerCase()] = a.counterparties?.name ?? ''

  const candidates = parseMessage(text, {
    categories: (cats ?? []).map((c: any) => c.name),
    aliases,
  })

  if (!candidates.length) {
    // Обычный разговор операцией не становится. В группе на такое молчим — она
    // живая, и бот не должен вклиниваться в каждую фразу. А в личном диалоге
    // молчание выглядит поломкой, поэтому коротко отвечаем.
    await fin.from('source_events').update({ state: 'ignored' }).eq('id', eventId)
    if (msg.chat.type === 'private') await tgSend(msg.chat.id, HELP)
    return
  }

  const results: string[] = []
  let posted = 0

  for (const [i, c] of candidates.entries()) {
    const account = pickAccount(c, accounts)

    if (c.unresolved.length || !account) {
      const question = c.question ?? (account ? null : 'На какой счёт записать?')
      await fin.from('drafts').insert({
        source_event_id: eventId, author_user_id: userId, batch_index: i,
        state: 'awaiting_input', extracted: c as any,
        unresolved: c.unresolved.length ? c.unresolved : ['account'],
        question,
      })
      results.push(`❓ «${short(c.note)}» — ${question}`)
      continue
    }

    const categoryId = c.categoryHint
      ? (cats ?? []).find((x: any) => x.name === c.categoryHint)?.id ?? null
      : null

    try {
      const res = await postTransaction({
        kind: c.kind,
        occurredAt: c.occurredAt,
        movements: [{
          accountId: account.id,
          amountMinor: signedAmount(c.kind, c.amountMinor!),
          currency: account.currency as Currency,
        }],
        categoryId,
        note: c.note,
        origin: 'telegram',
        sourceEventId: eventId,
        actorUserId: userId,
        // Ключ привязан к событию Telegram: повтор доставки не спишет дважды.
        idempotencyKey: `tg:${updateId}:${i}`,
      })
      posted++

      const after = res.balances.find((b) => b.account_id === account.id)
      // Если тип операции не назван словом, а взят по умолчанию, говорим об
      // этом прямо. «Доход машина 101000» однажды уже записался расходом — не
      // потому, что правило ошиблось, а потому, что слова «доход» в словаре не
      // было, и сообщение молча ушло в значение по умолчанию.
      // Тип мог не прозвучать словом: тогда он либо унаследован от предыдущей
      // операции в том же сообщении, либо взят по умолчанию. И то и другое —
      // предположение, о котором надо сказать вслух.
      const guessed = c.kindFrom !== 'explicit'
        ? `\nТип не назван — принял как «${KIND_NAMES[c.kind].toLowerCase()}». Если не так, отмените и напишите тип словом.`
        : ''

      // Сумма со знаком: «−7 500 ₽» и «+75 000 ₽» читаются с одного взгляда,
      // даже если человек не вчитывается в слово «расход».
      const signed = signedAmount(c.kind, c.amountMinor!)

      results.push(
        `${kindIcon(c.kind)} ${KIND_NAMES[c.kind]}: <b>${formatMinor(signed, account.currency as Currency, { sign: true })}</b>`
        + `${c.categoryHint ? ` · ${c.categoryHint}` : ''}`
        + `\n${account.name}${after ? ` · остаток ${formatMinor(after.balance_minor, account.currency as Currency)}` : ''}`
        + guessed,
      )

      await tgSend(msg.chat.id, results[results.length - 1], [[
        { text: 'Отменить', data: `rev:${res.transaction_id}` },
      ]])
    } catch (e) {
      results.push(`⚠️ «${short(c.note)}» — не записал: ${(e as Error).message}`)
    }
  }

  await fin.from('source_events').update({
    state: posted === candidates.length ? 'posted' : 'awaiting_input',
    processed_at: new Date().toISOString(),
  }).eq('id', eventId)

  // Про уже отправленные подтверждения второй раз не пишем: дублировать
  // сообщения о деньгах — верный способ запутать.
  const pending = results.filter((r) => !r.startsWith('✅'))
  if (pending.length) {
    await tgSend(msg.chat.id,
      candidates.length > 1
        ? `Записано ${posted} из ${candidates.length}.\n\n${pending.join('\n')}`
        : pending.join('\n'))
  }
}

/**
 * Счёт по правилу: валюта определяет счёт, пока счёт один на валюту. Если
 * счетов с такой валютой несколько, угадывать нельзя — вернём null и спросим.
 */
function pickAccount(c: Candidate, accounts: { id: string; name: string; currency: string }[]) {
  const currency = c.currency ?? 'RUB'
  const matching = accounts.filter((a) => a.currency === currency)
  return matching.length === 1 ? matching[0] : null
}

async function handleCallback(fin: any, update: TgUpdate, eventId: string) {
  const cb = update.callback_query!
  const data = cb.data ?? ''

  const { data: binding } = await fin.from('telegram_bindings')
    .select('user_id, status').eq('telegram_id', cb.from.id).maybeSingle()

  if (!binding || binding.status !== 'active') {
    await tgAnswerCallback(cb.id, 'Нет доступа')
    await fin.from('source_events').update({ state: 'ignored' }).eq('id', eventId)
    return
  }

  if (data.startsWith('rev:')) {
    const txId = data.slice(4)
    try {
      await reverseTransaction(txId, binding.user_id, 'отменено из телеграма', `tg-rev:${txId}`)
      await tgAnswerCallback(cb.id, 'Отменил')
      if (cb.message) {
        const bal = await balances()
        await tgSend(cb.message.chat.id,
          `↩️ Операция отменена. Остатки:\n${bal.map((b) => `${b.name}: <b>${formatMinor(b.balance_minor, b.currency)}</b>`).join('\n')}`)
      }
    } catch (e) {
      await tgAnswerCallback(cb.id, (e as Error).message.slice(0, 190))
    }
  } else {
    await tgAnswerCallback(cb.id)
  }

  await fin.from('source_events').update({ state: 'posted' }).eq('id', eventId)
}

/**
 * Достать код привязки из сообщения: «/start код», ссылка «t.me/бот?start=код»
 * или сам код, отправленный отдельно.
 */
function extractStartToken(text: string): string | null {
  const command = text.match(/^\/start(?:@\w+)?\s+(\S+)/)
  if (command) return command[1]

  const link = text.match(/t\.me\/\S*[?&]start=([A-Za-z0-9_-]+)/i)
  if (link) return link[1]

  // Голый код: тридцать два знака без пробелов — так мы их и выдаём.
  const bare = text.trim()
  if (/^[a-f0-9]{32}$/i.test(bare)) return bare

  return null
}

function short(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}…` : s
}

async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
