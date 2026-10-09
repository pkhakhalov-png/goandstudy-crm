import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Публичные маршруты (webhook'и, booking, tbank callback, invite)
  const isPublic =
    pathname === '/login' ||
    pathname === '/demo' || pathname.startsWith('/demo/') ||
    pathname.startsWith('/book') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/api/book') ||
    pathname.startsWith('/api/wazzup') ||
    pathname.startsWith('/api/telegram') ||
    pathname.startsWith('/api/zoom') ||           // вебхук Zoom: подпись проверяется внутри
    pathname.startsWith('/api/finance/telegram') ||   // вебхук финансового бота: подлинность проверяется секретом Telegram
    pathname.startsWith('/api/backup') ||             // выгрузка для ночного бэкапа: подпись проверяется внутри
    pathname.startsWith('/api/tbank') ||
    pathname.startsWith('/api/debug') ||
    pathname.startsWith('/api/seo') ||     // воркер SEO: своя авторизация по x-seo-tick-secret
    pathname.startsWith('/api/track')      // трекер/лид-webhook (M3): своя проверка

  // Не авторизован — редирект на /login
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Авторизован — редирект с /login на нужный кабинет
  if (user && pathname === '/login') {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    // Роль не прочиталась — не угадываем кабинет. Раньше сбой базы отправлял
    // админа в кабинет продажника, и это выглядело как взлом.
    if (profileError && profileError.code !== 'PGRST116') return dbUnavailable()

    if (profile?.role === 'admin') {
      return NextResponse.redirect(new URL('/admin', request.url))
    } else if (profile?.role === 'rop') {
      return NextResponse.redirect(new URL('/rop', request.url))
    } else if (profile?.role === 'curator') {
      return NextResponse.redirect(new URL('/curator', request.url))
    } else if (profile?.role === 'client') {
      return NextResponse.redirect(new URL('/client', request.url))
    } else {
      return NextResponse.redirect(new URL('/sales', request.url))
    }
  }

  // Role-scoped redirects for non-staff paths
  if (user && (pathname.startsWith('/admin') || pathname.startsWith('/sales') || pathname.startsWith('/rop') || pathname.startsWith('/curator'))) {
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError && profileError.code !== 'PGRST116') return dbUnavailable()

    if (profile?.role === 'curator' && (pathname.startsWith('/admin') || pathname.startsWith('/sales') || pathname.startsWith('/rop'))) {
      return NextResponse.redirect(new URL('/curator', request.url))
    }
    if (profile?.role === 'client') {
      // Клиент имеет read-only доступ к деталям программ/вузов/стипендий
      // (используются ?asClient=1 — серверная страница сама прячет curator-only кнопки).
      const isReadOnlyDetail =
        /^\/curator\/universities\/[^/]+/.test(pathname) ||
        /^\/curator\/programs\/[^/]+/.test(pathname) ||
        /^\/curator\/scholarships\/[^/]+/.test(pathname)
      if (!isReadOnlyDetail) {
        return NextResponse.redirect(new URL('/client', request.url))
      }
    }
  }

  return supabaseResponse
}

function dbUnavailable() {
  return new NextResponse(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<title>CRM недоступна</title><body style="font-family:system-ui;max-width:32rem;margin:15vh auto;padding:0 1rem">' +
    '<h1 style="font-size:1.3rem">База CRM сейчас не отвечает</h1>' +
    '<p>Не получилось проверить ваши права доступа. Обновите страницу через минуту-две.</p></body>',
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '60', 'cache-control': 'no-store' } },
  )
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}