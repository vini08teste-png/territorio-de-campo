import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Renova o token de sessão do Supabase a cada navegação. Sem isso, a sessão
// expira (padrão ~1h) e nunca é atualizada — usuário continua "logado" na
// tela, mas toda chamada que depende do token (ex: PATCH /api/usuarios)
// passa a falhar com "Auth session missing!".
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // Não colocar lógica entre createServerClient e getUser() — isso é o que
  // efetivamente lê/renova o token e reescreve os cookies na resposta.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)'],
}
