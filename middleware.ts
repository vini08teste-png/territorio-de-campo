import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ROTAS_PERFIL: Record<string, string[]> = {
  dirigente: [
    '/app',
    '/app/perfil',
    '/app/progresso',
    '/app/historico',
  ],
  superintendente_grupo: [
    '/app',
    '/app/perfil',
    '/app/progresso',
    '/app/historico',
    '/app/validar',
    '/app/designar',
    '/app/relatorio',
  ],
  superintendente_territorio: [
    '/app',
    '/app/perfil',
    '/app/progresso',
    '/app/historico',
    '/app/validar',
    '/app/designar',
    '/app/relatorio',
    '/app/analise',
    '/app/territorios',
  ],
  admin: [
    '/app',
    '/app/perfil',
    '/app/analise',
    '/app/relatorio',
    '/app/usuarios',
    '/app/usuarios/novo',
    '/app/logs',
    '/app/configuracoes',
  ],
}

// Rotas permitidas para qualquer usuário autenticado e ativo
const ROTAS_BASE = ['/app', '/app/perfil']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotas públicas — sem verificação
  if (
    pathname === '/login' ||
    pathname === '/' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Autenticar via servidor (mais seguro que getSession)
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Buscar perfil
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('perfil, ativo')
    .eq('id', user.id)
    .single()

  // Não cadastrado ou inativo → logout e login
  if (!usuario || !usuario.ativo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const perfil = (usuario.perfil as string) ?? ''
  const rotasPermitidas = ROTAS_PERFIL[perfil] ?? ROTAS_BASE

  const rotaPermitida = rotasPermitidas.some(
    (rota) => pathname === rota || pathname.startsWith(rota + '/')
  )

  if (!rotaPermitida) {
    const url = new URL('/app', request.url)
    url.searchParams.set('acesso_negado', '1')
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)'],
}
