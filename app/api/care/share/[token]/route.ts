/**
 * Страница подборки для клиента.
 *
 * ПОЧЕМУ ЭТО МАРШРУТ, А НЕ СТРАНИЦА. Кабинет закрыт за входом и ролями, и это
 * правильно. Клиент в кабинете не заведён и по плану пилота заводиться не
 * должен — значит страница для него должна жить там, где вход не требуется.
 * `/api/care/*` уже публичен (вебхуки проверяют подпись сами), и это
 * единственное место в контуре, куда можно попасть без сессии.
 *
 * Отвечает обычным HTML. Доступ даёт секрет в адресе: знает ссылку — видит
 * страницу. Поэтому на ней нет ничего, кроме самой подборки — ни имени
 * клиента, ни бюджета, ни переписки.
 *
 * Отзывается ссылка обнулением `share_token` в базе: следующий запрос уже
 * получит 404.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { страницаПоТокену, собратьСтраницу } from '@/lib/care/share'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Что видит тот, кто пришёл по неверной, отозванной или устаревшей ссылке. */
const НЕТ_СТРАНИЦЫ = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Ссылка не действует</title></head>
<body style="margin:0;padding:64px 20px;font:16px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1b20;background:#faf8f5">
<div style="max-width:520px;margin:0 auto">
<h1 style="font-size:22px;margin:0 0 10px">Ссылка не действует</h1>
<p style="color:#6f6a75;margin:0">Возможно, подборку обновили и прислали новую ссылку.
Напишите своему куратору — он пришлёт действующую.</p>
</div></body></html>`

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  let страница
  try {
    страница = await страницаПоТокену(token)
  } catch (e) {
    // Сбой базы не должен показывать клиенту ни трассировку, ни «ошибка 500»:
    // он не отличит её от отозванной ссылки и всё равно напишет куратору.
    console.error('[care страница подборки]', e instanceof Error ? e.message : e)
    страница = null
  }

  if (!страница) {
    return new NextResponse(НЕТ_СТРАНИЦЫ, {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
    })
  }

  return new NextResponse(собратьСтраницу(страница), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Не кэшировать: куратор правит подборку, и клиент должен видеть правку,
      // а не версию недельной давности из кэша посредника.
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
