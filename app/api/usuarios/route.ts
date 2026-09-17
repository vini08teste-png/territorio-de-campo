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

// Quem pode gerenciar usuários: admin e superintendente de território. O ST
// só mexe em quem é da congregação dele, nunca em admin — e não pode promover
// ninguém a admin nem mudar alguém (ou a si mesmo) de congregação. Sem isso,
// um ST trocava a própria congregação e passava a ver os dados de outra, ou
// redefinia a senha de alguém de outra congregação e entrava na conta.
type Gestor = { perfil: 'admin' | 'superintendente_territorio'; id: string; congregacao: string | null }

const PERFIS = ['admin', 'superintendente_territorio', 'superintendente_grupo', 'dirigente']
const SENHA_MINIMA = 8

async function exigirGestor(req: NextRequest, supabaseAdmin: SupabaseClient): Promise<Gestor | null> {
  const cabecalho = req.headers.get('authorization') ?? ''
  if (!cabecalho.startsWith('Bearer ')) return null
  const token = cabecalho.slice('Bearer '.length).trim()
  if (!token) return null

  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null

  const { data: usuario } = await supabaseAdmin
    .from('usuarios')
    .select('perfil, ativo, congregacao')
    .eq('id', user.id)
    .single()

  if (!usuario?.ativo) return null
  if (usuario.perfil !== 'admin' && usuario.perfil !== 'superintendente_territorio') return null
  return { perfil: usuario.perfil, id: user.id, congregacao: usuario.congregacao ?? null }
}

const SEM_PERMISSAO = { error: 'Acesso restrito a administradores e superintendentes de território.' }
const NAO_MEXE_EM_ADMIN = { error: 'Só um administrador pode criar, editar ou excluir outro administrador.' }
const OUTRA_CONGREGACAO = { error: 'Você só pode gerenciar usuários da sua congregação.' }

function normalizar(congregacao: string | null | undefined) {
  return (congregacao ?? '').trim().toLowerCase()
}

/** ST só atua dentro da própria congregação (e precisa ter uma definida). */
function stDaCongregacao(gestor: Gestor, congregacao: string | null | undefined) {
  if (gestor.perfil === 'admin') return true
  return normalizar(gestor.congregacao) !== '' && normalizar(gestor.congregacao) === normalizar(congregacao)
}

/** ST não cria nem promove admin. */
function stPodeUsarPerfil(gestor: Gestor, perfil?: string) {
  return gestor.perfil === 'admin' || perfil !== 'admin'
}

async function buscarAlvo(supabaseAdmin: SupabaseClient, id: string) {
  const { data } = await supabaseAdmin.from('usuarios').select('perfil, congregacao').eq('id', id).single()
  return data as { perfil: string; congregacao: string | null } | null
}

/** Devolve a resposta de erro se o gestor não pode mexer nesse usuário. */
async function barrarAlvo(supabaseAdmin: SupabaseClient, gestor: Gestor, id: string) {
  const alvo = await buscarAlvo(supabaseAdmin, id)
  if (!alvo) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  if (gestor.perfil === 'admin') return null
  if (alvo.perfil === 'admin') return NextResponse.json(NAO_MEXE_EM_ADMIN, { status: 403 })
  if (!stDaCongregacao(gestor, alvo.congregacao)) return NextResponse.json(OUTRA_CONGREGACAO, { status: 403 })
  return null
}

function textoValido(valor: unknown, maximo = 200): valor is string {
  return typeof valor === 'string' && valor.trim() !== '' && valor.length <= maximo
}

// POST /api/usuarios — criar usuário
export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = criarClienteAdmin()
    const gestor = await exigirGestor(req, supabaseAdmin)
    if (!gestor) return NextResponse.json(SEM_PERMISSAO, { status: 403 })

    const { nome, email, senha, perfil, congregacao } = await req.json() as {
      nome: unknown; email: unknown; senha: unknown; perfil: unknown; congregacao?: unknown
    }

    if (!textoValido(nome) || !textoValido(email) || typeof senha !== 'string' || typeof perfil !== 'string') {
      return NextResponse.json({ error: 'Campos obrigatórios faltando.' }, { status: 400 })
    }
    if (!PERFIS.includes(perfil)) {
      return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 })
    }
    if (senha.length < SENHA_MINIMA) {
      return NextResponse.json({ error: `Senha deve ter no mínimo ${SENHA_MINIMA} caracteres.` }, { status: 400 })
    }
    if (!stPodeUsarPerfil(gestor, perfil)) {
      return NextResponse.json(NAO_MEXE_EM_ADMIN, { status: 403 })
    }

    // ST sempre cria dentro da própria congregação; admin pode escolher.
    let congregacaoNova: string | null = null
    if (gestor.perfil === 'admin') {
      if (typeof congregacao === 'string' && congregacao.trim()) congregacaoNova = congregacao.trim()
    } else {
      if (!gestor.congregacao?.trim()) {
        return NextResponse.json({ error: 'Sua conta não tem congregação definida. Peça a um administrador.' }, { status: 403 })
      }
      congregacaoNova = gestor.congregacao
    }

    // Cria no Auth sem exigir confirmação de email
    const { data, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
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
      nome: nome.trim(),
      email: email.trim(),
      perfil,
      congregacao: congregacaoNova,
      ativo: true,
    })

    if (insertError) {
      // Rollback: remove do auth se falhou na tabela
      await supabaseAdmin.auth.admin.deleteUser(data.user.id)
      return NextResponse.json({ error: 'Não foi possível salvar o usuário.' }, { status: 500 })
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
    const gestor = await exigirGestor(req, supabaseAdmin)
    if (!gestor) return NextResponse.json(SEM_PERMISSAO, { status: 403 })

    const { id, nome, email, perfil, senha, ativo, congregacao } = await req.json() as {
      id: unknown; nome?: unknown; email?: unknown; perfil?: unknown; senha?: unknown
      ativo?: unknown; congregacao?: unknown
    }

    if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    // Valida tudo antes de gravar qualquer coisa, pra não ficar meio atualizado.
    if (perfil !== undefined && perfil !== '' && (typeof perfil !== 'string' || !PERFIS.includes(perfil))) {
      return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 })
    }
    if (nome !== undefined && nome !== '' && !textoValido(nome)) {
      return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 })
    }
    if (email !== undefined && email !== '' && !textoValido(email)) {
      return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
    }
    if (senha !== undefined && senha !== '' && (typeof senha !== 'string' || senha.length < SENHA_MINIMA)) {
      return NextResponse.json({ error: `Senha deve ter no mínimo ${SENHA_MINIMA} caracteres.` }, { status: 400 })
    }
    if (congregacao !== undefined && typeof congregacao !== 'string') {
      return NextResponse.json({ error: 'Congregação inválida.' }, { status: 400 })
    }
    if (ativo !== undefined && typeof ativo !== 'boolean') {
      return NextResponse.json({ error: 'Valor de "ativo" inválido.' }, { status: 400 })
    }

    if (!stPodeUsarPerfil(gestor, perfil as string | undefined)) {
      return NextResponse.json(NAO_MEXE_EM_ADMIN, { status: 403 })
    }
    const barrado = await barrarAlvo(supabaseAdmin, gestor, id)
    if (barrado) return barrado
    if (typeof congregacao === 'string' && !stDaCongregacao(gestor, congregacao)) {
      return NextResponse.json(OUTRA_CONGREGACAO, { status: 403 })
    }
    if (ativo === false && id === gestor.id) {
      return NextResponse.json({ error: 'Você não pode desativar a própria conta.' }, { status: 400 })
    }

    // Atualiza email, senha e bloqueio de login no Auth, se enviados. Conta
    // desativada fica banida no Auth: não loga nem renova o token.
    if (email || senha || typeof ativo === 'boolean') {
      const authUpdate: { email?: string; password?: string; ban_duration?: string } = {}
      if (email) authUpdate.email = (email as string).trim()
      if (senha) authUpdate.password = senha as string
      if (typeof ativo === 'boolean') authUpdate.ban_duration = ativo ? 'none' : '876000h'

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, authUpdate)
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 })
      }
    }

    // Atualiza dados na tabela usuarios
    const dadosTabela: { nome?: string; email?: string; perfil?: string; ativo?: boolean; congregacao?: string } = {}
    if (nome) dadosTabela.nome = (nome as string).trim()
    if (email) dadosTabela.email = (email as string).trim()
    if (perfil) dadosTabela.perfil = perfil as string
    if (typeof ativo === 'boolean') dadosTabela.ativo = ativo
    if (typeof congregacao === 'string') dadosTabela.congregacao = congregacao.trim()

    if (Object.keys(dadosTabela).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('usuarios')
        .update(dadosTabela)
        .eq('id', id)

      if (updateError) {
        return NextResponse.json({ error: 'Não foi possível salvar as alterações.' }, { status: 500 })
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
    const gestor = await exigirGestor(req, supabaseAdmin)
    if (!gestor) return NextResponse.json(SEM_PERMISSAO, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    if (id === gestor.id) {
      return NextResponse.json({ error: 'Você não pode excluir a própria conta.' }, { status: 400 })
    }
    const barrado = await barrarAlvo(supabaseAdmin, gestor, id)
    if (barrado) return barrado

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
