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
    void supabase.from('usuarios').select('*').order('nome').then(({ data }) => {
      setUsuarios(data ?? [])
      setCarregando(false)
    })
  }, [])

  function mostrarSucesso(msg: string) { setSucesso(msg); setTimeout(() => setSucesso(null), 3000) }
  function mostrarErro(msg: string) { setErro(msg); setTimeout(() => setErro(null), 4000) }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from('usuarios').update({ ativo: !ativo }).eq('id', id)
    setUsuarios((prev) => prev.map((u) => u.id === id ? { ...u, ativo: !ativo } : u))
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
    const { error } = await supabase.from('usuarios')
      .update({ perfil: novoPerfil, congregacao: novaCongregacao.trim() })
      .eq('id', editando.id)
    if (!error) {
      setUsuarios((prev) => prev.map((u) =>
        u.id === editando.id ? { ...u, perfil: novoPerfil, congregacao: novaCongregacao.trim() } : u
      ))
      mostrarSucesso(`${editando.nome} atualizado!`)
      setEditando(null)
    }
    setSalvando(false)
  }

  async function excluirUsuario(u: UsuarioComCongregacao) {
    if (!confirm(`Excluir permanentemente "${u.nome}"?`)) return
    setExcluindo(u.id)
    const res = await fetch(`/api/usuarios?id=${u.id}`, { method: 'DELETE' })
    const data = await res.json() as { ok?: boolean; error?: string }
    setExcluindo(null)
    if (res.ok && data.ok) {
      setUsuarios((prev) => prev.filter((x) => x.id !== u.id))
      mostrarSucesso(`${u.nome} excluído.`)
    } else {
      mostrarErro(data.error ?? 'Erro ao excluir.')
    }
  }

  const filtrados = usuarios.filter((u) =>
    u.nome.toLowerCase().includes(busca.toLowerCase()) ||
    u.email.toLowerCase().includes(busca.toLowerCase()) ||
    (u.congregacao ?? '').toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div style={{ padding: '24px', maxWidth: 860, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Usuários</h1>
        <Link href="/app/usuarios/novo">
          <button style={{
            padding: '10px 18px', fontSize: 14, fontWeight: 600,
            background: '#3BAD68', color: '#fff',
            border: 'none', borderRadius: 10, cursor: 'pointer',
          }}>
            + Novo usuário
          </button>
        </Link>
      </div>

      {sucesso && <div style={{ background: '#EAF7EF', border: '1px solid #60C898', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#04342C', fontSize: 14 }}>✅ {sucesso}</div>}
      {erro && <div style={{ background: '#FFF0F0', border: '1px solid #E05050', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#501313', fontSize: 14 }}>⚠️ {erro}</div>}

      <input
        type="search" placeholder="Buscar por nome, email ou congregação…" value={busca}
        onChange={(e) => setBusca(e.target.value)}
        style={{
          width: '100%', padding: '11px 14px', fontSize: 15,
          border: '1px solid #DDDDDD', borderRadius: 10,
          background: '#FAFAFA', color: '#1A1A1A',
          marginBottom: 16, boxSizing: 'border-box', outline: 'none',
        }}
      />

      {carregando ? (
        <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>Carregando…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrados.map((u) => {
            const cores = CORES_PERFIL[u.perfil]
            return (
              <div key={u.id} style={{
                background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12,
                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
                opacity: u.ativo ? 1 : 0.5,
              }}>
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: cores.bg, border: `1.5px solid ${cores.acento}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 17, color: cores.texto,
                }}>
                  {u.nome.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#1A1A1A' }}>{u.nome}</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 1 }}>{u.email}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      background: cores.bg, color: cores.texto, border: `1px solid ${cores.acento}`,
                    }}>
                      {cores.label}
                    </span>
                    {u.congregacao && (
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                        background: '#F5F5F5', color: '#666', border: '1px solid #EEEEEE',
                      }}>
                        🏛️ {u.congregacao}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button onClick={() => abrirEdicao(u)} style={{
                    padding: '7px 12px', fontSize: 13, fontWeight: 500,
                    background: '#F7F7F7', color: '#1A1A1A',
                    border: '0.5px solid #DDDDDD', borderRadius: 8, cursor: 'pointer',
                  }}>
                    ✏️ Editar
                  </button>
                  <button onClick={() => void toggleAtivo(u.id, u.ativo)} style={{
                    padding: '7px 12px', fontSize: 13, fontWeight: 500,
                    background: u.ativo ? '#FFF0F0' : '#EAF7EF',
                    color: u.ativo ? '#E05050' : '#3BAD68',
                    border: `1px solid ${u.ativo ? '#FFCCCC' : '#B8EAC8'}`,
                    borderRadius: 8, cursor: 'pointer',
                  }}>
                    {u.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => void excluirUsuario(u)}
                    disabled={excluindo === u.id}
                    style={{
                      padding: '7px 12px', fontSize: 13, fontWeight: 500,
                      background: '#FFF0F0', color: '#E05050',
                      border: '1px solid #FFCCCC', borderRadius: 8,
                      cursor: excluindo === u.id ? 'not-allowed' : 'pointer',
                      opacity: excluindo === u.id ? 0.6 : 1,
                    }}
                  >
                    {excluindo === u.id ? '…' : '🗑️'}
                  </button>
                </div>
              </div>
            )
          })}
          {filtrados.length === 0 && (
            <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>Nenhum usuário encontrado.</p>
          )}
        </div>
      )}

      {/* Modal edição */}
      {editando && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }} onClick={(e) => { if (e.target === e.currentTarget) setEditando(null) }}>
          <div style={{
            background: '#FFFFFF', borderRadius: 16, padding: '28px 24px',
            width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A', margin: '0 0 4px' }}>Editar usuário</h2>
            <p style={{ fontSize: 14, color: '#888', margin: '0 0 20px' }}>{editando.nome} · {editando.email}</p>

            {/* Congregação */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>
                Congregação
              </label>
              <input
                type="text"
                value={novaCongregacao}
                onChange={(e) => setNovaCongregacao(e.target.value)}
                placeholder="ex: Congregação Central"
                style={{
                  width: '100%', padding: '11px 14px', fontSize: 15,
                  border: '1px solid #DDDDDD', borderRadius: 8,
                  background: '#FAFAFA', color: '#1A1A1A',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Perfil */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 8 }}>
                Perfil
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PERFIS.map((p) => {
                  const selecionado = novoPerfil === p.value
                  const cores = CORES_PERFIL[p.value]
                  return (
                    <button key={p.value} onClick={() => setNovoPerfil(p.value)} style={{
                      padding: '12px 16px', borderRadius: 10, textAlign: 'left',
                      border: selecionado ? `2px solid ${cores.acento}` : '1.5px solid #EEEEEE',
                      background: selecionado ? cores.bg : '#FFFFFF',
                      color: selecionado ? cores.texto : '#555',
                      fontSize: 14, fontWeight: selecionado ? 600 : 400, cursor: 'pointer',
                    }}>
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditando(null)} style={{
                flex: 1, padding: '13px', fontSize: 15, fontWeight: 500,
                background: '#F7F7F7', color: '#555',
                border: '0.5px solid #DDDDDD', borderRadius: 10, cursor: 'pointer',
              }}>Cancelar</button>
              <button
                onClick={() => void salvarEdicao()}
                disabled={salvando}
                style={{
                  flex: 1, padding: '13px', fontSize: 15, fontWeight: 600,
                  background: salvando ? '#CCCCCC' : '#3BAD68',
                  color: '#FFFFFF', border: 'none', borderRadius: 10,
                  cursor: salvando ? 'not-allowed' : 'pointer',
                }}
              >
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  )
}
