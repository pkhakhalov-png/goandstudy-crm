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
    pathname.startsWith('/api/tbank') ||
    pathname.startsWith('/api/debug')

  // Не авторизован — редирект на /login
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Авторизован — редирект с /login на нужный кабинет
  if (user && pathname === '/login') {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

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
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

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

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}