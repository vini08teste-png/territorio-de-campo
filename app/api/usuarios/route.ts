import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Cliente com service role — só usado no servidor. Criado a cada requisição
// para que o build não dependa da chave secreta.
function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) {
    throw new Error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  }
  return createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Só deixa passar quem está autenticado e tem perfil admin
async function exigirAdmin(req: NextRequest, supabaseAdmin: SupabaseClient) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return false

  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return false

  const { data: usuario } = await supabaseAdmin
    .from('usuarios')
    .select('perfil, ativo')
    .eq('id', user.id)
    .single()

  return usuario?.perfil === 'admin' && usuario.ativo
}

// POST /api/usuarios — criar usuário
export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = criarClienteAdmin()
    if (!(await exigirAdmin(req, supabaseAdmin))) {
      return NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
    }

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

// PATCH /api/usuarios — editar nome, email, perfil e/ou senha
export async function PATCH(req: NextRequest) {
  try {
    const supabaseAdmin = criarClienteAdmin()
    if (!(await exigirAdmin(req, supabaseAdmin))) {
      return NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
    }

    const { id, nome, email, perfil, senha } = await req.json() as {
      id: string; nome?: string; email?: string; perfil?: string; senha?: string
    }

    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    if (senha && senha.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres.' }, { status: 400 })
    }

    // Atualiza email e/ou senha no Auth, se enviados
    if (email || senha) {
      const authUpdate: { email?: string; password?: string } = {}
      if (email) authUpdate.email = email
      if (senha) authUpdate.password = senha

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, authUpdate)
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 })
      }
    }

    // Atualiza dados na tabela usuarios
    const dadosTabela: { nome?: string; email?: string; perfil?: string } = {}
    if (nome) dadosTabela.nome = nome
    if (email) dadosTabela.email = email
    if (perfil) dadosTabela.perfil = perfil

    if (Object.keys(dadosTabela).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('usuarios')
        .update(dadosTabela)
        .eq('id', id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

// DELETE /api/usuarios?id=xxx — excluir usuário
export async function DELETE(req: NextRequest) {
  try {
    const supabaseAdmin = criarClienteAdmin()
    if (!(await exigirAdmin(req, supabaseAdmin))) {
      return NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
    }

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    // O banco bloqueia a exclusão se essa pessoa já tem histórico vinculado
    // (marcações, pontos de parada, territórios criados ou validações feitas).
    // Sem essa checagem, a exclusão da tabela falha silenciosamente, mas o
    // código seguia apagando a conta de login mesmo assim — deixando um
    // registro "fantasma" que nunca mais consegue entrar no sistema.
    const [marcacoesFeitas, marcacoesValidadas, pontos, territoriosCriados] = await Promise.all([
      supabaseAdmin.from('marcacoes').select('id', { count: 'exact', head: true }).eq('usuario_id', id),
      supabaseAdmin.from('marcacoes').select('id', { count: 'exact', head: true }).eq('validado_por', id),
      supabaseAdmin.from('pontos_parada').select('id', { count: 'exact', head: true }).eq('usuario_id', id),
      supabaseAdmin.from('territorios').select('id', { count: 'exact', head: true }).eq('criado_por', id),
    ])

    const totalHistorico =
      (marcacoesFeitas.count ?? 0) + (marcacoesValidadas.count ?? 0) +
      (pontos.count ?? 0) + (territoriosCriados.count ?? 0)

    if (totalHistorico > 0) {
      return NextResponse.json({
        error: 'Este usuário já tem histórico de atividade (marcações, pontos de parada, territórios criados ou validações) e não pode ser excluído. Desative a conta em vez de excluir.',
      }, { status: 409 })
    }

    await supabaseAdmin.from('designacoes').update({ data_fim: new Date().toISOString() }).eq('usuario_id', id)

    const { error: deleteError } = await supabaseAdmin.from('usuarios').delete().eq('id', id)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    // Remove do Auth
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
