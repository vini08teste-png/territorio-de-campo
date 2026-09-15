'use client'

import { useEffect, useState } from 'react'
import { supabase, CORES_PERFIL, type Usuario, type Perfil } from '@/lib/supabase'
import { getAccessToken } from '@/lib/auth'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'
import SeletorCongregacao from '@/components/SeletorCongregacao'
import Link from 'next/link'

type UsuarioComCongregacao = Usuario

interface TerritorioOpcao {
  id: string
  nome: string
  numero: string
  congregacao: string | null
}

const PERFIS: { value: Perfil; label: string }[] = [
  { value: 'dirigente',                  label: 'Dirigente' },
  { value: 'superintendente_grupo',      label: 'Sup. de Grupo' },
  { value: 'superintendente_territorio', label: 'Sup. de Território' },
  { value: 'admin',                      label: 'Administrador' },
]

export default function UsuariosPage() {
  const { carregando: verificandoAcesso, autorizado } = usePaginaRestrita(['admin'])
  const [usuarios, setUsuarios] = useState<UsuarioComCongregacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<UsuarioComCongregacao | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novoPerfil, setNovoPerfil] = useState<Perfil>('dirigente')
  const [novaCongregacao, setNovaCongregacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [territorios, setTerritorios] = useState<TerritorioOpcao[]>([])
  const [designacoesAtuais, setDesignacoesAtuais] = useState<{ id: string; valor: string }[]>([])
  const [designacoesSelecionadas, setDesignacoesSelecionadas] = useState<Set<string>>(new Set())
  const [carregandoDesignacao, setCarregandoDesignacao] = useState(false)
  // Dirigente: grupo (SG) em que está, em vez de quadras avulsas designadas
  const [grupoAtualId, setGrupoAtualId] = useState<string | null>(null)
  const [grupoAtualSgId, setGrupoAtualSgId] = useState<string | null>(null)
  const [grupoSgSelecionado, setGrupoSgSelecionado] = useState('')

  useEffect(() => {
    if (verificandoAcesso || !autorizado) return
    void Promise.all([
      supabase.from('usuarios').select('*').order('nome'),
      supabase.from('territorios').select('id, nome, numero, congregacao').order('numero'),
    ]).then(([u, t]) => {
      setUsuarios(u.data ?? [])
      setTerritorios((t.data as TerritorioOpcao[]) ?? [])
      const nomesCongregacoes = new Set(
        (u.data ?? []).map((usu: UsuarioComCongregacao) => usu.congregacao?.trim() || 'Sem congregação definida')
      )
      setRecolhidas(nomesCongregacoes)
      setCarregando(false)
    })
  }, [verificandoAcesso, autorizado])

  function mostrarSucesso(msg: string) {
    setSucesso(msg)
    setTimeout(() => setSucesso(null), 3000)
  }

  function mostrarErro(msg: string) {
    setErro(msg)
    setTimeout(() => setErro(null), 4000)
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    const { error } = await supabase
      .from('usuarios')
      .update({ ativo: !ativo })
      .eq('id', id)

    if (error) {
      mostrarErro('Erro ao alterar status do usuário.')
      return
    }

    setUsuarios((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ativo: !ativo } : u))
    )

    mostrarSucesso(ativo ? 'Usuário desativado.' : 'Usuário ativado.')
  }

  async function abrirEdicao(u: UsuarioComCongregacao) {
    setEditando(u)
    setNovoNome(u.nome)
    setNovoEmail(u.email)
    setNovaSenha('')
    setNovoPerfil(u.perfil)
    setNovaCongregacao(u.congregacao ?? '')
    setDesignacoesAtuais([])
    setDesignacoesSelecionadas(new Set())
    setGrupoAtualId(null)
    setGrupoAtualSgId(null)
    setGrupoSgSelecionado('')

    if (u.perfil === 'superintendente_grupo') {
      setCarregandoDesignacao(true)
      const { data } = await supabase
        .from('designacoes')
        .select('id, territorio_id')
        .eq('usuario_id', u.id)
        .is('quadra_id', null)
        .is('data_fim', null)
        .order('data_inicio', { ascending: false })

      const atuais = (data ?? []).map((d) => ({ id: d.id, valor: d.territorio_id ?? '' })).filter((d) => d.valor)
      setDesignacoesAtuais(atuais)
      setDesignacoesSelecionadas(new Set(atuais.map((d) => d.valor)))
      setCarregandoDesignacao(false)
    } else if (u.perfil === 'dirigente') {
      setCarregandoDesignacao(true)
      const { data } = await supabase
        .from('membros_grupo')
        .select('id, sg_id')
        .eq('dirigente_id', u.id)
        .is('data_fim', null)
        .maybeSingle()
      setGrupoAtualId(data?.id ?? null)
      setGrupoAtualSgId(data?.sg_id ?? null)
      setGrupoSgSelecionado(data?.sg_id ?? '')
      setCarregandoDesignacao(false)
    }
  }

  function alternarDesignacao(valor: string) {
    setDesignacoesSelecionadas((prev) => {
      const novo = new Set(prev)
      if (novo.has(valor)) novo.delete(valor)
      else novo.add(valor)
      return novo
    })
  }

  async function salvarEdicao() {
    if (!editando) return

    if (novaSenha && novaSenha.length < 6) {
      mostrarErro('Senha deve ter no mínimo 6 caracteres.')
      return
    }

    setSalvando(true)

    try {
      const token = await getAccessToken()
      const res = await fetch('/api/usuarios', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editando.id,
          nome: novoNome.trim(),
          email: novoEmail.trim(),
          perfil: novoPerfil,
          senha: novaSenha || undefined,
        }),
      })

      const data = (await res.json()) as { ok?: boolean; error?: string }

      if (!res.ok || data.error) {
        mostrarErro(data.error ?? 'Erro ao salvar edição.')
        return
      }

      const { error } = await supabase
        .from('usuarios')
        .update({ congregacao: novaCongregacao.trim() })
        .eq('id', editando.id)

      if (error) {
        mostrarErro('Dados salvos, mas houve erro ao salvar a congregação.')
        return
      }

      if (novoPerfil === 'superintendente_grupo') {
        // Só pode ficar designado a territórios da própria congregação
        const idsDaCongregacao = new Set(territoriosDaCongregacaoSelecionada.map((t) => t.id))
        const valoresOriginais = new Set(designacoesAtuais.map((d) => d.valor))
        const paraAdicionar = [...designacoesSelecionadas].filter((v) => idsDaCongregacao.has(v) && !valoresOriginais.has(v))
        const paraRemover = designacoesAtuais.filter((d) => !designacoesSelecionadas.has(d.valor) || !idsDaCongregacao.has(d.valor))

        if (paraAdicionar.length > 0) {
          const { data: conflitos } = await supabase
            .from('designacoes')
            .select('territorio_id')
            .in('territorio_id', paraAdicionar)
            .is('quadra_id', null)
            .is('data_fim', null)
            .neq('usuario_id', editando.id)

          if (conflitos && conflitos.length > 0) {
            mostrarErro('Dados salvos, mas um dos territórios selecionados já tem outro Sup. de Grupo.')
            return
          }
        }

        for (const d of paraRemover) {
          await supabase.from('designacoes').update({ data_fim: new Date().toISOString() }).eq('id', d.id)
        }
        for (const valor of paraAdicionar) {
          await supabase.from('designacoes').insert({
            usuario_id: editando.id,
            territorio_id: valor,
            data_inicio: new Date().toISOString(),
          })
        }

        // Perfil mudou de dirigente pra SG — sai do grupo que estava, se tinha
        if (grupoAtualId) {
          await supabase.from('membros_grupo').update({ data_fim: new Date().toISOString() }).eq('id', grupoAtualId)
        }
      } else if (novoPerfil === 'dirigente') {
        // Só pode entrar num grupo cujo Sup. de Grupo seja da mesma congregação
        const sgSelecionado = usuarios.find((u) => u.id === grupoSgSelecionado)
        const sgMesmaCongregacao = sgSelecionado &&
          (sgSelecionado.congregacao ?? '').trim().toLowerCase() === novaCongregacao.trim().toLowerCase()
        if (grupoSgSelecionado && !sgMesmaCongregacao) {
          mostrarErro('O Sup. de Grupo escolhido não é da mesma congregação dessa pessoa.')
          return
        }
        if (grupoSgSelecionado !== (grupoAtualSgId ?? '')) {
          if (grupoAtualId) {
            await supabase.from('membros_grupo').update({ data_fim: new Date().toISOString() }).eq('id', grupoAtualId)
          }
          if (grupoSgSelecionado) {
            const { error: erroGrupo } = await supabase.from('membros_grupo').insert({
              dirigente_id: editando.id,
              sg_id: grupoSgSelecionado,
              data_inicio: new Date().toISOString(),
            })
            if (erroGrupo) {
              mostrarErro('Dados salvos, mas houve erro ao atualizar o grupo.')
              return
            }
          }
        }

        // Perfil mudou de SG pra dirigente — encerra território(s) que tinha como SG
        for (const d of designacoesAtuais) {
          await supabase.from('designacoes').update({ data_fim: new Date().toISOString() }).eq('id', d.id)
        }
      } else {
        // Perfil não usa mais designação de território nem grupo — encerra tudo
        for (const d of designacoesAtuais) {
          await supabase.from('designacoes').update({ data_fim: new Date().toISOString() }).eq('id', d.id)
        }
        if (grupoAtualId) {
          await supabase.from('membros_grupo').update({ data_fim: new Date().toISOString() }).eq('id', grupoAtualId)
        }
      }

      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === editando.id
            ? {
                ...u,
                nome: novoNome.trim(),
                email: novoEmail.trim(),
                perfil: novoPerfil,
                congregacao: novaCongregacao.trim(),
              }
            : u
        )
      )

      mostrarSucesso(`${novoNome.trim()} atualizado!`)
      setEditando(null)
    } catch {
      mostrarErro('Erro de conexão ao salvar edição.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluirUsuario(u: UsuarioComCongregacao) {
    if (!confirm(`Excluir permanentemente "${u.nome}"?`)) return

    setExcluindo(u.id)

    try {
      const token = await getAccessToken()
      const res = await fetch(`/api/usuarios?id=${u.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      const data = (await res.json()) as { ok?: boolean; error?: string }

      if (res.ok && data.ok) {
        setUsuarios((prev) => prev.filter((x) => x.id !== u.id))
        mostrarSucesso(`${u.nome} excluído.`)
      } else {
        mostrarErro(data.error ?? 'Erro ao excluir.')
      }
    } catch {
      mostrarErro('Erro ao excluir usuário.')
    } finally {
      setExcluindo(null)
    }
  }

  const territoriosDaCongregacaoSelecionada = territorios.filter(
    (t) => (t.congregacao ?? '').trim().toLowerCase() === novaCongregacao.trim().toLowerCase()
  )

  const termo = busca.trim().toLowerCase()

  const filtrados = usuarios.filter((u) =>
    u.nome.toLowerCase().includes(termo) ||
    u.email.toLowerCase().includes(termo) ||
    (u.congregacao ?? '').toLowerCase().includes(termo)
  )

  const gruposPorCongregacao = (() => {
    const grupos = new Map<string, UsuarioComCongregacao[]>()
    for (const u of filtrados) {
      const chave = u.congregacao?.trim() || 'Sem congregação definida'
      const lista = grupos.get(chave) ?? []
      lista.push(u)
      grupos.set(chave, lista)
    }
    return Array.from(grupos.entries())
      .map(([nome, us]) => ({ nome, usuarios: us }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  })()

  function alternarRecolhida(nome: string) {
    setRecolhidas((prev) => {
      const novo = new Set(prev)
      if (novo.has(nome)) novo.delete(nome)
      else novo.add(nome)
      return novo
    })
  }

  if (verificandoAcesso) return <Carregando />
  if (!autorizado) return <SemPermissao />

  return (
    <div style={{
      padding: '16px 14px 100px',
      maxWidth: 860,
      margin: '0 auto',
      boxSizing: 'border-box',
      width: '100%',
    }}>

      {/* Cabeçalho */}
      <div className="usuarios-topo">
        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          color: '#1A1A1A',
          margin: 0,
          lineHeight: 1.1,
        }}>
          Usuários
        </h1>

        <Link href="/app/usuarios/novo" style={{ textDecoration: 'none' }}>
          <button className="botao-novo">
            + Novo usuário
          </button>
        </Link>
      </div>

      {sucesso && (
        <div style={{
          background: '#EAF7EF',
          border: '1px solid #60C898',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 16,
          color: '#04342C',
          fontSize: 14,
        }}>
          ✅ {sucesso}
        </div>
      )}

      {erro && (
        <div style={{
          background: '#FFF0F0',
          border: '1px solid #E05050',
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 16,
          color: '#501313',
          fontSize: 14,
        }}>
          ⚠️ {erro}
        </div>
      )}

      <input
        type="search"
        placeholder="Buscar por nome, email ou congregação…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        style={{
          width: '100%',
          padding: '13px 14px',
          fontSize: 15,
          border: '1px solid #DDDDDD',
          borderRadius: 10,
          background: '#FAFAFA',
          color: '#1A1A1A',
          marginBottom: 18,
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />

      {carregando ? (
        <p style={{
          textAlign: 'center',
          color: '#888',
          padding: 40,
        }}>
          Carregando…
        </p>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}>
        {gruposPorCongregacao.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              onClick={() => setRecolhidas(new Set())}
              style={{ fontSize: 12, fontWeight: 600, color: '#666', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              Expandir tudo
            </button>
            <button
              onClick={() => setRecolhidas(new Set(gruposPorCongregacao.map((g) => g.nome)))}
              style={{ fontSize: 12, fontWeight: 600, color: '#666', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            >
              Recolher tudo
            </button>
          </div>
        )}
        {gruposPorCongregacao.map((grupo) => {
        const recolhida = recolhidas.has(grupo.nome)
        return (
        <div key={grupo.nome}>
          <h2
            onClick={() => alternarRecolhida(grupo.nome)}
            style={{
              fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span style={{ display: 'inline-block', transition: 'transform 0.15s', transform: recolhida ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
            🏛️ {grupo.nome}
            <span style={{ fontWeight: 500, textTransform: 'none', color: '#AAAAAA' }}>
              {grupo.usuarios.length} usuário{grupo.usuarios.length !== 1 ? 's' : ''}
            </span>
          </h2>
          {!recolhida && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grupo.usuarios.map((u) => {
            const cores = CORES_PERFIL[u.perfil]

            return (
              <div
                key={u.id}
                className="usuario-card"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #EEEEEE',
                  borderRadius: 14,
                  padding: 14,
                  opacity: u.ativo ? 1 : 0.55,
                  boxSizing: 'border-box',
                  width: '100%',
                }}
              >
                {/* Linha principal: avatar + informações */}
                <div className="usuario-main">
                  <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: cores.bg,
                    border: `1.5px solid ${cores.acento}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 20,
                    color: cores.texto,
                  }}>
                    {u.nome.charAt(0).toUpperCase()}
                  </div>

                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    width: '100%',
                  }}>
                    <div className="usuario-nome">
                      {u.nome}
                    </div>

                    <div className="usuario-email" title={u.email}>
                      {u.email}
                    </div>

                    <div style={{
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      marginTop: 8,
                    }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '3px 9px',
                        borderRadius: 20,
                        background: cores.bg,
                        color: cores.texto,
                        border: `1px solid ${cores.acento}`,
                        lineHeight: 1.2,
                      }}>
                        {cores.label}
                      </span>

                      {u.congregacao && (
                        <span style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '3px 9px',
                          borderRadius: 20,
                          background: '#F5F5F5',
                          color: '#666',
                          border: '1px solid #EEEEEE',
                          lineHeight: 1.2,
                        }}>
                          🏛️ {u.congregacao}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações sempre ficam embaixo no card para não estourar no celular */}
                <div className="usuario-actions">
                  <button
                    onClick={() => abrirEdicao(u)}
                    className="btn-editar"
                  >
                    ✏️ Editar
                  </button>

                  <button
                    onClick={() => void toggleAtivo(u.id, u.ativo)}
                    className="btn-status"
                    style={{
                      background: u.ativo ? '#FFF0F0' : '#EAF7EF',
                      color: u.ativo ? '#E05050' : '#3BAD68',
                      border: `1px solid ${u.ativo ? '#FFCCCC' : '#B8EAC8'}`,
                    }}
                  >
                    {u.ativo ? 'Desativar' : 'Ativar'}
                  </button>

                  <button
                    onClick={() => void excluirUsuario(u)}
                    disabled={excluindo === u.id}
                    className="btn-excluir"
                    style={{
                      cursor: excluindo === u.id ? 'not-allowed' : 'pointer',
                      opacity: excluindo === u.id ? 0.6 : 1,
                    }}
                    aria-label={`Excluir ${u.nome}`}
                  >
                    {excluindo === u.id ? '…' : '🗑️'}
                  </button>
                </div>
              </div>
            )
          })}
          </div>
          )}
        </div>
        )
        })}

          {filtrados.length === 0 && (
            <p style={{
              textAlign: 'center',
              color: '#888',
              padding: 40,
            }}>
              Nenhum usuário encontrado.
            </p>
          )}
        </div>
      )}

      {/* Modal edição */}
      {editando && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditando(null)
          }}
        >
          <div style={{
            background: '#FFFFFF',
            borderRadius: 16,
            padding: '28px 24px',
            width: '100%',
            maxWidth: 420,
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            boxSizing: 'border-box',
          }}>
            <h2 style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#1A1A1A',
              margin: '0 0 20px',
            }}>
              Editar usuário
            </h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: '#444',
                marginBottom: 6,
              }}>
                Nome
              </label>

              <input
                type="text"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Nome completo"
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  fontSize: 15,
                  border: '1px solid #DDDDDD',
                  borderRadius: 8,
                  background: '#FAFAFA',
                  color: '#1A1A1A',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: '#444',
                marginBottom: 6,
              }}>
                Email
              </label>

              <input
                type="email"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                placeholder="email@exemplo.com"
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  fontSize: 15,
                  border: '1px solid #DDDDDD',
                  borderRadius: 8,
                  background: '#FAFAFA',
                  color: '#1A1A1A',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: '#444',
                marginBottom: 6,
              }}>
                Nova senha
              </label>

              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Deixe em branco para não alterar"
                minLength={6}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  fontSize: 15,
                  border: '1px solid #DDDDDD',
                  borderRadius: 8,
                  background: '#FAFAFA',
                  color: '#1A1A1A',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: '#444',
                marginBottom: 6,
              }}>
                Congregação
              </label>

              <SeletorCongregacao valor={novaCongregacao} onChange={setNovaCongregacao} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: '#444',
                marginBottom: 8,
              }}>
                Perfil
              </label>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                {PERFIS.map((p) => {
                  const selecionado = novoPerfil === p.value
                  const cores = CORES_PERFIL[p.value]

                  return (
                    <button
                      key={p.value}
                      onClick={() => { setNovoPerfil(p.value); setDesignacoesSelecionadas(new Set()) }}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        textAlign: 'left',
                        border: selecionado
                          ? `2px solid ${cores.acento}`
                          : '1.5px solid #EEEEEE',
                        background: selecionado ? cores.bg : '#FFFFFF',
                        color: selecionado ? cores.texto : '#555',
                        fontSize: 14,
                        fontWeight: selecionado ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {novoPerfil === 'superintendente_grupo' && (
              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#444',
                  marginBottom: 6,
                }}>
                  Territórios designados
                  <span style={{ fontWeight: 400, color: '#999' }}> — pode marcar mais de um</span>
                </label>

                {carregandoDesignacao ? (
                  <p style={{ fontSize: 13, color: '#999', margin: 0 }}>Carregando…</p>
                ) : (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    maxHeight: 220, overflowY: 'auto',
                    border: '1px solid #DDDDDD', borderRadius: 8,
                    background: '#FAFAFA', padding: 8,
                  }}>
                    {territoriosDaCongregacaoSelecionada.length === 0 && (
                      <span style={{ fontSize: 13, color: '#999', padding: 4 }}>
                        {novaCongregacao.trim()
                          ? 'Nenhum território cadastrado nessa congregação.'
                          : 'Defina a congregação da pessoa para listar os territórios dela.'}
                      </span>
                    )}

                    {territoriosDaCongregacaoSelecionada.map((t) => {
                      const marcado = designacoesSelecionadas.has(t.id)
                      return (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 14, color: '#1A1A1A', cursor: 'pointer' }}>
                          <input type="checkbox" checked={marcado} onChange={() => alternarDesignacao(t.id)} />
                          #{t.numero} — {t.nome}
                        </label>
                      )
                    })}
                  </div>
                )}
                <p style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
                  Os territórios que essa pessoa supervisiona e valida — apenas da mesma congregação dela.
                </p>
              </div>
            )}

            {novoPerfil === 'dirigente' && (
              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#444',
                  marginBottom: 6,
                }}>
                  Grupo (Sup. de Grupo)
                </label>

                {carregandoDesignacao ? (
                  <p style={{ fontSize: 13, color: '#999', margin: 0 }}>Carregando…</p>
                ) : (
                  <select
                    value={grupoSgSelecionado}
                    onChange={(e) => setGrupoSgSelecionado(e.target.value)}
                    style={{
                      width: '100%', padding: '11px 14px', fontSize: 15,
                      border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">— Nenhum grupo —</option>
                    {usuarios
                      .filter((u) =>
                        u.perfil === 'superintendente_grupo' && u.ativo &&
                        (u.congregacao ?? '').trim().toLowerCase() === novaCongregacao.trim().toLowerCase()
                      )
                      .map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                )}
                <p style={{ fontSize: 12, color: '#999', marginTop: 6 }}>
                  Ao entrar num grupo, a pessoa passa a ver e marcar todas as quadras dos territórios já designados a esse Sup. de Grupo — só aparecem Sup. de Grupo da mesma congregação dela.
                </p>
              </div>
            )}

            <div style={{
              display: 'flex',
              gap: 10,
            }}>
              <button
                onClick={() => setEditando(null)}
                style={{
                  flex: 1,
                  padding: '13px',
                  fontSize: 15,
                  fontWeight: 500,
                  background: '#F7F7F7',
                  color: '#555',
                  border: '0.5px solid #DDDDDD',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>

              <button
                onClick={() => void salvarEdicao()}
                disabled={salvando}
                style={{
                  flex: 1,
                  padding: '13px',
                  fontSize: 15,
                  fontWeight: 600,
                  background: salvando ? '#CCCCCC' : '#3BAD68',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 10,
                  cursor: salvando ? 'not-allowed' : 'pointer',
                }}
              >
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .usuarios-topo {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .botao-novo {
          padding: 12px 20px;
          font-size: 15px;
          font-weight: 700;
          background: #3BAD68;
          color: #FFFFFF;
          border: none;
          border-radius: 11px;
          cursor: pointer;
          white-space: nowrap;
        }

        .usuario-main {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          min-width: 0;
        }

        .usuario-nome {
          font-weight: 800;
          font-size: 16px;
          color: #1A1A1A;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .usuario-email {
          font-size: 14px;
          color: #888888;
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
        }

        .usuario-actions {
          display: grid;
          grid-template-columns: 1fr 1fr 48px;
          gap: 8px;
          margin-top: 14px;
          width: 100%;
        }

        .usuario-actions button {
          min-height: 40px;
          border-radius: 9px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }

        .btn-editar {
          background: #F7F7F7;
          color: #1A1A1A;
          border: 1px solid #DDDDDD;
        }

        .btn-status {
          border: 1px solid #FFCCCC;
        }

        .btn-excluir {
          background: #FFF0F0;
          color: #E05050;
          border: 1px solid #FFCCCC;
        }

        @media (min-width: 720px) {
          .usuario-card {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 12px;
          }

          .usuario-actions {
            width: auto;
            min-width: 280px;
            margin-top: 0;
            grid-template-columns: auto auto 44px;
          }

          .usuario-actions button {
            min-height: 36px;
            padding-left: 12px;
            padding-right: 12px;
          }
        }

        @media (max-width: 420px) {
          .usuarios-topo {
            align-items: flex-start;
          }

          .botao-novo {
            padding: 11px 14px;
            font-size: 14px;
          }

          .usuario-card {
            padding: 13px !important;
          }

          .usuario-main {
            gap: 12px;
          }

          .usuario-nome {
            font-size: 16px;
          }

          .usuario-email {
            font-size: 13px;
          }

          .usuario-actions {
            grid-template-columns: 1fr 1fr 44px;
          }

          .usuario-actions button {
            font-size: 13px;
            min-height: 39px;
          }
        }
      `}</style>
    </div>
  )
}
