'use client'

import { useEffect, useState, useCallback } from 'react'
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

interface Quadra {
  id: string
  nome: string
  status: string
  territorio_id: string
}

interface Designacao {
  id: string
  usuario_id: string
  territorio_id: string | null
  quadra_id: string | null
  data_inicio: string
  data_fim: string | null
  usuario?: Usuario
  territorio?: Territorio
  quadra?: Quadra
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
  const [usuarioAtual, setUsuarioAtual] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [designacoes, setDesignacoes] = useState<Designacao[]>([])
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [quadras, setQuadras] = useState<Quadra[]>([])
  const [sgsAtivos, setSgsAtivos] = useState<Usuario[]>([])
  const [dirigentesAtivos, setDirigentesAtivos] = useState<Usuario[]>([])
  const [formST, setFormST] = useState({ territorio_id: '', usuario_id: '' })
  const [formSG, setFormSG] = useState({ quadra_id: '', usuario_id: '' })

  function mostrarSucesso(msg: string) {
    setSucesso(msg)
    setTimeout(() => setSucesso(null), 3500)
  }
  function mostrarErro(msg: string) {
    setErro(msg)
    setTimeout(() => setErro(null), 5000)
  }

  // Toda a hierarquia herda o que quem está abaixo pode fazer:
  // admin e ST também designam dirigentes; admin também designa SGs.
  const isAdmin = usuarioAtual?.perfil === 'admin'
  const isST = usuarioAtual?.perfil === 'superintendente_territorio'
  const isSG = usuarioAtual?.perfil === 'superintendente_grupo'
  const podeDesignarSG = isST || isAdmin
  const podeDesignarDirigente = isSG || isST || isAdmin

  // ── recarregarDesignacoes declarado ANTES de carregar ──────────────────────
  const recarregarDesignacoes = useCallback(async (
    usuario: Usuario,
    terrsDoSG: Territorio[]
  ) => {
    let query = supabase
      .from('designacoes')
      .select('*, usuario:usuario_id(*), territorio:territorio_id(*), quadra:quadra_id(*)')
      .is('data_fim', null)
      .order('data_inicio', { ascending: false })

    // Quem só é SG vê apenas as designações dos territórios dele.
    // ST/admin enxergam tudo (SG↔território e dirigente↔quadra).
    if (usuario.perfil === 'superintendente_grupo') {
      const terIds = terrsDoSG.map((t) => t.id)
      if (terIds.length) {
        query = query.in('territorio_id', terIds).not('quadra_id', 'is', null)
      } else {
        setDesignacoes([])
        return
      }
    }

    const { data } = await query
    setDesignacoes((data as Designacao[]) ?? [])
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
    const souSG = usuario.perfil === 'superintendente_grupo'
    const podeSG = souST || souAdmin
    const podeDirigente = souSG || souST || souAdmin

    // Territórios pro formulário ST→SG: todos, pra quem pode designar SG
    let terrsParaFormST: Territorio[] = []
    if (podeSG) {
      const { data } = await supabase.from('territorios').select('*').order('numero')
      terrsParaFormST = data ?? []
    }
    setTerritorios(terrsParaFormST)

    // Territórios do SG (só usado pra filtrar quadras e a lista de designações dele)
    let terrsDoSG: Territorio[] = []
    if (souSG) {
      const { data: desig } = await supabase
        .from('designacoes').select('territorio_id')
        .eq('usuario_id', usuario.id).is('quadra_id', null).is('data_fim', null)
      const ids = (desig ?? []).map((d) => d.territorio_id).filter(Boolean)
      if (ids.length) {
        const { data } = await supabase.from('territorios').select('*').in('id', ids).order('numero')
        terrsDoSG = data ?? []
      }
    }

    // Quadras pro formulário SG→Dirigente: só do SG se for só SG; todas se for ST/admin
    if (podeDirigente) {
      if (souST || souAdmin) {
        const { data } = await supabase.from('quadras').select('*').order('nome')
        setQuadras(data ?? [])
      } else if (terrsDoSG.length > 0) {
        const terIds = terrsDoSG.map((t) => t.id)
        const { data } = await supabase.from('quadras').select('*').in('territorio_id', terIds).order('nome')
        setQuadras(data ?? [])
      } else {
        setQuadras([])
      }
    }

    if (podeSG) {
      const { data } = await supabase.from('usuarios').select('*')
        .eq('perfil', 'superintendente_grupo').eq('ativo', true).order('nome')
      setSgsAtivos(data ?? [])
    }
    if (podeDirigente) {
      const { data } = await supabase.from('usuarios').select('*')
        .eq('perfil', 'dirigente').eq('ativo', true).order('nome')
      setDirigentesAtivos(data ?? [])
    }

    await recarregarDesignacoes(usuario, terrsDoSG)
    setLoading(false)
  }, [recarregarDesignacoes])

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
      .eq('territorio_id', formST.territorio_id).is('quadra_id', null).is('data_fim', null)
    if (existente && existente.length > 0) {
      mostrarErro('Este território já tem um Sup. de Grupo designado. Remova antes de designar outro.')
      return
    }
    setSalvando(true)
    const { error } = await supabase.from('designacoes').insert({
      usuario_id: formST.usuario_id,
      territorio_id: formST.territorio_id,
      quadra_id: null,
      data_inicio: new Date().toISOString(),
    })
    setSalvando(false)
    if (error) { mostrarErro('Erro ao salvar designação.'); return }
    setFormST({ territorio_id: '', usuario_id: '' })
    mostrarSucesso('Sup. de Grupo designado com sucesso!')
    void carregar()
  }

  async function designarDirigente() {
    if (!formSG.quadra_id || !formSG.usuario_id) {
      mostrarErro('Selecione a quadra e o dirigente.')
      return
    }
    const quadra = quadras.find((q) => q.id === formSG.quadra_id)
    if (!quadra) { mostrarErro('Quadra inválida.'); return }

    const { data: existente } = await supabase.from('designacoes').select('id')
      .eq('quadra_id', formSG.quadra_id).eq('usuario_id', formSG.usuario_id).is('data_fim', null)
    if (existente && existente.length > 0) {
      mostrarErro('Este dirigente já está designado para esta quadra.')
      return
    }

    // Evita dois dirigentes cobrindo a mesma quadra ao mesmo tempo
    const { data: outroDirigente } = await supabase.from('designacoes')
      .select('id, usuario:usuario_id(nome)')
      .eq('quadra_id', formSG.quadra_id).is('data_fim', null)
    if (outroDirigente && outroDirigente.length > 0) {
      const nomeOutro = (outroDirigente[0].usuario as unknown as { nome?: string } | null)?.nome ?? 'outro dirigente'
      mostrarErro(`Esta quadra já está designada a ${nomeOutro}. Remova a designação antes de trocar.`)
      return
    }

    setSalvando(true)
    const { error } = await supabase.from('designacoes').insert({
      usuario_id: formSG.usuario_id,
      territorio_id: quadra.territorio_id,
      quadra_id: formSG.quadra_id,
      data_inicio: new Date().toISOString(),
    })
    setSalvando(false)
    if (error) { mostrarErro('Erro ao salvar designação.'); return }
    setFormSG({ quadra_id: '', usuario_id: '' })
    mostrarSucesso('Dirigente designado com sucesso!')
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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <p style={{ color: '#666', fontSize: 16 }}>Carregando…</p>
      </div>
    )
  }

  if (!usuarioAtual) return null

  if (!podeDesignarSG && !podeDesignarDirigente) {
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
          {podeDesignarSG && podeDesignarDirigente
            ? 'Atribua Sup. de Grupo aos territórios e dirigentes às quadras'
            : podeDesignarSG
            ? 'Atribua Sup. de Grupo aos territórios'
            : 'Atribua dirigentes às quadras do seu território'}
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

      {/* Formulário SG/ST/admin → Dirigente */}
      {podeDesignarDirigente && (
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem' }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              👤 Designar Dirigente a Quadra
            </h2>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#444', marginBottom: 6 }}>Quadra</label>
                {quadras.length === 0 ? (
                  <p style={{ color: '#999', fontSize: 15, margin: 0 }}>Nenhuma quadra encontrada.</p>
                ) : (
                  <select
                    value={formSG.quadra_id}
                    onChange={(e) => setFormSG((f) => ({ ...f, quadra_id: e.target.value }))}
                    style={{ width: '100%', padding: '12px 14px', fontSize: 16, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A' }}
                  >
                    <option value="">— Selecione uma quadra —</option>
                    {quadras.map((q) => <option key={q.id} value={q.id}>{q.nome}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#444', marginBottom: 6 }}>Dirigente</label>
                {dirigentesAtivos.length === 0 ? (
                  <p style={{ color: '#999', fontSize: 15, margin: 0 }}>Nenhum dirigente ativo cadastrado.</p>
                ) : (
                  <select
                    value={formSG.usuario_id}
                    onChange={(e) => setFormSG((f) => ({ ...f, usuario_id: e.target.value }))}
                    style={{ width: '100%', padding: '12px 14px', fontSize: 16, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A' }}
                  >
                    <option value="">— Selecione o dirigente —</option>
                    {dirigentesAtivos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                )}
              </div>
              <button
                onClick={() => void designarDirigente()}
                disabled={salvando || quadras.length === 0 || dirigentesAtivos.length === 0}
                style={{
                  width: '100%', padding: '16px', fontSize: 17, fontWeight: 600,
                  background: (salvando || quadras.length === 0 || dirigentesAtivos.length === 0) ? '#CCCCCC' : '#378ADD',
                  color: '#FFFFFF', border: 'none', borderRadius: 10,
                  cursor: (salvando || quadras.length === 0 || dirigentesAtivos.length === 0) ? 'not-allowed' : 'pointer', minHeight: 64,
                }}
              >
                {salvando ? 'Salvando…' : '✅ Confirmar Designação'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Lista de designações */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          📋 Designações ativas
          <span style={{ marginLeft: 'auto', fontSize: 13, background: '#F7F7F7', border: '1px solid #EEEEEE', borderRadius: 20, padding: '2px 10px', color: '#666' }}>
            {designacoes.length}
          </span>
        </h2>

        {designacoes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: '#F7F7F7', borderRadius: 12, border: '1px dashed #DDDDDD' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <p style={{ fontSize: 16, color: '#666', margin: 0 }}>Nenhuma designação ativa ainda.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {designacoes.map((d) => {
              const usuario = d.usuario as Usuario | undefined
              const territorio = d.territorio as Territorio | undefined
              const quadra = d.quadra as Quadra | undefined
              const ehTerritorio = d.quadra_id === null
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
                      {ehTerritorio
                        ? territorio ? `🗺️ ${territorio.nome} — ${territorio.bairro}` : '—'
                        : quadra ? `📍 ${quadra.nome}` : '—'}
                    </div>
                    <div style={{ fontSize: 12, color: '#AAAAAA', marginTop: 2 }}>Desde {dataInicio}</div>
                  </div>
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
    </div>
  )
}
