'use client'

import { useEffect, useState } from 'react'
import { supabase, CORES_STATUS, type Territorio, type Quadra } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'
import { calcularPrazoTerritorio, formatarPrazo } from '@/lib/prazoTerritorio'

interface DesignacaoSG {
  territorio_id: string
  data_inicio: string
}

export default function TerritoriosPage() {
  const { carregando: verificandoAcesso, autorizado } = usePaginaRestrita(['superintendente_territorio', 'admin'])
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [quadras, setQuadras] = useState<Quadra[]>([])
  const [designacoesSG, setDesignacoesSG] = useState<DesignacaoSG[]>([])
  const [prazoDias, setPrazoDias] = useState(120)
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState({ nome: '', numero: '', bairro: '' })
  const [editandoTerr, setEditandoTerr] = useState<Territorio | null>(null)
  const [formEdit, setFormEdit] = useState({ nome: '', numero: '', bairro: '' })
  const [editandoQuadra, setEditandoQuadra] = useState<Quadra | null>(null)
  const [formQuadra, setFormQuadra] = useState({ nome: '', territorio_id: '' })
  const [expandido, setExpandido] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      supabase.from('territorios').select('*').order('numero'),
      supabase.from('quadras').select('*').order('nome'),
      supabase.from('designacoes').select('territorio_id, data_inicio').is('quadra_id', null).is('data_fim', null),
      supabase.from('configuracoes').select('prazo_territorio_dias').eq('id', 1).single(),
    ]).then(([t, q, d, c]) => {
      setTerritorios(t.data ?? [])
      setQuadras(q.data ?? [])
      setDesignacoesSG((d.data as DesignacaoSG[]) ?? [])
      setPrazoDias(c.data?.prazo_territorio_dias ?? 120)
    })
  }, [])

  function mostrarSucesso(msg: string) { setSucesso(msg); setTimeout(() => setSucesso(null), 3000) }
  function mostrarErro(msg: string) { setErro(msg); setTimeout(() => setErro(null), 4000) }

  // ── Território ───────────────────────────────────────────────────────────────
  async function criarTerritorio(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('territorios')
      .insert({ ...form, status: 'nao_iniciado', criado_por: user?.id })
      .select().single()
    setSalvando(false)
    if (error) { mostrarErro('Erro ao criar território.'); return }
    if (data) setTerritorios((prev) => [...prev, data as Territorio].sort((a, b) => Number(a.numero) - Number(b.numero)))
    setCriando(false)
    setForm({ nome: '', numero: '', bairro: '' })
    mostrarSucesso('Território criado!')
  }

  async function salvarEdicaoTerr(e: React.FormEvent) {
    e.preventDefault()
    if (!editandoTerr) return
    setSalvando(true)
    const { error } = await supabase.from('territorios').update(formEdit).eq('id', editandoTerr.id)
    setSalvando(false)
    if (error) { mostrarErro('Erro ao salvar.'); return }
    setTerritorios((prev) => prev.map((t) => t.id === editandoTerr.id ? { ...t, ...formEdit } : t))
    setEditandoTerr(null)
    mostrarSucesso('Território atualizado!')
  }

  async function excluirTerritorio(t: Territorio) {
    const nQuadras = quadras.filter((q) => q.territorio_id === t.id).length
    const msg = nQuadras > 0
      ? `"${t.nome}" tem ${nQuadras} quadra(s). Excluir também excluirá as quadras. Confirma?`
      : `Excluir permanentemente "${t.nome}"?`
    if (!confirm(msg)) return
    if (nQuadras > 0) {
      await supabase.from('quadras').delete().eq('territorio_id', t.id)
      setQuadras((prev) => prev.filter((q) => q.territorio_id !== t.id))
    }
    const { error } = await supabase.from('territorios').delete().eq('id', t.id)
    if (error) { mostrarErro('Erro ao excluir.'); return }
    setTerritorios((prev) => prev.filter((x) => x.id !== t.id))
    mostrarSucesso(`"${t.nome}" excluído.`)
  }

  // ── Quadra ───────────────────────────────────────────────────────────────────
  function abrirEdicaoQuadra(q: Quadra) {
    setEditandoQuadra(q)
    setFormQuadra({ nome: q.nome, territorio_id: q.territorio_id })
  }

  async function salvarEdicaoQuadra(e: React.FormEvent) {
    e.preventDefault()
    if (!editandoQuadra) return
    setSalvando(true)
    const { error } = await supabase.from('quadras')
      .update({ nome: formQuadra.nome, territorio_id: formQuadra.territorio_id })
      .eq('id', editandoQuadra.id)
    setSalvando(false)
    if (error) { mostrarErro('Erro ao salvar quadra.'); return }
    setQuadras((prev) => prev.map((q) =>
      q.id === editandoQuadra.id ? { ...q, nome: formQuadra.nome, territorio_id: formQuadra.territorio_id } : q
    ))
    setEditandoQuadra(null)
    mostrarSucesso('Quadra atualizada!')
  }

  async function excluirQuadra(q: Quadra) {
    if (!confirm(`Excluir a quadra "${q.nome}"?`)) return
    const { error } = await supabase.from('quadras').delete().eq('id', q.id)
    if (error) { mostrarErro('Erro ao excluir quadra.'); return }
    setQuadras((prev) => prev.filter((x) => x.id !== q.id))
    mostrarSucesso(`Quadra "${q.nome}" excluída.`)
  }

  function calcPct(tid: string) {
    const qs = quadras.filter((q) => q.territorio_id === tid)
    if (!qs.length) return 0
    const pesos: Record<string, number> = { concluido: 1, parcial: 0.5, em_andamento: 0.25, nao_iniciado: 0, pendente: 0 }
    return Math.round(qs.reduce((a, q) => a + (pesos[q.status] ?? 0), 0) / qs.length * 100)
  }

  if (verificandoAcesso) return <Carregando />
  if (!autorizado) return <SemPermissao />

  return (
    <div style={{ padding: '1.5rem 1rem 4rem', maxWidth: 800, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Territórios</h1>
        <button onClick={() => setCriando(!criando)} style={{
          padding: '10px 18px', fontSize: 14, fontWeight: 600,
          background: criando ? '#F7F7F7' : '#3BAD68', color: criando ? '#555' : '#fff',
          border: criando ? '0.5px solid #DDD' : 'none', borderRadius: 10, cursor: 'pointer',
        }}>
          {criando ? '✕ Cancelar' : '+ Novo território'}
        </button>
      </div>

      {sucesso && <div style={{ background: '#EAF7EF', border: '1px solid #60C898', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#04342C', fontSize: 14 }}>✅ {sucesso}</div>}
      {erro && <div style={{ background: '#FFF0F0', border: '1px solid #E05050', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#501313', fontSize: 14 }}>⚠️ {erro}</div>}

      {/* Form criar território */}
      {criando && (
        <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: 16 }}>Novo território</h2>
          <form onSubmit={(e) => void criarTerritorio(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Nome</label>
                <input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required placeholder="Ex: Centro"
                  style={{ width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Número</label>
                <input value={form.numero} onChange={(e) => setForm((p) => ({ ...p, numero: e.target.value }))} required placeholder="01"
                  style={{ width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Bairro / Localidade</label>
              <input value={form.bairro} onChange={(e) => setForm((p) => ({ ...p, bairro: e.target.value }))} required placeholder="Ex: Bom Jardim"
                style={{ width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <button type="submit" disabled={salvando} style={{
              padding: '13px', fontSize: 15, fontWeight: 600,
              background: salvando ? '#CCC' : '#3BAD68', color: '#fff',
              border: 'none', borderRadius: 10, cursor: salvando ? 'not-allowed' : 'pointer',
            }}>
              {salvando ? 'Criando…' : 'Criar território'}
            </button>
          </form>
        </div>
      )}

      {/* Lista territórios */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {territorios.map((t) => {
          const pct = calcPct(t.id)
          const qs = quadras.filter((q) => q.territorio_id === t.id)
          const corPct = pct >= 100 ? '#3BAD68' : pct > 50 ? '#F0A030' : '#888'
          const aberto = expandido === t.id
          const designacao = designacoesSG.find((d) => d.territorio_id === t.id)
          const prazo = designacao ? calcularPrazoTerritorio(designacao.data_inicio, prazoDias) : null

          return (
            <div key={t.id} style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, overflow: 'hidden' }}>
              {/* Header do card */}
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>#{t.numero} — {t.nome}</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{t.bairro}</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: corPct, marginLeft: 12 }}>{pct}%</div>
                </div>

                <div style={{ height: 6, background: '#EEEEEE', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: corPct, borderRadius: 3 }} />
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: '#888' }}>{qs.length} quadra{qs.length !== 1 ? 's' : ''}</span>
                  {Object.entries(CORES_STATUS).map(([k, v]) => {
                    const qtd = qs.filter((q) => q.status === k).length
                    if (!qtd) return null
                    return <span key={k} style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: v.fill, border: `1px solid ${v.stroke}` }}>{qtd} {v.label}</span>
                  })}
                  {prazo && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: prazo.vencido ? '#FFF0F0' : '#F7F7F7',
                      color: prazo.vencido ? '#E05050' : '#666',
                      border: `1px solid ${prazo.vencido ? '#FFCCCC' : '#DDDDDD'}`,
                    }}>
                      {formatarPrazo(prazo)}
                    </span>
                  )}
                </div>

                {/* Ações território */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setExpandido(aberto ? null : t.id)} style={{
                    flex: 1, padding: '8px', fontSize: 13, fontWeight: 500,
                    background: aberto ? '#F0F0F0' : '#F7F7F7', color: '#1A1A1A',
                    border: '0.5px solid #DDD', borderRadius: 8, cursor: 'pointer',
                  }}>
                    {aberto ? '▲ Fechar quadras' : `▼ Ver quadras (${qs.length})`}
                  </button>
                  <button onClick={() => { setEditandoTerr(t); setFormEdit({ nome: t.nome, numero: t.numero, bairro: t.bairro }) }} style={{
                    padding: '8px 14px', fontSize: 13, fontWeight: 500,
                    background: '#F7F7F7', color: '#1A1A1A',
                    border: '0.5px solid #DDD', borderRadius: 8, cursor: 'pointer',
                  }}>✏️</button>
                  <button onClick={() => void excluirTerritorio(t)} style={{
                    padding: '8px 14px', fontSize: 13, fontWeight: 500,
                    background: '#FFF0F0', color: '#E05050',
                    border: '1px solid #FFCCCC', borderRadius: 8, cursor: 'pointer',
                  }}>🗑️</button>
                </div>
              </div>

              {/* Lista de quadras expansível */}
              {aberto && (
                <div style={{ borderTop: '0.5px solid #EEEEEE', background: '#FAFAFA' }}>
                  {qs.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#AAAAAA', padding: '12px 16px', margin: 0 }}>
                      Nenhuma quadra neste território.
                    </p>
                  ) : (
                    qs.map((q) => {
                      const c = CORES_STATUS[q.status] ?? CORES_STATUS['nao_iniciado']
                      return (
                        <div key={q.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 16px', borderBottom: '0.5px solid #EEEEEE',
                        }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.stroke, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 14, color: '#1A1A1A', fontWeight: 500 }}>{q.nome}</span>
                          <span style={{ fontSize: 11, color: '#888', marginRight: 8 }}>{c.label}</span>
                          <button onClick={() => abrirEdicaoQuadra(q)} style={{
                            padding: '5px 10px', fontSize: 12, fontWeight: 500,
                            background: '#F0F0F0', color: '#444',
                            border: '0.5px solid #DDD', borderRadius: 6, cursor: 'pointer',
                          }}>✏️</button>
                          <button onClick={() => void excluirQuadra(q)} style={{
                            padding: '5px 10px', fontSize: 12, fontWeight: 500,
                            background: '#FFF0F0', color: '#E05050',
                            border: '1px solid #FFCCCC', borderRadius: 6, cursor: 'pointer',
                          }}>🗑️</button>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
        {territorios.length === 0 && <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>Nenhum território. Crie o primeiro!</p>}
      </div>

      {/* Modal editar território */}
      {editandoTerr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditandoTerr(null) }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A', margin: '0 0 20px' }}>Editar território</h2>
            <form onSubmit={(e) => void salvarEdicaoTerr(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Nome</label>
                  <input value={formEdit.nome} onChange={(e) => setFormEdit((p) => ({ ...p, nome: e.target.value }))} required
                    style={{ width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Número</label>
                  <input value={formEdit.numero} onChange={(e) => setFormEdit((p) => ({ ...p, numero: e.target.value }))} required
                    style={{ width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Bairro</label>
                <input value={formEdit.bairro} onChange={(e) => setFormEdit((p) => ({ ...p, bairro: e.target.value }))} required
                  style={{ width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setEditandoTerr(null)} style={{ flex: 1, padding: '13px', fontSize: 15, fontWeight: 500, background: '#F7F7F7', color: '#555', border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={salvando} style={{ flex: 1, padding: '13px', fontSize: 15, fontWeight: 600, background: salvando ? '#CCC' : '#3BAD68', color: '#fff', border: 'none', borderRadius: 10, cursor: salvando ? 'not-allowed' : 'pointer' }}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar quadra */}
      {editandoQuadra && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditandoQuadra(null) }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A', margin: '0 0 20px' }}>Editar quadra</h2>
            <form onSubmit={(e) => void salvarEdicaoQuadra(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Nome da quadra</label>
                <input value={formQuadra.nome} onChange={(e) => setFormQuadra((p) => ({ ...p, nome: e.target.value }))} required
                  style={{ width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Território</label>
                <select value={formQuadra.territorio_id} onChange={(e) => setFormQuadra((p) => ({ ...p, territorio_id: e.target.value }))} required
                  style={{ width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none' }}>
                  <option value="">— Selecione —</option>
                  {territorios.map((t) => (
                    <option key={t.id} value={t.id}>#{t.numero} — {t.nome}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setEditandoQuadra(null)} style={{ flex: 1, padding: '13px', fontSize: 15, fontWeight: 500, background: '#F7F7F7', color: '#555', border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={salvando} style={{ flex: 1, padding: '13px', fontSize: 15, fontWeight: 600, background: salvando ? '#CCC' : '#3BAD68', color: '#fff', border: 'none', borderRadius: 10, cursor: salvando ? 'not-allowed' : 'pointer' }}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
