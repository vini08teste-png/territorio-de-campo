'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, CORES_PERFIL } from '@/lib/supabase'
import { getUsuarioAtual } from '@/lib/auth'

type Perfil = 'dirigente' | 'superintendente_grupo' | 'superintendente_territorio' | 'admin'

interface Usuario {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
}

interface Territorio {
  id: string
  nome: string
  numero: number
  bairro: string
  status: string
}

interface Designacao {
  id: string
  usuario_id: string
  territorio_id: string | null
  data_inicio: string
  data_fim: string | null
  usuario?: Usuario
  territorio?: Territorio
}

interface MembroGrupo {
  id: string
  dirigente_id: string
  sg_id: string
  data_inicio: string
  data_fim: string | null
  dirigente?: Usuario
  sg?: Usuario
}

const LABEL_PERFIL: Record<string, string> = {
  dirigente: 'Dirigente',
  superintendente_grupo: 'Sup. Grupo',
  superintendente_territorio: 'Sup. Território',
  admin: 'Admin',
}

function Avatar({ nome, perfil }: { nome: string; perfil: Perfil }) {
  const cores = CORES_PERFIL[perfil] ?? { bg: '#F0EEFF', acento: '#A090E0', texto: '#26215C' }
  const iniciais = nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 36, height: 36, borderRadius: '50%',
      background: cores.bg, color: cores.texto, border: `1.5px solid ${cores.acento}`,
      fontWeight: 600, fontSize: 13, flexShrink: 0,
    }}>
      {iniciais}
    </span>
  )
}

function BadgePerfil({ perfil }: { perfil: Perfil }) {
  const cores = CORES_PERFIL[perfil] ?? { bg: '#F0EEFF', acento: '#A090E0', texto: '#26215C' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
      background: cores.bg, color: cores.texto, border: `1px solid ${cores.acento}`,
      whiteSpace: 'nowrap',
    }}>
      {LABEL_PERFIL[perfil] ?? perfil}
    </span>
  )
}

export default function DesignarPage() {
  const router = useRouter()
  const [usuarioAtual, setUsuarioAtual] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [designacoes, setDesignacoes] = useState<Designacao[]>([])
  const [membros, setMembros] = useState<MembroGrupo[]>([])
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [sgsAtivos, setSgsAtivos] = useState<Usuario[]>([])
  const [dirigentesAtivos, setDirigentesAtivos] = useState<Usuario[]>([])
  const [formST, setFormST] = useState({ territorio_id: '', usuario_id: '' })
  const [formGrupo, setFormGrupo] = useState({ sg_id: '', dirigente_id: '' })

  function mostrarSucesso(msg: string) {
    setSucesso(msg)
    setTimeout(() => setSucesso(null), 3500)
  }
  function mostrarErro(msg: string) {
    setErro(msg)
    setTimeout(() => setErro(null), 5000)
  }

  // Toda a hierarquia herda o que quem está abaixo pode fazer:
  // admin e ST também designam SG a território e dirigente a grupo.
  const isAdmin = usuarioAtual?.perfil === 'admin'
  const isST = usuarioAtual?.perfil === 'superintendente_territorio'
  const isSG = usuarioAtual?.perfil === 'superintendente_grupo'
  const podeDesignarSG = isST || isAdmin
  const podeAdicionarMembro = isSG || isST || isAdmin

  // ── Território(s) designado(s) ao SG: territorio_id preenchido ─────────────
  const recarregarDesignacoes = useCallback(async (usuario: Usuario) => {
    let query = supabase
      .from('designacoes')
      .select('*, usuario:usuario_id(*), territorio:territorio_id(*)')
      .is('data_fim', null)
      .order('data_inicio', { ascending: false })

    // SG só vê o(s) território(s) designado(s) a ele mesmo.
    if (usuario.perfil === 'superintendente_grupo') {
      query = query.eq('usuario_id', usuario.id)
    }

    const { data } = await query
    setDesignacoes((data as Designacao[]) ?? [])
  }, [])

  // ── Dirigentes membros do grupo de um SG ────────────────────────────────────
  const recarregarMembros = useCallback(async (usuario: Usuario) => {
    let query = supabase
      .from('membros_grupo')
      .select('*, dirigente:dirigente_id(*), sg:sg_id(*)')
      .is('data_fim', null)
      .order('data_inicio', { ascending: false })

    // SG só vê os membros do próprio grupo.
    if (usuario.perfil === 'superintendente_grupo') {
      query = query.eq('sg_id', usuario.id)
    }

    const { data } = await query
    setMembros((data as MembroGrupo[]) ?? [])
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    const atual = await getUsuarioAtual()
    if (!atual) { setLoading(false); return }

    const { data: usuarioData } = await supabase
      .from('usuarios').select('*').eq('id', atual.id).single()
    const usuario: Usuario = usuarioData
    setUsuarioAtual(usuario)

    const souAdmin = usuario.perfil === 'admin'
    const souST = usuario.perfil === 'superintendente_territorio'
    const podeSG = souST || souAdmin

    if (podeSG) {
      const { data } = await supabase.from('territorios').select('*').order('numero')
      setTerritorios(data ?? [])

      const { data: sgs } = await supabase.from('usuarios').select('*')
        .eq('perfil', 'superintendente_grupo').eq('ativo', true).order('nome')
      setSgsAtivos(sgs ?? [])
    }

    const { data: dirigentes } = await supabase.from('usuarios').select('*')
      .eq('perfil', 'dirigente').eq('ativo', true).order('nome')
    setDirigentesAtivos(dirigentes ?? [])

    await recarregarDesignacoes(usuario)
    await recarregarMembros(usuario)
    setLoading(false)
  }, [recarregarDesignacoes, recarregarMembros])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  async function designarSG() {
    if (!formST.territorio_id || !formST.usuario_id) {
      mostrarErro('Selecione o território e o Sup. de Grupo.')
      return
    }
    const { data: existente } = await supabase.from('designacoes').select('id')
      .eq('territorio_id', formST.territorio_id).is('data_fim', null)
    if (existente && existente.length > 0) {
      mostrarErro('Este território já tem um Sup. de Grupo designado. Remova antes de designar outro.')
      return
    }
    setSalvando(true)
    const { error } = await supabase.from('designacoes').insert({
      usuario_id: formST.usuario_id,
      territorio_id: formST.territorio_id,
      data_inicio: new Date().toISOString(),
    })
    setSalvando(false)
    if (error) { mostrarErro('Erro ao salvar designação.'); return }
    setFormST({ territorio_id: '', usuario_id: '' })
    mostrarSucesso('Sup. de Grupo designado com sucesso!')
    void carregar()
  }

  async function removerDesignacao(id: string, nome: string) {
    if (!confirm(`Remover a designação de "${nome}"?`)) return
    const { error } = await supabase.from('designacoes')
      .update({ data_fim: new Date().toISOString() }).eq('id', id)
    if (error) { mostrarErro('Erro ao remover designação.'); return }
    mostrarSucesso('Designação removida.')
    void carregar()
  }

  async function adicionarMembro() {
    const sgId = isSG ? usuarioAtual!.id : formGrupo.sg_id
    if (!sgId || !formGrupo.dirigente_id) {
      mostrarErro(isSG ? 'Selecione o dirigente.' : 'Selecione o Sup. de Grupo e o dirigente.')
      return
    }

    const { data: existente } = await supabase.from('membros_grupo').select('id')
      .eq('dirigente_id', formGrupo.dirigente_id).is('data_fim', null)
    if (existente && existente.length > 0) {
      mostrarErro('Este dirigente já está em um grupo. Remova-o do grupo atual antes de trocar.')
      return
    }

    setSalvando(true)
    const { error } = await supabase.from('membros_grupo').insert({
      dirigente_id: formGrupo.dirigente_id,
      sg_id: sgId,
      data_inicio: new Date().toISOString(),
    })
    setSalvando(false)
    if (error) { mostrarErro('Erro ao adicionar ao grupo.'); return }
    setFormGrupo({ sg_id: '', dirigente_id: '' })
    mostrarSucesso('Dirigente adicionado ao grupo!')
    void carregar()
  }

  async function removerMembro(id: string, nome: string) {
    if (!confirm(`Remover "${nome}" do grupo?`)) return
    const { error } = await supabase.from('membros_grupo')
      .update({ data_fim: new Date().toISOString() }).eq('id', id)
    if (error) { mostrarErro('Erro ao remover do grupo.'); return }
    mostrarSucesso('Removido do grupo.')
    void carregar()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <p style={{ color: '#666', fontSize: 16 }}>Carregando…</p>
      </div>
    )
  }

  if (!usuarioAtual) return null

  if (!podeDesignarSG && !podeAdicionarMembro) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
        <p style={{ fontSize: 18 }}>Você não tem permissão para acessar esta página.</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Designações</h1>
        <p style={{ fontSize: 15, color: '#666', marginTop: 4 }}>
          {podeDesignarSG && podeAdicionarMembro
            ? 'Atribua Sup. de Grupo aos territórios e dirigentes aos grupos'
            : podeDesignarSG
            ? 'Atribua Sup. de Grupo aos territórios'
            : 'Adicione dirigentes ao seu grupo'}
        </p>
      </div>

      {sucesso && (
        <div style={{
          background: '#EAF7EF', border: '1px solid #60C898', borderRadius: 10,
          padding: '12px 16px', marginBottom: '1.5rem', color: '#04342C', fontSize: 15,
        }}>
          ✅ {sucesso}
        </div>
      )}
      {erro && (
        <div style={{
          background: '#FFF0F0', border: '1px solid #E05050', borderRadius: 10,
          padding: '12px 16px', marginBottom: '1.5rem', color: '#501313', fontSize: 15,
        }}>
          ⚠️ {erro}
        </div>
      )}

      {/* Formulário ST/admin → SG */}
      {podeDesignarSG && (
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem' }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              🗺️ Designar Sup. de Grupo a Território
            </h2>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#444', marginBottom: 6 }}>Território</label>
                <select
                  value={formST.territorio_id}
                  onChange={(e) => setFormST((f) => ({ ...f, territorio_id: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 16, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A' }}
                >
                  <option value="">— Selecione um território —</option>
                  {territorios.map((t) => (
                    <option key={t.id} value={t.id}>#{t.numero} — {t.nome} ({t.bairro})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#444', marginBottom: 6 }}>Sup. de Grupo</label>
                <select
                  value={formST.usuario_id}
                  onChange={(e) => setFormST((f) => ({ ...f, usuario_id: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', fontSize: 16, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A' }}
                >
                  <option value="">— Selecione o Sup. de Grupo —</option>
                  {sgsAtivos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              <button
                onClick={() => void designarSG()}
                disabled={salvando}
                style={{
                  width: '100%', padding: '16px', fontSize: 17, fontWeight: 600,
                  background: salvando ? '#CCCCCC' : '#3BAD68', color: '#FFFFFF',
                  border: 'none', borderRadius: 10, cursor: salvando ? 'not-allowed' : 'pointer', minHeight: 64,
                }}
              >
                {salvando ? 'Salvando…' : '✅ Confirmar Designação'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Formulário SG/ST/admin → adicionar dirigente ao grupo */}
      {podeAdicionarMembro && (
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem' }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              👥 Adicionar Dirigente ao Grupo
            </h2>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {!isSG && (
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#444', marginBottom: 6 }}>Sup. de Grupo</label>
                  <select
                    value={formGrupo.sg_id}
                    onChange={(e) => setFormGrupo((f) => ({ ...f, sg_id: e.target.value }))}
                    style={{ width: '100%', padding: '12px 14px', fontSize: 16, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A' }}
                  >
                    <option value="">— Selecione o Sup. de Grupo —</option>
                    {sgsAtivos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#444', marginBottom: 6 }}>Dirigente</label>
                {dirigentesAtivos.length === 0 ? (
                  <p style={{ color: '#999', fontSize: 15, margin: 0 }}>Nenhum dirigente ativo cadastrado.</p>
                ) : (
                  <select
                    value={formGrupo.dirigente_id}
                    onChange={(e) => setFormGrupo((f) => ({ ...f, dirigente_id: e.target.value }))}
                    style={{ width: '100%', padding: '12px 14px', fontSize: 16, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A' }}
                  >
                    <option value="">— Selecione o dirigente —</option>
                    {dirigentesAtivos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                )}
              </div>
              <button
                onClick={() => void adicionarMembro()}
                disabled={salvando || dirigentesAtivos.length === 0}
                style={{
                  width: '100%', padding: '16px', fontSize: 17, fontWeight: 600,
                  background: (salvando || dirigentesAtivos.length === 0) ? '#CCCCCC' : '#378ADD',
                  color: '#FFFFFF', border: 'none', borderRadius: 10,
                  cursor: (salvando || dirigentesAtivos.length === 0) ? 'not-allowed' : 'pointer', minHeight: 64,
                }}
              >
                {salvando ? 'Salvando…' : '✅ Adicionar ao Grupo'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Lista de territórios designados */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          🗺️ Territórios designados
          <span style={{ marginLeft: 'auto', fontSize: 13, background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 20, padding: '2px 10px', color: '#666' }}>
            {designacoes.length}
          </span>
        </h2>

        {designacoes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: '#F7F7F7', borderRadius: 12, border: '1px dashed #DDDDDD' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            <p style={{ fontSize: 16, color: '#666', margin: 0 }}>Nenhum território designado ainda.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {designacoes.map((d) => {
              const usuario = d.usuario
              const territorio = d.territorio
              const dataInicio = d.data_inicio
                ? new Date(d.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—'
              return (
                <div key={d.id} style={{
                  background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 10,
                  padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  {usuario && <Avatar nome={usuario.nome} perfil={usuario.perfil} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A' }}>{usuario?.nome ?? '—'}</span>
                      {usuario && <BadgePerfil perfil={usuario.perfil} />}
                    </div>
                    <div style={{ fontSize: 13, color: '#666', marginTop: 3 }}>
                      {territorio ? `${territorio.nome} — ${territorio.bairro}` : '—'}
                    </div>
                    <div style={{ fontSize: 12, color: '#AAAAAA', marginTop: 2 }}>Desde {dataInicio}</div>
                  </div>
                  {territorio && (
                    <button
                      onClick={() => router.push(
                        isST || isAdmin ? `/app/territorios?destaque=${territorio.id}` : '/app'
                      )}
                      style={{
                        flexShrink: 0, background: 'transparent', border: '1px solid #EEEEEE',
                        borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#378ADD', cursor: 'pointer',
                      }}
                    >
                      🗺️ Ver território
                    </button>
                  )}
                  <button
                    onClick={() => void removerDesignacao(d.id, usuario?.nome ?? 'esta pessoa')}
                    style={{
                      flexShrink: 0, background: 'transparent', border: '1px solid #EEEEEE',
                      borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#E05050', cursor: 'pointer',
                    }}
                  >
                    🗑️ Remover
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Lista de membros do grupo */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          👥 Membros do grupo
          <span style={{ marginLeft: 'auto', fontSize: 13, background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 20, padding: '2px 10px', color: '#666' }}>
            {membros.length}
          </span>
        </h2>

        {membros.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: '#F7F7F7', borderRadius: 12, border: '1px dashed #DDDDDD' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <p style={{ fontSize: 16, color: '#666', margin: 0 }}>Nenhum dirigente no grupo ainda.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {membros.map((m) => {
              const dirigente = m.dirigente
              const sg = m.sg
              const dataInicio = m.data_inicio
                ? new Date(m.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—'
              return (
                <div key={m.id} style={{
                  background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 10,
                  padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  {dirigente && <Avatar nome={dirigente.nome} perfil={dirigente.perfil} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A' }}>{dirigente?.nome ?? '—'}</span>
                      <BadgePerfil perfil="dirigente" />
                    </div>
                    <div style={{ fontSize: 13, color: '#666', marginTop: 3 }}>
                      {!isSG ? `Grupo de ${sg?.nome ?? '—'}` : `Desde ${dataInicio}`}
                    </div>
                    {!isSG && <div style={{ fontSize: 12, color: '#AAAAAA', marginTop: 2 }}>Desde {dataInicio}</div>}
                  </div>
                  <button
                    onClick={() => void removerMembro(m.id, dirigente?.nome ?? 'este dirigente')}
                    style={{
                      flexShrink: 0, background: 'transparent', border: '1px solid #EEEEEE',
                      borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#E05050', cursor: 'pointer',
                    }}
                  >
                    🗑️ Remover
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
