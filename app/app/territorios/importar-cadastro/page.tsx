'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

// Importa as quadras extraídas do cadastro em PDF da prefeitura (ver
// public/cadastro-2015 e o script que gerou os dados). O desenho não tem
// coordenada real embutida, então o primeiro passo é calibrar: marcar pares
// de pontos iguais entre o recorte do PDF e o mapa de verdade, pra achar a
// transformação. Depois é só revisar no mapa e gravar como quadras sem
// território — elas entram na seção "Quadras sem território" da tela de
// Territórios, de onde dá pra agrupar em território.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'
import { nomeDaQuadra, proximaSequencia } from '@/lib/quadras'
import {
  ajustarTransformacao, deslocarTransformacao, erroMedioMetros, girarTransformacao, transformarAnel,
  type PontoControle, type Transformacao,
} from '@/lib/calibracaoPdf'
import { areaEmMetros, centroDoContorno } from '@/lib/territorio'

interface QuadraExtraida {
  anelPdf: [number, number][]
  areaM2: number
  numeros: string[]
}

interface DadosCadastro {
  origem: string
  metrosPorPonto: number
  quadras: QuadraExtraida[]
  bairros: { nome: string; centroPdf: [number, number] }[]
}

interface ImagemInfo {
  clip: [number, number, number, number]
  escala: number
  larguraPx: number
  alturaPx: number
}

type Etapa = 'carregando' | 'calibrando' | 'revisao' | 'gravando' | 'resumo' | 'erro'

interface TerritorioDb {
  id: string
  nome: string
  bairro: string | null
  geojson: unknown
}

interface QuadraDb {
  territorio_id: string | null
  geojson: unknown
}

// Centroide de um anel 2D genérico (mesmo cálculo de centroDoContorno, mas
// direto em cima de pontos crus — serve tanto pra coordenada real quanto
// pro espaço em pixels/pontos do PDF).
function centroideAnel2D(anel: [number, number][]): [number, number] {
  let area = 0
  for (let i = 0; i < anel.length - 1; i++) {
    area += anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1]
  }
  area /= 2
  if (Math.abs(area) < 1e-9) {
    const mx = anel.reduce((s, p) => s + p[0], 0) / anel.length
    const my = anel.reduce((s, p) => s + p[1], 0) / anel.length
    return [mx, my]
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < anel.length - 1; i++) {
    const f = anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1]
    cx += (anel[i][0] + anel[i + 1][0]) * f
    cy += (anel[i][1] + anel[i + 1][1]) * f
  }
  return [cx / (6 * area), cy / (6 * area)]
}

// Compara "Alto Bonito", "ALTO BONITO", "Alto  Bonito" etc. como iguais.
// O OCR do PDF costuma confundir o numeral romano "I" final com "l"
// minúsculo (ex: "Nova Esperança l" em vez de "Nova Esperança I") —
// corrige isso trocando um "l" sozinho no fim do nome por "i".
function normalizarNome(s: string): string {
  const base = s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return base.replace(/(^| )l+( |$)/g, (m, ini, fim) => `${ini}${'i'.repeat(m.trim().length)}${fim}`)
}

const VERDE = '#3BAD68'
const CINZA = '#9E9E9E'
const PREFIXO_NOME = 'PDF'

const estiloBotaoSeta: React.CSSProperties = {
  width: 26, height: 26, fontSize: 14, fontWeight: 700, lineHeight: '26px', padding: 0,
  background: '#fff', color: '#444', border: '1px solid #DDD', borderRadius: 6, cursor: 'pointer',
}

function estiloDaPrevia(selecionada: boolean) {
  return {
    color: selecionada ? VERDE : CINZA,
    weight: selecionada ? 2 : 1,
    dashArray: selecionada ? undefined : '4 4',
    fillColor: selecionada ? '#B8EAC8' : '#EEEEEE',
    fillOpacity: selecionada ? 0.4 : 0.12,
  }
}

export default function ImportarCadastroPage() {
  const router = useRouter()
  const { carregando: verificandoAcesso, autorizado } = usePaginaRestrita(['superintendente_territorio', 'admin'])

  const mapInstanceRef = useRef<any>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const marcadoresCalibracaoRef = useRef<any[]>([])
  const previewRef = useRef<any[]>([])

  const [etapa, setEtapa] = useState<Etapa>('carregando')
  const [verExtracao, setVerExtracao] = useState(false)
  const [zoomPdf, setZoomPdf] = useState(1)
  const [erroMsg, setErroMsg] = useState('')
  const [dados, setDados] = useState<DadosCadastro | null>(null)
  const [imagemInfo, setImagemInfo] = useState<ImagemInfo | null>(null)
  const [territoriosDb, setTerritoriosDb] = useState<TerritorioDb[]>([])
  const [quadrasDb, setQuadrasDb] = useState<QuadraDb[]>([])

  const [pontos, setPontos] = useState<PontoControle[]>([])
  const [pendentePdf, setPendentePdf] = useState<[number, number] | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const [transformacao, setTransformacao] = useState<Transformacao | null>(null)
  const transformacaoBaseRef = useRef<Transformacao | null>(null)
  const [passoAjusteM, setPassoAjusteM] = useState(5)
  const bordasAjustadasRef = useRef(false)
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set())
  const [gravando, setGravando] = useState<{ atual: number; total: number } | null>(null)
  const [totalGravado, setTotalGravado] = useState(0)

  // ── Carrega os dados extraídos (Fase 1) ─────────────────────────────────────
  useEffect(() => {
    void Promise.all([
      fetch('/cadastro-2015/dados.json').then((r) => r.json()),
      fetch('/cadastro-2015/imagem-info.json').then((r) => r.json()),
    ]).then(([d, i]) => {
      setDados(d)
      setImagemInfo(i)
      setEtapa('calibrando')
    }).catch(() => {
      setErroMsg('Não achei os arquivos do cadastro (public/cadastro-2015). Gere-os antes de usar esta tela.')
      setEtapa('erro')
    })

    // Territórios/quadras já cadastrados, pra sugerir calibração automática
    // casando o nome do bairro do PDF com um território/bairro já existente.
    void Promise.all([
      supabase.from('territorios').select('id, nome, bairro, geojson'),
      supabase.from('quadras').select('territorio_id, geojson'),
    ]).then(([t, q]) => {
      setTerritoriosDb((t.data as TerritorioDb[]) ?? [])
      setQuadrasDb((q.data as QuadraDb[]) ?? [])
    })
  }, [])

  // Centro real (lat/lng) de cada território: usa o contorno dele mesmo
  // se já tiver sido desenhado, senão a média do centro das quadras já
  // desenhadas nele (a maioria dos territórios ainda só tem isso).
  const centroPorTerritorio = useMemo(() => {
    const mapa = new Map<string, [number, number]>()
    for (const t of territoriosDb) {
      const centroProprio = centroDoContorno(t.geojson)
      if (centroProprio) { mapa.set(t.id, centroProprio); continue }
      const centrosQuadras = quadrasDb
        .filter((q) => q.territorio_id === t.id)
        .map((q) => centroDoContorno(q.geojson))
        .filter((c): c is [number, number] => !!c)
      if (centrosQuadras.length === 0) continue
      const lat = centrosQuadras.reduce((s, c) => s + c[0], 0) / centrosQuadras.length
      const lng = centrosQuadras.reduce((s, c) => s + c[1], 0) / centrosQuadras.length
      mapa.set(t.id, [lat, lng])
    }
    return mapa
  }, [territoriosDb, quadrasDb])

  const territorioPorNomeNormalizado = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const t of territoriosDb) {
      for (const candidato of [t.nome, t.bairro]) {
        if (!candidato) continue
        const chave = normalizarNome(candidato)
        if (chave && !mapa.has(chave)) mapa.set(chave, t.id)
      }
    }
    return mapa
  }, [territoriosDb])

  // Quadras reais (com centro + área em m²) agrupadas por território — usadas
  // pra casar quadra a quadra, não só o centro do bairro inteiro.
  const quadrasReaisPorTerritorio = useMemo(() => {
    const mapa = new Map<string, { centro: [number, number]; area: number }[]>()
    for (const q of quadrasDb) {
      if (!q.territorio_id) continue
      const centro = centroDoContorno(q.geojson)
      const area = areaEmMetros(q.geojson)
      if (!centro || !area) continue
      const lista = mapa.get(q.territorio_id) ?? []
      lista.push({ centro, area })
      mapa.set(q.territorio_id, lista)
    }
    return mapa
  }, [quadrasDb])

  // Cada quadra extraída do PDF, com o centro dela já calculado no espaço do PDF.
  const quadrasPdfComCentro = useMemo(() => {
    return (dados?.quadras ?? []).map((q) => ({ ...q, centro: centroideAnel2D(q.anelPdf) }))
  }, [dados])

  // Pontos de controle sugeridos: um pelo centro do bairro (casando pelo
  // nome) e, quando o território já tem quadras desenhadas, mais um por
  // quadra — casando pela área (em m², já convertida pelo script de
  // extração) entre as quadras reais e as quadras do PDF perto do bairro.
  const pontosAutomaticos = useMemo<PontoControle[]>(() => {
    if (!dados) return []
    const resultado: PontoControle[] = []
    const raioPdf = 400 / (dados.metrosPorPonto || 1) // ~400m ao redor do bairro, em unidades do PDF
    const MAX_QUADRAS_POR_BAIRRO = 8

    for (const b of dados.bairros) {
      const terrId = territorioPorNomeNormalizado.get(normalizarNome(b.nome))
      if (!terrId) continue

      const centroTerritorio = centroPorTerritorio.get(terrId)
      if (centroTerritorio) resultado.push({ pdf: b.centroPdf, real: centroTerritorio })

      const reais = quadrasReaisPorTerritorio.get(terrId)
      if (!reais || reais.length === 0) continue

      const candidatas = quadrasPdfComCentro
        .filter((q) => Math.hypot(q.centro[0] - b.centroPdf[0], q.centro[1] - b.centroPdf[1]) <= raioPdf)
      const usadas = new Set<number>()

      let adicionadas = 0
      for (const real of [...reais].sort((a, c) => c.area - a.area)) {
        if (adicionadas >= MAX_QUADRAS_POR_BAIRRO) break
        let melhorIdx = -1
        let melhorDiff = Infinity
        candidatas.forEach((c, idx) => {
          if (usadas.has(idx)) return
          const diff = Math.abs(c.areaM2 - real.area)
          if (diff < melhorDiff) { melhorDiff = diff; melhorIdx = idx }
        })
        if (melhorIdx === -1) break
        const razao = candidatas[melhorIdx].areaM2 / real.area
        if (razao < 0.4 || razao > 2.5) continue // área bateu longe demais — não é a mesma quadra
        usadas.add(melhorIdx)
        resultado.push({ pdf: candidatas[melhorIdx].centro, real: real.centro })
        adicionadas++
      }
    }
    return resultado
  }, [dados, territorioPorNomeNormalizado, centroPorTerritorio, quadrasReaisPorTerritorio, quadrasPdfComCentro])

  // ── Mapa Leaflet, um mapa simples só pra esta tela ──────────────────────────
  // A div do mapa só entra no DOM depois que `dados`/`imagemInfo` carregam (é
  // condicional), diferente do mapa de components/Mapa.tsx (sempre montado).
  // Um useEffect(..., []) rodaria só no mount, antes da div existir — usa ref
  // de callback em vez disso, que dispara exatamente quando o nó monta.
  const inicializarMapa = useCallback((el: HTMLDivElement | null) => {
    if (!el) {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      return
    }
    if (mapInstanceRef.current) return
    const L = (window as any).L
    if (!L) return

    const map = L.map(el, { center: [-6.52, -49.85], zoom: 14 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 20,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapInstanceRef.current = map

    supabase.from('configuracoes').select('lat, lng').eq('id', 1).single().then(({ data }) => {
      if (data?.lat && data?.lng) map.setView([data.lat, data.lng], 14)
    })
    setTimeout(() => map.invalidateSize(), 200)

    // A tela troca de layout (calibrando = 2 colunas, revisão = 1 coluna) —
    // sem isso o Leaflet fica com o tamanho de quando o mapa nasceu e sobra
    // área cinza sem desenhar quando a caixa cresce.
    const observador = new ResizeObserver(() => map.invalidateSize())
    observador.observe(el)
    resizeObserverRef.current = observador
  }, [])

  // ── Passo 1: calibração ──────────────────────────────────────────────────────
  const fracaoNaImagem = useCallback((pdf: [number, number]): [number, number] => {
    if (!imagemInfo) return [0, 0]
    const [x0, y0] = imagemInfo.clip
    const px = (pdf[0] - x0) * imagemInfo.escala
    const py = (pdf[1] - y0) * imagemInfo.escala
    return [px / imagemInfo.larguraPx, py / imagemInfo.alturaPx]
  }, [imagemInfo])

  function cliqueNaImagem(e: React.MouseEvent<HTMLImageElement>) {
    if (etapa !== 'calibrando' || !imagemInfo) return
    const img = e.currentTarget
    const rect = img.getBoundingClientRect()
    const fatorX = img.naturalWidth / rect.width
    const fatorY = img.naturalHeight / rect.height
    const xPx = (e.clientX - rect.left) * fatorX
    const yPx = (e.clientY - rect.top) * fatorY
    const xPdf = imagemInfo.clip[0] + xPx / imagemInfo.escala
    const yPdf = imagemInfo.clip[1] + yPx / imagemInfo.escala
    setPendentePdf([xPdf, yPdf])
  }

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    function aoClicar(e: any) {
      if (etapa !== 'calibrando' || !pendentePdf) return
      setPontos((prev) => [...prev, { pdf: pendentePdf, real: [e.latlng.lat, e.latlng.lng] }])
      setPendentePdf(null)
    }
    map.on('click', aoClicar)
    return () => map.off('click', aoClicar)
  }, [etapa, pendentePdf])

  // Marcadores dos pontos já calibrados, no mapa
  useEffect(() => {
    const map = mapInstanceRef.current
    const L = (window as any).L
    if (!map || !L || etapa !== 'calibrando') return
    marcadoresCalibracaoRef.current.forEach((m) => map.removeLayer(m))
    marcadoresCalibracaoRef.current = pontos.map((p, i) => {
      const marker = L.circleMarker(p.real, { radius: 7, color: '#378ADD', fillColor: '#378ADD', fillOpacity: 0.8, weight: 2 }).addTo(map)
      marker.bindTooltip(String(i + 1), { permanent: true, direction: 'top', className: 'rotulo-quadra' })
      return marker
    })
  }, [pontos, etapa])

  function removerPonto(i: number) {
    setPontos((prev) => prev.filter((_, k) => k !== i))
  }

  const erroMedio = useMemo(() => {
    if (pontos.length < 3) return null
    try {
      return erroMedioMetros(ajustarTransformacao(pontos), pontos)
    } catch {
      return null
    }
  }, [pontos])

  function confirmarCalibracao() {
    try {
      const t = ajustarTransformacao(pontos)
      transformacaoBaseRef.current = t
      bordasAjustadasRef.current = false
      setTransformacao(t)
      setSelecionadas(new Set(dados?.quadras.map((_, i) => i) ?? []))
      setEtapa('revisao')
    } catch (erro) {
      setErroMsg(erro instanceof Error ? erro.message : 'Não deu pra calibrar com esses pontos.')
      setEtapa('erro')
    }
  }

  // ── Ajuste fino manual: nudge (metros) e rotação, em cima do que a
  // calibração automática já achou — pra afinar quando fica quase certo.
  function ajustarPosicao(dLatM: number, dLngM: number) {
    setTransformacao((t) => {
      if (!t) return t
      const latRef = mapInstanceRef.current?.getCenter()?.lat ?? t.c
      return deslocarTransformacao(t, dLatM, dLngM, latRef)
    })
  }

  function ajustarRotacao(anguloGraus: number) {
    setTransformacao((t) => {
      if (!t) return t
      const centro = mapInstanceRef.current?.getCenter()
      const pivot: [number, number] = centro ? [centro.lat, centro.lng] : [t.c, t.f]
      return girarTransformacao(t, anguloGraus, pivot)
    })
  }

  function resetarAjusteFino() {
    if (transformacaoBaseRef.current) setTransformacao({ ...transformacaoBaseRef.current })
  }

  // ── Passo 2: revisão no mapa ─────────────────────────────────────────────────
  const limparPreview = useCallback(() => {
    const map = mapInstanceRef.current
    previewRef.current.forEach((l) => { try { map?.removeLayer(l) } catch {} })
    previewRef.current = []
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    const L = (window as any).L
    if (!map || !L || etapa !== 'revisao' || !dados || !transformacao) return

    marcadoresCalibracaoRef.current.forEach((m) => { try { map.removeLayer(m) } catch {} })
    marcadoresCalibracaoRef.current = []
    limparPreview()

    const camadas = dados.quadras.map((q, i) => {
      const anel = transformarAnel(transformacao, q.anelPdf)
      const pontosLatLng = anel.map(([lng, lat]) => [lat, lng] as [number, number])
      const camada = L.polygon(pontosLatLng, estiloDaPrevia(true)).addTo(map)
      camada.on('click', (e: any) => {
        L.DomEvent.stopPropagation(e)
        setSelecionadas((prev) => {
          const proxima = new Set(prev)
          if (proxima.has(i)) proxima.delete(i); else proxima.add(i)
          camada.setStyle(estiloDaPrevia(proxima.has(i)))
          return proxima
        })
      })
      return camada
    })
    previewRef.current = camadas
    // Só enquadra automaticamente da primeira vez — depois disso o usuário
    // pode ter dado zoom/pan pra conferir um ponto específico, e cada nudge
    // do ajuste fino não pode ficar chutando a view de volta.
    if (camadas.length > 0 && !bordasAjustadasRef.current) {
      const grupo = L.featureGroup(camadas)
      map.fitBounds(grupo.getBounds(), { padding: [24, 24] })
      bordasAjustadasRef.current = true
    }

    return () => limparPreview()
  }, [etapa, dados, transformacao, limparPreview])

  // ── Passo 3: gravar ──────────────────────────────────────────────────────────
  async function gravar() {
    if (!dados || !transformacao || selecionadas.size === 0) return
    setEtapa('gravando')

    const { data: existentes } = await supabase.from('quadras').select('nome').is('territorio_id', null)
    let sequencia = proximaSequencia((existentes ?? []).map((q: { nome: string }) => q.nome), PREFIXO_NOME)

    const linhas = [...selecionadas].sort((a, b) => a - b).map((i) => {
      const q = dados.quadras[i]
      const anel = transformarAnel(transformacao, q.anelPdf)
      const nome = nomeDaQuadra(PREFIXO_NOME, sequencia)
      sequencia++
      return {
        territorio_id: null,
        nome,
        status: 'nao_iniciado',
        geojson: {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [anel] },
          properties: { origem: 'cadastro-pdf-2015', area_m2: q.areaM2, ...(q.numeros.length > 0 ? { numeros_no_pdf: q.numeros } : {}) },
        },
      }
    })

    const TAMANHO_LOTE = 150
    let gravadas = 0
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
      const lote = linhas.slice(i, i + TAMANHO_LOTE)
      setGravando({ atual: i, total: linhas.length })
      const { error } = await supabase.from('quadras').insert(lote)
      if (error) {
        setErroMsg(`Gravei ${gravadas} de ${linhas.length} quadras e travou: ${error.message}`)
        setEtapa('erro')
        return
      }
      gravadas += lote.length
    }

    setGravando(null)
    setTotalGravado(gravadas)
    setEtapa('resumo')
  }

  if (verificandoAcesso) return <Carregando />
  if (!autorizado) return <SemPermissao />

  return (
    <div style={{ padding: '1.5rem 1rem 4rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Importar cadastro do PDF</h1>
          <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
            Mapa oficial da prefeitura (2015, provisório) — {dados ? `${dados.quadras.length} quadras extraídas` : 'carregando…'}
          </p>
        </div>
        <button onClick={() => router.push('/app/territorios')} style={{
          padding: '10px 16px', fontSize: 14, fontWeight: 500, background: '#F7F7F7', color: '#555',
          border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer',
        }}>
          ← Territórios
        </button>
      </div>

      {etapa === 'carregando' && <Carregando />}

      {etapa === 'erro' && (
        <div style={{ background: '#FFF0F0', border: '1px solid #E05050', borderRadius: 10, padding: '14px 16px', color: '#501313', fontSize: 14, lineHeight: 1.5 }}>
          ⚠️ {erroMsg}
        </div>
      )}

      {(etapa === 'calibrando' || etapa === 'revisao' || etapa === 'gravando' || etapa === 'resumo') && dados && imagemInfo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {etapa === 'calibrando' && (
            <div style={{ background: '#F0F9FF', border: '1px solid #B3D9FF', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#042C53', lineHeight: 1.6 }}>
              <strong>Passo 1 — Calibrar:</strong> clique um ponto reconhecível na imagem do PDF (ex: um cruzamento de ruas) e depois o mesmo ponto no mapa ao lado. Repita pelo menos 3 vezes, espalhando os pontos pela cidade — quanto mais espalhado, melhor o encaixe.
              {pendentePdf && <><br /><strong>Agora clique no mapa</strong> o ponto correspondente.</>}
              {pontosAutomaticos.length >= 3 && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setPontos(pontosAutomaticos)}
                    style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, background: '#378ADD', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  >
                    🪄 Calibrar automaticamente ({pontosAutomaticos.length} ponto{pontosAutomaticos.length !== 1 ? 's' : ''} encontrado{pontosAutomaticos.length !== 1 ? 's' : ''})
                  </button>
                  <span style={{ fontSize: 12, color: '#042C53' }}>
                    Casa pelo nome do bairro e, quando já tem quadra desenhada, refina ponto a ponto pela área de cada quadra. Revise antes de continuar.
                  </span>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#042C53', cursor: 'pointer' }}>
                  <input type="checkbox" checked={verExtracao} onChange={(e) => setVerExtracao(e.target.checked)} />
                  👁️ Ver o que foi extraído do PDF ({dados.quadras.length} quadra{dados.quadras.length !== 1 ? 's' : ''}, {dados.bairros.length} bairro{dados.bairros.length !== 1 ? 's' : ''}) — sem depender da calibração
                </label>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: etapa === 'calibrando' ? '1fr 1fr' : '1fr', gap: 12 }}>
            {etapa === 'calibrando' && (
              <div style={{ position: 'relative', border: '1px solid #DDD', borderRadius: 10, overflow: 'hidden', height: 480 }}>
                <div style={{
                  position: 'absolute', top: 8, right: 8, zIndex: 10,
                  display: 'flex', gap: 4, background: '#fff', border: '1px solid #DDD', borderRadius: 8,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)', padding: 4,
                }}>
                  <button onClick={() => setZoomPdf((z) => Math.max(1, +(z - 0.5).toFixed(1)))} disabled={zoomPdf <= 1}
                    style={{ width: 28, height: 28, fontSize: 16, fontWeight: 700, background: 'none', border: 'none', cursor: zoomPdf <= 1 ? 'not-allowed' : 'pointer', color: zoomPdf <= 1 ? '#CCC' : '#444' }}>
                    −
                  </button>
                  <span style={{ fontSize: 12, color: '#666', alignSelf: 'center', minWidth: 34, textAlign: 'center' }}>{Math.round(zoomPdf * 100)}%</span>
                  <button onClick={() => setZoomPdf((z) => Math.min(5, +(z + 0.5).toFixed(1)))} disabled={zoomPdf >= 5}
                    style={{ width: 28, height: 28, fontSize: 16, fontWeight: 700, background: 'none', border: 'none', cursor: zoomPdf >= 5 ? 'not-allowed' : 'pointer', color: zoomPdf >= 5 ? '#CCC' : '#444' }}>
                    +
                  </button>
                </div>
                <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
                <div style={{ position: 'relative', width: `${zoomPdf * 100}%` }}>
                  <img ref={imgRef} src="/cadastro-2015/mapa.png" alt="Recorte do PDF da prefeitura" onClick={cliqueNaImagem}
                    style={{ display: 'block', width: '100%', cursor: 'crosshair' }} />
                  {verExtracao && (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                      {dados.quadras.map((q, i) => (
                        <polygon
                          key={i}
                          points={q.anelPdf.map((p) => {
                            const [fx, fy] = fracaoNaImagem(p)
                            return `${(fx * 100).toFixed(3)},${(fy * 100).toFixed(3)}`
                          }).join(' ')}
                          fill="rgba(59,173,104,0.15)"
                          stroke="#3BAD68"
                          strokeWidth={1}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </svg>
                  )}
                  {pontos.map((p, i) => {
                    const [fx, fy] = fracaoNaImagem(p.pdf)
                    return (
                      <div key={i} style={{
                        position: 'absolute', left: `${fx * 100}%`, top: `${fy * 100}%`,
                        transform: 'translate(-50%,-50%)', width: 22, height: 22, borderRadius: '50%',
                        background: '#378ADD', color: '#fff', fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', pointerEvents: 'none',
                      }}>{i + 1}</div>
                    )
                  })}
                  {pendentePdf && (
                    <div style={{
                      position: 'absolute',
                      left: `${fracaoNaImagem(pendentePdf)[0] * 100}%`, top: `${fracaoNaImagem(pendentePdf)[1] * 100}%`,
                      transform: 'translate(-50%,-50%)', width: 22, height: 22, borderRadius: '50%',
                      background: '#F0A030', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', pointerEvents: 'none',
                    }} />
                  )}
                </div>
                </div>
              </div>
            )}
            <div ref={inicializarMapa} style={{ height: 480, borderRadius: 10, overflow: 'hidden', border: '1px solid #DDD' }} />
          </div>

          {etapa === 'calibrando' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pontos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {pontos.map((_, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13,
                      background: '#F7F7F7', border: '0.5px solid #DDD', borderRadius: 20, padding: '4px 10px',
                    }}>
                      Ponto {i + 1}
                      <button onClick={() => removerPonto(i)} style={{ background: 'none', border: 'none', color: '#E05050', cursor: 'pointer', fontWeight: 700 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#666' }}>
                  {pontos.length} ponto(s) marcado(s)
                  {erroMedio !== null && ` · erro médio: ${erroMedio < 1 ? erroMedio.toFixed(2) : Math.round(erroMedio)} m`}
                </span>
                <button onClick={confirmarCalibracao} disabled={pontos.length < 3} style={{
                  padding: '13px 20px', fontSize: 14, fontWeight: 600,
                  background: pontos.length < 3 ? '#CCCCCC' : VERDE, color: '#fff',
                  border: 'none', borderRadius: 10, cursor: pontos.length < 3 ? 'not-allowed' : 'pointer',
                }}>
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {etapa === 'revisao' && (
            <>
              <div style={{ background: '#FAFAFA', border: '1px solid #EEE', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13, color: '#444' }}>🎯 Ajuste fino</strong>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 26px)', gridTemplateRows: 'repeat(3, 26px)', gap: 2 }}>
                    <span />
                    <button onClick={() => ajustarPosicao(passoAjusteM, 0)} title="Mover pra cima" style={estiloBotaoSeta}>↑</button>
                    <span />
                    <button onClick={() => ajustarPosicao(0, -passoAjusteM)} title="Mover pra esquerda" style={estiloBotaoSeta}>←</button>
                    <span />
                    <button onClick={() => ajustarPosicao(0, passoAjusteM)} title="Mover pra direita" style={estiloBotaoSeta}>→</button>
                    <span />
                    <button onClick={() => ajustarPosicao(-passoAjusteM, 0)} title="Mover pra baixo" style={estiloBotaoSeta}>↓</button>
                    <span />
                  </div>
                  <select value={passoAjusteM} onChange={(e) => setPassoAjusteM(Number(e.target.value))}
                    style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #DDD', background: '#fff' }}>
                    <option value={1}>1 m</option>
                    <option value={5}>5 m</option>
                    <option value={20}>20 m</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => ajustarRotacao(-1)} title="Girar anti-horário" style={estiloBotaoSeta}>⟲</button>
                  <button onClick={() => ajustarRotacao(1)} title="Girar horário" style={estiloBotaoSeta}>⟳</button>
                </div>

                <button onClick={resetarAjusteFino} style={{ fontSize: 12, color: '#E05050', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  ↺ Desfazer ajuste fino
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 14, color: '#444' }}>
                  {selecionadas.size} de {dados.quadras.length} marcadas para gravar (sem território — clique numa quadra no mapa pra desmarcar as que saíram tortas)
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEtapa('calibrando')} style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, background: '#F7F7F7', color: '#555', border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer' }}>← Recalibrar</button>
                  <button onClick={() => void gravar()} disabled={selecionadas.size === 0} style={{
                    padding: '12px 20px', fontSize: 14, fontWeight: 600,
                    background: selecionadas.size === 0 ? '#CCCCCC' : VERDE, color: '#fff',
                    border: 'none', borderRadius: 10, cursor: selecionadas.size === 0 ? 'not-allowed' : 'pointer',
                  }}>
                    ✅ Gravar {selecionadas.size} quadra{selecionadas.size !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            </>
          )}

          {etapa === 'gravando' && (
            <div style={{ textAlign: 'center', padding: '1rem 0', color: '#666' }}>
              <p style={{ fontSize: 15 }}>💾 Gravando… {gravando ? `${gravando.atual} de ${gravando.total}` : ''}</p>
            </div>
          )}

          {etapa === 'resumo' && (
            <div style={{ background: '#EAF7EF', border: '1px solid #3BAD68', borderRadius: 10, padding: '14px 16px', color: '#04342C', fontSize: 14, lineHeight: 1.6 }}>
              <strong>{totalGravado} quadra(s)</strong> gravadas sem território. Vá em Territórios → &ldquo;Quadras sem território&rdquo; pra agrupá-las.
              <div style={{ marginTop: 10 }}>
                <button onClick={() => router.push('/app/territorios')} style={{
                  padding: '12px 20px', fontSize: 14, fontWeight: 600, background: VERDE, color: '#fff',
                  border: 'none', borderRadius: 10, cursor: 'pointer',
                }}>
                  Ir para Territórios
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
