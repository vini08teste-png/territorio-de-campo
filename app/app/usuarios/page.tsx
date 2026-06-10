'use client'

import { useEffect, useState } from 'react'
import { supabase, CORES_PERFIL, type Usuario, type Perfil } from '@/lib/supabase'
import Link from 'next/link'

interface UsuarioComCongregacao extends Usuario {
  congregacao?: string
}

const PERFIS: { value: Perfil; label: string }[] = [
  { value: 'dirigente',                  label: 'Dirigente' },
  { value: 'superintendente_grupo',      label: 'Sup. de Grupo' },
  { value: 'superintendente_territorio', label: 'Sup. de Território' },
  { value: 'admin',                      label: 'Administrador' },
]

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioComCongregacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<UsuarioComCongregacao | null>(null)
  const [novoPerfil, setNovoPerfil] = useState<Perfil>('dirigente')
  const [novaCongregacao, setNovaCongregacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('usuarios')
      .select('*')
      .order('nome')
      .then(({ data }) => {
        setUsuarios(data ?? [])
        setCarregando(false)
      })
  }, [])

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

  function abrirEdicao(u: UsuarioComCongregacao) {
    setEditando(u)
    setNovoPerfil(u.perfil)
    setNovaCongregacao(u.congregacao ?? '')
  }

  async function salvarEdicao() {
    if (!editando) return

    setSalvando(true)

    const { error } = await supabase
      .from('usuarios')
      .update({
        perfil: novoPerfil,
        congregacao: novaCongregacao.trim(),
      })
      .eq('id', editando.id)

    if (error) {
      mostrarErro('Erro ao salvar edição.')
      setSalvando(false)
      return
    }

    setUsuarios((prev) =>
      prev.map((u) =>
        u.id === editando.id
          ? {
              ...u,
              perfil: novoPerfil,
              congregacao: novaCongregacao.trim(),
            }
          : u
      )
    )

    mostrarSucesso(`${editando.nome} atualizado!`)
    setEditando(null)
    setSalvando(false)
  }

  async function excluirUsuario(u: UsuarioComCongregacao) {
    if (!confirm(`Excluir permanentemente "${u.nome}"?`)) return

    setExcluindo(u.id)

    try {
      const res = await fetch(`/api/usuarios?id=${u.id}`, {
        method: 'DELETE',
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

  const termo = busca.trim().toLowerCase()

  const filtrados = usuarios.filter((u) =>
    u.nome.toLowerCase().includes(termo) ||
    u.email.toLowerCase().includes(termo) ||
    (u.congregacao ?? '').toLowerCase().includes(termo)
  )

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
          gap: 12,
        }}>
          {filtrados.map((u) => {
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
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            boxSizing: 'border-box',
          }}>
            <h2 style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#1A1A1A',
              margin: '0 0 4px',
            }}>
              Editar usuário
            </h2>

            <p style={{
              fontSize: 14,
              color: '#888',
              margin: '0 0 20px',
              overflowWrap: 'anywhere',
            }}>
              {editando.nome} · {editando.email}
            </p>

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

              <input
                type="text"
                value={novaCongregacao}
                onChange={(e) => setNovaCongregacao(e.target.value)}
                placeholder="ex: Congregação Central"
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
                      onClick={() => setNovoPerfil(p.value)}
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
