import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeUrl } from '@/lib/seo/normalize'
import { pageIdForPath } from '@/lib/seo/attribution'

/**
 * Приём событий просмотра.
 *
 * Зачем отдельный маршрут. Заявку мы видим — она приходит через форму. Переход
 * не видим никак: человек открыл статью, почитал и ушёл, и в базе от этого не
 * остаётся ничего. PRD требует считать «переходы и заявки», и без этого
 * маршрута считается только вторая половина.
 *
 * Что здесь НЕ делается.
 *
 * Не собираем ничего, что опознаёт человека. Ни адреса, ни телефона, ни
 * отпечатка браузера. Анонимный идентификатор — случайная строка в куке, живёт
 * год и нужен ровно для одного: связать несколько просмотров одного человека в
 * одну цепочку касаний. Заявка привяжется к ней позже, по тому же ключу.
 *
 * Не доверяем присланному адресу. В базу идёт нормализованный адрес нашего
 * сайта или ничего: иначе в таблицу событий можно было бы написать что угодно,
 * а она потом показывается человеку в отчёте.
 *
 * Не храним query у источника перехода. Там бывают поисковые запросы и токены,
 * которые нам не нужны и хранить которые не стоит.
 */
export const runtime = 'nodejs'

const COOKIE = 'gs_anon'
const YEAR = 60 * 60 * 24 * 365
const MAX_BODY = 4096

/**
 * Откуда принимаем события.
 *
 * Значение по умолчанию задано в коде намеренно. Первая версия читала только
 * переменную окружения — она была прописана в .env.local и не прописана в
 * Vercel. Счётчик на сайте встал и заработал, приёмник отвечал 204, а события
 * не записывались: разрешения не было ни одного, и каждый запрос отклонялся
 * молча. Со стороны выглядело как «всё установлено и ничего не происходит» —
 * худший вид поломки.
 *
 * Домен у нас один и не меняется, а забыть переменную при следующем деплое
 * можно снова. Переменная осталась и переопределяет умолчание — если появится
 * второй домен, менять код не придётся.
 */
const DEFAULT_ORIGINS = ['https://goandstudy.com', 'https://www.goandstudy.com']

function allowedOrigins(): string[] {
  const fromEnv = (process.env.TRACK_ALLOWED_ORIGINS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean)
  return fromEnv.length ? fromEnv : DEFAULT_ORIGINS
}

function corsHeaders(origin: string | null): Record<string, string> {
  const list = allowedOrigins()
  // Сравниваем целиком, а не по вхождению: «goandstudy.com.evil.ru» содержит
  // наш домен как подстроку и не должен получить разрешение.
  const ok = origin && list.includes(origin)
  return ok
    ? {
        'Access-Control-Allow-Origin': origin!,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' }
}

const EVENTS = new Set(['pageview', 'quiz_start', 'quiz_complete', 'form_submit', 'lead'])
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/** Наш ли это адрес и какой у него путь. */
function ownPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const u = new URL(raw)
    if (!/(^|\.)goandstudy\.com$/i.test(u.hostname)) return null
    const p = u.pathname.replace(/\/+$/, '')
    return p || '/'
  } catch { return null }
}

/** Источник перехода без query: там бывают поисковые запросы и токены. */
function safeReferrer(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const u = new URL(raw)
    return `${u.origin}${u.pathname}`.slice(0, 500)
  } catch { return null }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  // Отвечаем 204 почти всегда и молча. Трекер стоит на живом сайте, и его
  // ошибки не должны быть видны посетителю — но и притворяться, что записали,
  // когда не записали, тоже нельзя: это видно в логе.
  const quiet = (why?: string) => {
    if (why) console.warn(`[track] ${why}`)
    return new NextResponse(null, { status: 204, headers: cors })
  }

  if (origin && !allowedOrigins().includes(origin)) return quiet(`origin не разрешён: ${origin}`)

  let body: any
  try {
    const text = (await req.text()).slice(0, MAX_BODY)
    body = JSON.parse(text)
  } catch { return quiet('тело не разобралось') }

  const event = String(body?.event ?? 'pageview')
  if (!EVENTS.has(event)) return quiet(`неизвестное событие: ${event}`)

  const path = ownPath(body?.url)
  if (!path) return quiet('адрес не наш или не разобрался')

  // Анонимный идентификатор: берём из куки, если есть; иначе заводим новый.
  const existing = req.cookies.get(COOKIE)?.value
  const anonId = /^[a-z0-9]{16,40}$/.test(existing ?? '')
    ? existing!
    : crypto.randomUUID().replace(/-/g, '')

  const sessionId = typeof body?.session_id === 'string' && body.session_id.length <= 64
    ? body.session_id : anonId

  const utm: Record<string, string> = {}
  for (const k of UTM_KEYS) {
    const v = body?.utm?.[k]
    if (typeof v === 'string' && v.length <= 200) utm[k] = v
  }

  try {
    const seo = (await createAdminClient()).schema('seo')
    const pageId = await pageIdForPath(seo, path)

    const { error } = await seo.from('attribution_events').insert({
      anon_id: anonId,
      session_id: sessionId,
      event,
      platform: String(body?.platform ?? 'wordpress').slice(0, 32),
      url: normalizeUrl(`https://goandstudy.com${path}`, true),
      page_id: pageId,
      referrer: safeReferrer(body?.referrer),
      utm: Object.keys(utm).length ? utm : null,
    })
    if (error) return quiet(`событие не записалось: ${error.message}`)
  } catch (e: any) {
    return quiet(`сбой записи: ${e?.message ?? e}`)
  }

  const res = new NextResponse(null, { status: 204, headers: cors })
  res.cookies.set(COOKIE, anonId, {
    domain: process.env.TRACK_COOKIE_DOMAIN || undefined,
    path: '/', maxAge: YEAR, sameSite: 'lax', httpOnly: false, secure: true,
  })
  return res
}
