import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Cliente com service role — só usado no servidor
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST /api/usuarios — criar usuário
export async function POST(req: NextRequest) {
  try {
    const { nome, email, senha, perfil } = await req.json() as {
      nome: string; email: string; senha: string; perfil: string
    }

    if (!nome || !email || !senha || !perfil) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando.' }, { status: 400 })
    }

    // Cria no Auth sem exigir confirmação de email
    const { data, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true, // confirma automaticamente — não precisa clicar no email
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!data.user) {
      return NextResponse.json({ error: 'Usuário não criado.' }, { status: 500 })
    }

    // Insere na tabela usuarios
    const { error: insertError } = await supabaseAdmin.from('usuarios').insert({
      id: data.user.id,
      nome,
      email,
      perfil,
      ativo: true,
    })

    if (insertError) {
      // Rollback: remove do auth se falhou na tabela
      await supabaseAdmin.auth.admin.deleteUser(data.user.id)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// DELETE /api/usuarios?id=xxx — excluir usuário
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    // Remove da tabela primeiro
    await supabaseAdmin.from('designacoes').update({ data_fim: new Date().toISOString() }).eq('usuario_id', id)
    await supabaseAdmin.from('usuarios').delete().eq('id', id)

    // Remove do Auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
