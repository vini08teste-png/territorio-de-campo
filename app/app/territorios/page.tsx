'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, buscarTodos, CORES_STATUS, type Territorio, type Quadra } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'
import SeletorCongregacao from '@/components/SeletorCongregacao'
import { calcularPrazoTerritorio, formatarPrazo } from '@/lib/prazoTerritorio'
import { useMapaPrazoPorCongregacao } from '@/lib/congregacoes'
import { formatarNumeroTerritorio, linkComoChegar, textoOuNulo } from '@/lib/territorio'

interface DesignacaoSG {
  territorio_id: string
  data_inicio: string
}

interface PontoIdioma {
  quadra_id: string
  idioma: string | null
  qtd_pessoas: number | null
}

// Sentinela pra abrir/fechar a lista de quadras sem território no mesmo
// acordeão de "expandido" usado pelos cards de território (ids são uuids,
// nunca colidem com essa string)
const SEM_TERRITORIO = 'sem-territorio'

// Mesma chave que components/Mapa.tsx lê pra saber qual território
// desenhar assim que o mapa abrir.
const CHAVE_DESENHAR_TERRITORIO = 'territorio_de_campo:desenhar_territorio_id'
const CHAVE_EDITAR_TERRITORIO = 'territorio_de_campo:editar_territorio_id'

const FORM_VAZIO = { nome: '', numero: '', bairro: '', link_maps: '', congregacao: '', cor: '' }
type FormTerritorio = typeof FORM_VAZIO
type CampoExtra = 'link_maps' | 'congregacao' | 'cor'

function camposDoFormulario(form: FormTerritorio) {
  return {
    nome: form.nome,
    numero: form.numero,
    bairro: form.bairro,
    link_maps: textoOuNulo(form.link_maps),
    congregacao: textoOuNulo(form.congregacao),
    cor: textoOuNulo(form.cor),
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
    link_maps: valorDoCampo(t.link_maps),
    congregacao: valorDoCampo(t.congregacao),
    cor: valorDoCampo(t.cor),
  }
}

export default function TerritoriosPage() {
  const router = useRouter()
  const { usuario, carregando: verificandoAcesso, autorizado } = usePaginaRestrita(['superintendente_territorio', 'admin'])
  const souAdmin = usuario?.perfil === 'admin'
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [quadras, setQuadras] = useState<Quadra[]>([])
  const [designacoesSG, setDesignacoesSG] = useState<DesignacaoSG[]>([])
  const [pontosIdioma, setPontosIdioma] = useState<PontoIdioma[]>([])
  const { prazoDe } = useMapaPrazoPorCongregacao()
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState<FormTerritorio>(FORM_VAZIO)
  const [editandoTerr, setEditandoTerr] = useState<Territorio | null>(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [formEdit, setFormEdit] = useState<FormTerritorio>(FORM_VAZIO)
  const [editandoQuadra, setEditandoQuadra] = useState<Quadra | null>(null)
  const [formQuadra, setFormQuadra] = useState({ nome: '', territorio_id: '' })
  const [expandido, setExpandido] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      supabase.from('territorios').select('*').order('numero'),
      buscarTodos('quadras').then((data) => ({ data: data.sort((a, b) => String(a.nome).localeCompare(String(b.nome))) })),
      supabase.from('designacoes').select('territorio_id, data_inicio').is('quadra_id', null).is('data_fim', null),
      supabase.from('pontos_parada').select('quadra_id, idioma, qtd_pessoas').not('idioma', 'is', null),
    ]).then(([t, q, d, pi]) => {
      setTerritorios(t.data ?? [])
      setQuadras(q.data ?? [])
      setDesignacoesSG((d.data as DesignacaoSG[]) ?? [])
      setPontosIdioma((pi.data as PontoIdioma[]) ?? [])
    })
  }, [])

  function mostrarSucesso(msg: string) { setSucesso(msg); setTimeout(() => setSucesso(null), 3000) }
  function mostrarErro(msg: string) { setErro(msg); setTimeout(() => setErro(null), 4000) }

  function irDesenharContorno(territorioId: string) {
    localStorage.setItem(CHAVE_DESENHAR_TERRITORIO, territorioId)
    router.push('/app')
  }

  function irEditarContorno(territorioId: string) {
    localStorage.setItem(CHAVE_EDITAR_TERRITORIO, territorioId)
    router.push('/app')
  }

  // Sugere o próximo número livre (maior número atual + 1) ao abrir o
  // formulário de criação — o ST não precisa mais descobrir na mão qual é o
  // próximo; ainda dá pra editar o campo se precisar de outro número.
  function proximoNumeroTerritorio(): string {
    const maior = territorios.reduce((max, t) => Math.max(max, Number(t.numero) || 0), 0)
    return formatarNumeroTerritorio(maior + 1)
  }

  // ── Território ───────────────────────────────────────────────────────────────
  async function criarTerritorio(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const campos = camposDoFormulario(form)
    const { data, error } = await supabase.from('territorios')
      .insert({
        ...campos,
        congregacao: souAdmin ? campos.congregacao : usuario?.congregacao ?? null,
        status: 'nao_iniciado',
        criado_por: user?.id,
      })
      .select().single()
    setSalvando(false)
    if (error) { mostrarErro(`Erro ao criar território: ${error.message}`); return }
    if (data) {
      const novoTerritorio = data as Territorio
      setTerritorios((prev) => [...prev, novoTerritorio].sort((a, b) => Number(a.numero) - Number(b.numero)))
      // Abre direto na edição, já com o botão de desenhar contorno visível
      setEditandoTerr(novoTerritorio)
      setFormEdit(formularioDoTerritorio(novoTerritorio))
    }
    setCriando(false)
    setForm(FORM_VAZIO)
    mostrarSucesso('Território criado! Agora você pode desenhar o contorno dele no mapa.')
  }

  async function enviarFotoMarco(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo || !editandoTerr) return

    setEnviandoFoto(true)
    const extensao = arquivo.name.split('.').pop() || 'jpg'
    const caminho = `${editandoTerr.id}/marco-${Date.now()}.${extensao}`

    const { error: erroUpload } = await supabase.storage.from('territorios').upload(caminho, arquivo, {
      cacheControl: '3600', upsert: false,
    })
    if (erroUpload) {
      setEnviandoFoto(false)
      mostrarErro('Erro ao enviar a foto.')
      return
    }

    const { data: publica } = supabase.storage.from('territorios').getPublicUrl(caminho)
    const { error: erroSalvar } = await supabase.from('territorios')
      .update({ foto_marco: publica.publicUrl }).eq('id', editandoTerr.id)
    setEnviandoFoto(false)
    if (erroSalvar) { mostrarErro('Foto enviada, mas houve erro ao salvar no território.'); return }

    setEditandoTerr((prev) => prev && { ...prev, foto_marco: publica.publicUrl })
    setTerritorios((prev) => prev.map((t) => t.id === editandoTerr.id ? { ...t, foto_marco: publica.publicUrl } : t))
    mostrarSucesso('Foto do marco atualizada!')
  }

  async function salvarEdicaoTerr(e: React.FormEvent) {
    e.preventDefault()
    if (!editandoTerr) return
    setSalvando(true)
    const campos = {
      ...camposDoFormulario(formEdit),
      ...(souAdmin ? {} : { congregacao: usuario?.congregacao ?? null }),
    }
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

  // ── Quadra ───────────────────────────────────────────────────────────────────
  function abrirEdicaoQuadra(q: Quadra) {
    setEditandoQuadra(q)
    setFormQuadra({ nome: q.nome, territorio_id: q.territorio_id ?? '' })
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

  const quadrasSemTerritorio = quadras.filter((q) => !q.territorio_id)
  const semTerritorioAberto = expandido === SEM_TERRITORIO

  const termo = busca.trim().toLowerCase()
  const territoriosFiltrados = termo
    ? territorios.filter((t) =>
        t.nome.toLowerCase().includes(termo) ||
        String(t.numero).toLowerCase().includes(termo) ||
        (t.bairro ?? '').toLowerCase().includes(termo)
      )
    : territorios

  // Agrupa por congregação — cada admin enxerga territórios de várias.
  const gruposPorCongregacao = (() => {
    const grupos = new Map<string, Territorio[]>()
    for (const t of territoriosFiltrados) {
      const chave = t.congregacao?.trim() || 'Sem congregação definida'
      const lista = grupos.get(chave) ?? []
      lista.push(t)
      grupos.set(chave, lista)
    }
    return Array.from(grupos.entries())
      .map(([nome, terrs]) => ({ nome, territorios: terrs }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  })()

  return (
    <div style={{ padding: '1.5rem 1rem 4rem', maxWidth: 800, margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Territórios</h1>
        <div style={{ display: 'flex', gap: 8 }}>
        <Link href="/app/territorios/importar-cadastro" title="Calibrar e importar as quadras do mapa oficial da prefeitura (PDF)" style={{
          padding: '10px 14px', fontSize: 14, fontWeight: 600,
          background: '#F7F7F7', color: '#1A1A1A',
          border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer',
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
        }}>
          📐 Importar do PDF
        </Link>
        <button onClick={() => {
          if (!criando) {
            setForm((p) => ({
              ...p,
              numero: proximoNumeroTerritorio(),
              ...(souAdmin ? {} : { congregacao: usuario?.congregacao ?? '' }),
            }))
          }
          setCriando(!criando)
        }} style={{
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

      <input
        type="search"
        placeholder="Buscar por nome, número ou bairro…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        style={{
          width: '100%', padding: '12px 14px', fontSize: 15,
          border: '1px solid #DDDDDD', borderRadius: 10, background: '#FAFAFA',
          color: '#1A1A1A', marginBottom: 20, boxSizing: 'border-box', outline: 'none',
        }}
      />

      {termo && territoriosFiltrados.length === 0 && (
        <p style={{ textAlign: 'center', color: '#888', padding: 24 }}>Nenhum território encontrado para &ldquo;{busca}&rdquo;.</p>
      )}

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
            <CamposExtras valores={form} alterar={(campo, valor) => setForm((p) => ({ ...p, [campo]: valor }))} souAdmin={souAdmin} />
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

      {/* Quadras catalogadas sem território (geradas desenhando o perímetro da cidade) */}
      {quadrasSemTerritorio.length > 0 && (
        <div style={{ background: '#FFFFFF', border: '1.5px solid #F0C060', borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A' }}>🏙️ Quadras sem território</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                  Catalogadas pelo perímetro da cidade — atribua cada uma a um território.
                </div>
              </div>
            </div>
            <button onClick={() => setExpandido(semTerritorioAberto ? null : SEM_TERRITORIO)} style={{
              width: '100%', padding: '8px', fontSize: 13, fontWeight: 500,
              background: semTerritorioAberto ? '#F0F0F0' : '#F7F7F7', color: '#1A1A1A',
              border: '0.5px solid #DDD', borderRadius: 8, cursor: 'pointer',
            }}>
              {semTerritorioAberto ? '▲ Fechar quadras' : `▼ Ver quadras (${quadrasSemTerritorio.length})`}
            </button>
          </div>

          {semTerritorioAberto && (
            <div style={{ borderTop: '0.5px solid #EEEEEE', background: '#FAFAFA' }}>
              {quadrasSemTerritorio.map((q) => {
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
                      padding: '5px 10px', fontSize: 12, fontWeight: 600,
                      background: '#E8F4FB', color: '#042C53',
                      border: '0.5px solid #70B8E0', borderRadius: 6, cursor: 'pointer',
                    }}>Atribuir a um território</button>
                    <button onClick={() => void excluirQuadra(q)} style={{
                      padding: '5px 10px', fontSize: 12, fontWeight: 500,
                      background: '#FFF0F0', color: '#E05050',
                      border: '1px solid #FFCCCC', borderRadius: 6, cursor: 'pointer',
                    }}>🗑️</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Lista territórios, agrupados por congregação */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {gruposPorCongregacao.map((grupo) => (
      <div key={grupo.nome}>
        <h2 style={{
          fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase',
          letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          🏛️ {grupo.nome}
          <span style={{ fontWeight: 500, textTransform: 'none', color: '#AAAAAA' }}>
            {grupo.territorios.length} território{grupo.territorios.length !== 1 ? 's' : ''}
          </span>
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {grupo.territorios.map((t) => {
          const pct = calcPct(t.id)
          const qs = quadras.filter((q) => q.territorio_id === t.id)
          const corPct = pct >= 100 ? '#3BAD68' : pct > 50 ? '#F0A030' : '#888'
          const aberto = expandido === t.id
          const designacao = designacoesSG.find((d) => d.territorio_id === t.id)
          const prazo = designacao ? calcularPrazoTerritorio(designacao.data_inicio, prazoDe(t.congregacao)) : null
          const rota = linkComoChegar(t)
          const idiomaTerr = idiomaPorTerritorio(t.id)

          return (
            <div key={t.id} style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, overflow: 'hidden' }}>
              {/* Header do card */}
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {t.cor && <span title="Cor personalizada" style={{ width: 10, height: 10, borderRadius: '50%', background: t.cor, flexShrink: 0 }} />}
                      #{t.numero} — {t.nome}
                    </div>
                    <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{t.bairro}</div>
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
                  <Link href={`/app/territorios/${t.id}/cartao`} title="Cartão do território pra imprimir" style={{
                    padding: '8px 14px', fontSize: 13, fontWeight: 600,
                    background: '#F0EAFF', color: '#6B3FD4', textDecoration: 'none',
                    border: '0.5px solid #D9C6FF', borderRadius: 8,
                  }}>🖨️ Cartão</Link>
                  <button onClick={() => {
                    setEditandoTerr(t)
                    const formulario = formularioDoTerritorio(t)
                    setFormEdit(souAdmin ? formulario : { ...formulario, congregacao: usuario?.congregacao ?? formulario.congregacao })
                  }} style={{
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
        </div>
      </div>
      ))}
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
              <CamposExtras valores={formEdit} alterar={(campo, valor) => setFormEdit((p) => ({ ...p, [campo]: valor }))} souAdmin={souAdmin} />

              <div>
                <button type="button" onClick={() => irDesenharContorno(editandoTerr.id)} style={{
                  width: '100%', padding: '11px', fontSize: 14, fontWeight: 600,
                  background: '#F0EEFF', color: '#6B3FD4', border: '1px solid #D9C6FF', borderRadius: 8, cursor: 'pointer',
                }}>
                  🖊️ {editandoTerr.geojson ? 'Redesenhar contorno no mapa' : 'Desenhar contorno no mapa'}
                </button>
                {editandoTerr.geojson && souAdmin && (
                  <button type="button" onClick={() => irEditarContorno(editandoTerr.id)} style={{
                    width: '100%', padding: '11px', fontSize: 14, fontWeight: 600, marginTop: 8,
                    background: '#FFF6EA', color: '#B5590A', border: '1px solid #FFD9A8', borderRadius: 8, cursor: 'pointer',
                  }}>
                    ↔️ Mover / ajustar contorno no mapa
                  </button>
                )}
                <p style={{ fontSize: 12, color: '#999', margin: '6px 0 0' }}>
                  {editandoTerr.geojson
                    ? 'Esse território já tem contorno próprio. "Mover" mantém o formato e só ajusta a posição/pontos; "Redesenhar" descarta e começa do zero.'
                    : 'Sem contorno próprio ainda — o mapa mostra uma área estimada com base nas quadras.'}
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Foto do marco</label>
                {editandoTerr.foto_marco && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editandoTerr.foto_marco} alt="Marco do território" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, marginBottom: 8, display: 'block' }} />
                )}
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 13, fontWeight: 600,
                  background: '#F7F7F7', color: '#1A1A1A', border: '0.5px solid #DDD', borderRadius: 8, cursor: enviandoFoto ? 'not-allowed' : 'pointer',
                }}>
                  {enviandoFoto ? 'Enviando…' : editandoTerr.foto_marco ? '📷 Trocar foto' : '📷 Enviar foto'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={enviandoFoto} onChange={(e) => void enviarFotoMarco(e)} />
                </label>
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

// Link do QR code (legenda do mapa geral e cartão S-12-T) e congregação
function CamposExtras({ valores, alterar, souAdmin }: {
  valores: FormTerritorio
  alterar: (campo: CampoExtra, valor: string) => void
  souAdmin: boolean
}) {
  const estiloRotulo = { display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }
  const estiloCampo = {
    width: '100%', padding: '11px 14px', fontSize: 15, border: '1px solid #DDD',
    borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' as const,
  }
  return (
    <>
      <div>
        <label style={estiloRotulo}>Link do Google Maps (QR code do cartão)</label>
        <input type="url" value={valores.link_maps} placeholder="https://goo.gl/maps/…"
          onChange={(e) => alterar('link_maps', e.target.value)} style={estiloCampo} />
      </div>
      <div>
        <label style={estiloRotulo}>Cor no mapa</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="color" value={valores.cor || '#9E9E9E'}
            onChange={(e) => alterar('cor', e.target.value)}
            style={{ width: 44, height: 40, padding: 2, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', cursor: 'pointer' }} />
          {valores.cor ? (
            <button type="button" onClick={() => alterar('cor', '')} style={{ fontSize: 13, color: '#378ADD', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              🔄 Usar cor automática (por progresso)
            </button>
          ) : (
            <span style={{ fontSize: 12, color: '#999' }}>Sem cor escolhida — mostra o progresso (cinza/azul/verde).</span>
          )}
        </div>
      </div>
      <div>
        <label style={estiloRotulo}>Congregação</label>
        {souAdmin ? (
          <>
            <SeletorCongregacao valor={valores.congregacao} onChange={(v) => alterar('congregacao', v)} style={estiloCampo} />
            <p style={{ fontSize: 12, color: '#999', margin: '6px 0 0' }}>
              Só quem é dessa congregação (e o admin) enxerga este território.
            </p>
          </>
        ) : (
          <>
            <div style={{ ...estiloCampo, color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
              🏛️ {valores.congregacao || '— sua congregação não está definida —'}
            </div>
            <p style={{ fontSize: 12, color: '#999', margin: '6px 0 0' }}>
              Herdada da sua congregação — só o admin pode mudar isso.
            </p>
          </>
        )}
      </div>
    </>
  )
}
