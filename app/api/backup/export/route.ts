import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Выгрузка данных для ночного бэкапа.
 *
 * Зачем так, а не «положить ключ на сервер и пусть качает». Копия должна лежать
 * на другой машине — иначе это не копия. Другая машина у нас одна: сервер сайта
 * в Москве. Но сервисный ключ Supabase даёт полный доступ к CRM на запись, и
 * положить его туда значит превратить взлом сайта во взлом всей системы.
 *
 * Поэтому наоборот: сервер сайта ничего не знает и только просит, а решает
 * CRM. Запрос подписан отдельным секретом, только на чтение, со сроком годности
 * в пять минут.
 *
 * Чего эта выгрузка НЕ покрывает и почему это нормально: структуру базы —
 * таблицы, функции, ограничения, политики. Она лежит в миграциях в гите и
 * восстанавливается оттуда. Здесь только данные, которых в гите нет.
 */

const SCHEMAS = ['public', 'seo', 'finance'] as const

/** Представления восстанавливать незачем: они считаются из таблиц. */
const SKIP = new Set(['payments_view', 'v_money_in', 'v_page_deals', 'account_balances'])

export async function POST(req: NextRequest) {
  const secret = process.env.BACKUP_SECRET
  if (!secret) return NextResponse.json({ error: 'бэкап не настроен' }, { status: 503 })

  const raw = await req.text()
  const ts = req.headers.get('x-gs-timestamp') ?? ''
  const signature = req.headers.get('x-gs-signature') ?? ''

  const expected = await hmac(`${ts}.${raw}`, secret)
  if (!timingSafeEqual(signature, expected)) {
    return NextResponse.json({ error: 'подпись не сошлась' }, { status: 401 })
  }
  if (!Number(ts) || Math.abs(Date.now() - Number(ts) * 1000) > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'запрос устарел' }, { status: 401 })
  }

  let body: any
  try { body = JSON.parse(raw || '{}') } catch { body = {} }

  const sb = await createAdminClient()

  // Что вообще выгружать: список таблиц берём у самой базы, а не из списка в
  // коде. Появится новая таблица — она попадёт в бэкап сама, и это важнее
  // аккуратности списка: забытая таблица обнаруживается только при аварии.
  if (body.kind === 'manifest') {
    const tables: { schema: string; table: string }[] = []
    for (const schema of SCHEMAS) {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          accept: 'application/openapi+json',
          'accept-profile': schema,
        },
      })
      const spec: any = await res.json()
      for (const name of Object.keys(spec.definitions ?? {})) {
        if (!SKIP.has(name)) tables.push({ schema, table: name })
      }
    }

    // Только перечень: подписывать ссылки здесь нельзя. На первой же попытке
    // манифест не уложился в две минуты — двести пятьдесят файлов означали
    // двести пятьдесят отдельных запросов на подпись. Ссылки выдаются пачкой,
    // отдельным вызовом ниже.
    const { data: buckets } = await sb.storage.listBuckets()
    const files: { bucket: string; path: string; size: number }[] = []
    for (const b of buckets ?? []) {
      for (const f of await listAll(sb, b.name)) files.push({ bucket: b.name, ...f })
    }

    return NextResponse.json({ at: new Date().toISOString(), tables, files })
  }

  // Подписанные ссылки пачкой: один вызов на сотню файлов вместо сотни вызовов.
  if (body.kind === 'files') {
    const bucket = String(body.bucket ?? '')
    const paths: string[] = Array.isArray(body.paths) ? body.paths.slice(0, 100).map(String) : []
    if (!bucket || !paths.length) return NextResponse.json({ error: 'нечего подписывать' }, { status: 400 })

    const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, 3600)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({
      urls: (data ?? []).map((d: any) => ({ path: d.path, url: d.signedUrl, error: d.error })),
    })
  }

  // Одна таблица страницей. Страницами, потому что в gsc_daily двести тысяч
  // строк: одним куском это не пройдёт ни по памяти, ни по времени ответа.
  if (body.kind === 'table') {
    const schema = String(body.schema ?? 'public')
    const table = String(body.table ?? '')
    const offset = Number(body.offset ?? 0)
    const limit = Math.min(Number(body.limit ?? 1000), 1000)
    if (!SCHEMAS.includes(schema as any) || !table) {
      return NextResponse.json({ error: 'не та таблица' }, { status: 400 })
    }

    const { data, error } = await (sb.schema(schema as any) as any)
      .from(table).select('*').range(offset, offset + limit - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ rows: data ?? [], count: (data ?? []).length, done: (data ?? []).length < limit })
  }

  return NextResponse.json({ error: 'неизвестный запрос' }, { status: 400 })
}

/**
 * Все объекты бакета, включая вложенные папки.
 *
 * Размер отдаём вместе с путём: по нему сервер поймёт, что файл не менялся, и
 * не станет качать его второй раз. Без этого каждая ночная копия тянула бы все
 * две тысячи файлов заново — пять гигабайт за ночь и забитый диск за месяц.
 */
async function listAll(sb: any, bucket: string, prefix = ''): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = []
  const { data } = await sb.storage.from(bucket).list(prefix, { limit: 1000 })
  for (const item of data ?? []) {
    const full = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id === null) out.push(...await listAll(sb, bucket, full))
    else out.push({ path: full, size: Number(item.metadata?.size ?? 0) })
  }
  return out
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
