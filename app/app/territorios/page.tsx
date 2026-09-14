'use client'

import { useEffect, useState } from 'react'
import { supabase, CORES_STATUS, type Territorio, type Quadra } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'
import { calcularPrazoTerritorio, formatarPrazo } from '@/lib/prazoTerritorio'
import {
  formatarNumeroTerritorio, inteiroOuNulo, lerTerritoriosDoGeoJSON, linkComoChegar,
  resumoPublicadoresFamilias, textoOuNulo, type TerritorioImportado,
} from '@/lib/territorio'

interface DesignacaoSG {
  territorio_id: string
  data_inicio: string
}

interface PontoIdioma {
  quadra_id: string
  idioma: string | null
  qtd_pessoas: number | null
}

const FORM_VAZIO = { nome: '', numero: '', bairro: '', publicadores: '', familias: '', link_maps: '' }
type FormTerritorio = typeof FORM_VAZIO
type CampoExtra = 'publicadores' | 'familias' | 'link_maps'

function camposDoFormulario(form: FormTerritorio) {
  return {
    nome: form.nome,
    numero: form.numero,
    bairro: form.bairro,
    publicadores: inteiroOuNulo(form.publicadores),
    familias: inteiroOuNulo(form.familias),
    link_maps: textoOuNulo(form.link_maps),
  }
}

function valorDoCampo(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  return String(valor)
}

function formularioDoTerritorio(t: Territorio): FormTerritorio {
  return {
    nome: t.nome,
    numero: t.numero,
    bairro: valorDoCampo(t.bairro),
    publicadores: valorDoCampo(t.publicadores),
    familias: valorDoCampo(t.familias),
    link_maps: valorDoCampo(t.link_maps),
  }
}

// Só sobrescreve o que veio preenchido no arquivo
function camposDaImportacao(item: TerritorioImportado) {
  const campos: Record<string, unknown> = { geojson: item.geojson }
  if (item.publicadores !== null) campos.publicadores = item.publicadores
  if (item.familias !== null) campos.familias = item.familias
  if (item.link_maps !== null) campos.link_maps = item.link_maps
  return campos
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message
  return 'Arquivo inválido.'
}

export default function TerritoriosPage() {
  const { carregando: verificandoAcesso, autorizado } = usePaginaRestrita(['superintendente_territorio', 'admin'])
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [quadras, setQuadras] = useState<Quadra[]>([])
  const [designacoesSG, setDesignacoesSG] = useState<DesignacaoSG[]>([])
  const [pontosIdioma, setPontosIdioma] = useState<PontoIdioma[]>([])
  const [prazoDias, setPrazoDias] = useState(120)
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState<FormTerritorio>(FORM_VAZIO)
  const [editandoTerr, setEditandoTerr] = useState<Territorio | null>(null)
  const [formEdit, setFormEdit] = useState<FormTerritorio>(FORM_VAZIO)
  const [importando, setImportando] = useState(false)
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
      supabase.from('pontos_parada').select('quadra_id, idioma, qtd_pessoas').not('idioma', 'is', null),
    ]).then(([t, q, d, c, pi]) => {
      setTerritorios(t.data ?? [])
      setQuadras(q.data ?? [])
      setDesignacoesSG((d.data as DesignacaoSG[]) ?? [])
      setPrazoDias(c.data?.prazo_territorio_dias ?? 120)
      setPontosIdioma((pi.data as PontoIdioma[]) ?? [])
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
      .insert({ ...camposDoFormulario(form), status: 'nao_iniciado', criado_por: user?.id })
      .select().single()
    setSalvando(false)
    if (error) { mostrarErro('Erro ao criar território.'); return }
    if (data) setTerritorios((prev) => [...prev, data as Territorio].sort((a, b) => Number(a.numero) - Number(b.numero)))
    setCriando(false)
    setForm(FORM_VAZIO)
    mostrarSucesso('Território criado!')
  }

  async function salvarEdicaoTerr(e: React.FormEvent) {
    e.preventDefault()
    if (!editandoTerr) return
    setSalvando(true)
    const campos = camposDoFormulario(formEdit)
    const { error } = await supabase.from('territorios').update(campos).eq('id', editandoTerr.id)
    setSalvando(false)
    if (error) { mostrarErro('Erro ao salvar.'); return }
    setTerritorios((prev) => prev.map((t) => {
      if (t.id !== editandoTerr.id) return t
      return { ...t, ...campos }
    }))
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

  // Importa o territorios.geojson do editor: associa pelo número, atualiza o
  // contorno (e publicadores/famílias/link, se vierem) e cria os que faltam.
  async function importarContornos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return

    let lidos: TerritorioImportado[] = []
    let ignorados = 0
    try {
      const resultado = lerTerritoriosDoGeoJSON(JSON.parse(await arquivo.text()))
      lidos = resultado.territorios
      ignorados = resultado.ignorados
    } catch (erroLeitura) {
      mostrarErro(mensagemDeErro(erroLeitura))
      return
    }

    setImportando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const lista = [...territorios]
    let atualizados = 0
    let criados = 0
    let falhas = 0

    for (const item of lidos) {
      const indice = lista.findIndex((t) => Number(t.numero) === item.numero)
      if (indice >= 0) {
        const { data, error } = await supabase.from('territorios')
          .update(camposDaImportacao(item)).eq('id', lista[indice].id).select().single()
        if (error || !data) { falhas++; continue }
        lista[indice] = data as Territorio
        atualizados++
        continue
      }

      const numero = formatarNumeroTerritorio(item.numero)
      const { data, error } = await supabase.from('territorios').insert({
        ...camposDaImportacao(item),
        nome: item.localidade || `Território ${numero}`,
        numero,
        bairro: item.localidade,
        status: 'nao_iniciado',
        criado_por: user?.id,
      }).select().single()
      if (error || !data) { falhas++; continue }
      lista.push(data as Territorio)
      criados++
    }

    setTerritorios(lista.sort((a, b) => Number(a.numero) - Number(b.numero)))
    setImportando(false)

    const partes = [`${atualizados} atualizado(s)`, `${criados} criado(s)`]
    if (ignorados > 0) partes.push(`${ignorados} sem número ou contorno ignorado(s)`)
    if (falhas > 0) {
      mostrarErro(`Importação com falhas: ${falhas} território(s) não salvos. ${partes.join(', ')}.`)
      return
    }
    mostrarSucesso(`Contornos importados: ${partes.join(', ')}.`)
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

  function idiomaPorQuadra(qid: string) {
    const pts = pontosIdioma.filter((p) => p.quadra_id === qid)
    const pessoas = pts.reduce((s, p) => s + (p.qtd_pessoas ?? 1), 0)
    return { pessoas, pontos: pts.length }
  }

  function idiomaPorTerritorio(tid: string) {
    const qids = quadras.filter((q) => q.territorio_id === tid).map((q) => q.id)
    const pts = pontosIdioma.filter((p) => qids.includes(p.quadra_id))
    const pessoas = pts.reduce((s, p) => s + (p.qtd_pessoas ?? 1), 0)
    const quadrasComIdioma = new Set(pts.map((p) => p.quadra_id)).size
    return { pessoas, quadrasComIdioma }
  }

  function calcPct(tid: string) {
    const qs = quadras.filter((q) => q.territorio_id === tid)
    if (!qs.length) return 0
    const pesos: Record<string, number> = { concluido: 1, parcial: 0.5, em_andamento: 0.25, nao_iniciado: 0, pendente: 0 }
    return Math.round(qs.reduce((a, q) => a + (pesos[q.status] ?? 0), 0) / qs.length * 100)
  }

  if (verificandoAcesso) return <Carregando />
  if (!autorizado) return <SemPermissao />

  let textoImportar = '📥 Importar contornos'
  if (importando) textoImportar = 'Importando…'

  return (
    <div style={{ padding: '1.5rem 1rem 4rem', maxWidth: 800, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Territórios</h1>
        <div style={{ display: 'flex', gap: 8 }}>
        <label title="Arquivo territorios.geojson gerado pelo editor de territórios" style={{
          padding: '10px 14px', fontSize: 14, fontWeight: 600,
          background: '#F7F7F7', color: '#1A1A1A',
          border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer',
        }}>
          {textoImportar}
          <input type="file" accept=".geojson,.json,application/geo+json,application/json" hidden
            disabled={importando} onChange={(e) => void importarContornos(e)} />
        </label>
        <button onClick={() => setCriando(!criando)} style={{
          padding: '10px 18px', fontSize: 14, fontWeight: 600,
          background: criando ? '#F7F7F7' : '#3BAD68', color: criando ? '#555' : '#fff',
          border: criando ? '0.5px solid #DDD' : 'none', borderRadius: 10, cursor: 'pointer',
        }}>
          {criando ? '✕ Cancelar' : '+ Novo território'}
        </button>
        </div>
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
            <CamposExtras valores={form} alterar={(campo, valor) => setForm((p) => ({ ...p, [campo]: valor }))} />
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
          const rota = linkComoChegar(t)
          const resumo = resumoPublicadoresFamilias(t)
          const idiomaTerr = idiomaPorTerritorio(t.id)

          return (
            <div key={t.id} style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, overflow: 'hidden' }}>
              {/* Header do card */}
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>#{t.numero} — {t.nome}</div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{t.bairro}</div>
                    {resumo && <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{resumo}</div>}
                    {!t.geojson && (
                      <div style={{ fontSize: 12, color: '#B07A00', marginTop: 2 }}>Sem contorno no mapa</div>
                    )}
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
                  {idiomaTerr.pessoas > 0 && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: '#F0EAFF', color: '#6B3FD4', border: '1px solid #D9C6FF',
                    }}>
                      🌐 {idiomaTerr.pessoas} pessoa{idiomaTerr.pessoas > 1 ? 's' : ''} · {idiomaTerr.quadrasComIdioma} quadra{idiomaTerr.quadrasComIdioma > 1 ? 's' : ''}
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
                  {rota && (
                    <a href={rota} target="_blank" rel="noreferrer" title="Abrir a rota no Google Maps" style={{
                      padding: '8px 14px', fontSize: 13, fontWeight: 600,
                      background: '#E8F4FB', color: '#042C53', textDecoration: 'none',
                      border: '0.5px solid #70B8E0', borderRadius: 8,
                    }}>🧭 Como chegar</a>
                  )}
                  <button onClick={() => { setEditandoTerr(t); setFormEdit(formularioDoTerritorio(t)) }} style={{
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
                      const idiomaQ = idiomaPorQuadra(q.id)
                      return (
                        <div key={q.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 16px', borderBottom: '0.5px solid #EEEEEE',
                        }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.stroke, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 14, color: '#1A1A1A', fontWeight: 500 }}>{q.nome}</span>
                          {idiomaQ.pessoas > 0 && (
                            <span title={`${idiomaQ.pessoas} pessoa(s) de outro idioma`} style={{
                              padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                              background: '#F0EAFF', color: '#6B3FD4', border: '1px solid #D9C6FF',
                            }}>
                              🌐 {idiomaQ.pessoas}
                            </span>
                          )}
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
              <CamposExtras valores={formEdit} alterar={(campo, valor) => setFormEdit((p) => ({ ...p, [campo]: valor }))} />
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

// Publicadores, famílias e link do QR code (legenda do mapa geral e cartão S-12-T)
function CamposExtras({ valores, alterar }: {
  valores: FormTerritorio
  alterar: (campo: CampoExtra, valor: string) => void
}) {
  const estiloRotulo = { display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }
  const estiloCampo = {
    width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD',
    borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' as const,
  }
  return (
    <>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={estiloRotulo}>Publicadores</label>
          <input type="number" min={0} value={valores.publicadores}
            onChange={(e) => alterar('publicadores', e.target.value)} style={estiloCampo} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={estiloRotulo}>Famílias</label>
          <input type="number" min={0} value={valores.familias}
            onChange={(e) => alterar('familias', e.target.value)} style={estiloCampo} />
        </div>
      </div>
      <div>
        <label style={estiloRotulo}>Link do Google Maps (QR code do cartão)</label>
        <input type="url" value={valores.link_maps} placeholder="https://goo.gl/maps/…"
          onChange={(e) => alterar('link_maps', e.target.value)} style={estiloCampo} />
      </div>
    </>
  )
}
