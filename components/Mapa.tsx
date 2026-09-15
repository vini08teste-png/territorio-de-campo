'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase, CORES_STATUS } from '@/lib/supabase'
import ImportarOSM from '@/components/ImportarOSM'
import { escaparHtml, linkComoChegar } from '@/lib/territorio'


type StatusQuadra = 'nao_iniciado' | 'em_andamento' | 'parcial' | 'concluido' | 'pendente'

interface GeoJSONFeature {
  type: string
  geometry: { type: string; coordinates: number[][][] }
  properties?: Record<string, unknown>
}

interface Quadra {
  id: string
  nome: string
  status: StatusQuadra
  geojson: GeoJSONFeature
  territorio_id: string | null
}

interface Territorio {
  id: string
  nome: string
  numero: string
  geojson: GeoJSONFeature | null
  link_maps: string | null
}

interface PontoParada {
  id: string
  quadra_id: string
  lado_id: string | null
  lat: number
  lng: number
  endereco: string
  observacao: string
  idioma?: string | null
  qtd_pessoas?: number | null
  criado_em?: string
  usuario?: { nome: string }
}

interface Usuario {
  id: string
  nome: string
  perfil: string
}


// Mesmos pesos da tela de territórios
const PESO_TERRITORIO: Record<StatusQuadra, number> = {
  concluido: 1, parcial: 0.5, em_andamento: 0.25,
  nao_iniciado: 0, pendente: 0,
}

function progressoDoTerritorio(quadras: Quadra[]): number {
  if (quadras.length === 0) return 0
  const soma = quadras.reduce((acc, q) => acc + (PESO_TERRITORIO[q.status] ?? 0), 0)
  return Math.round((soma / quadras.length) * 100)
}

function corDoProgresso(progresso: number): string {
  if (progresso >= 100) return '#3BAD68'
  if (progresso >= 50) return '#378ADD'
  if (progresso > 0) return '#F0C060'
  return '#9E9E9E'
}

function estiloDaQuadra(status: StatusQuadra) {
  const cores = CORES_STATUS[status] ?? CORES_STATUS['nao_iniciado']
  return { fillColor: cores.fill, fillOpacity: 0.45, color: cores.stroke, weight: 2 }
}

const ESTILO_SELECIONADA = { fillColor: '#D9C6FF', fillOpacity: 0.6, color: '#6B3FD4', weight: 3 }

/** Item do menu de ações flutuante: ícone redondo colorido + rótulo numa pílula branca. */
function BotaoAcaoMapa({ icone, texto, cor, onClick }: { icone: string; texto: string; cor: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, border: 'none', cursor: 'pointer',
      background: 'none', padding: 0,
    }}>
      <span style={{
        fontSize: 13, fontWeight: 600, color: '#1A1A1A', background: '#fff',
        padding: '7px 12px', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        whiteSpace: 'nowrap',
      }}>
        {texto}
      </span>
      <span style={{
        width: 40, height: 40, borderRadius: '50%', background: cor, color: '#fff',
        fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)', flexShrink: 0,
      }}>
        {icone}
      </span>
    </button>
  )
}

function popupDoTerritorio(territorio: Territorio, progresso: number, totalQuadras: number): string {
  const linhas = [
    `<b style="font-size:14px">#${escaparHtml(String(territorio.numero))} — ${escaparHtml(territorio.nome)}</b>`,
    `<span style="color:#555">${totalQuadras} quadra(s) · ${progresso}% trabalhado</span>`,
  ]
  const rota = linkComoChegar(territorio)
  if (rota) {
    linhas.push(`<a href="${escaparHtml(rota)}" target="_blank" rel="noreferrer" style="color:#378ADD;font-weight:600">🧭 Como chegar</a>`)
  }
  return `<div style="font-size:13px;line-height:1.6;min-width:180px">${linhas.join('<br/>')}</div>`
}

export default function Mapa() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const layersRef = useRef<any[]>([])
  const territorioLayersRef = useRef<any[]>([])
  const pontoLayersRef = useRef<any[]>([])
  const pendingGeoJsonRef = useRef<any>(null)
  const apagarPontoRef = useRef<(id: string) => Promise<void>>(async () => {})
  const editarPontoRef = useRef<(p: PontoParada) => void>(() => {})
  const modoSelecaoRef = useRef(false)
  const selecionadasRef = useRef<Set<string>>(new Set())
  const drawSelecaoRef = useRef<any>(null)

  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [territoriosCarregados, setTerritoriosCarregados] = useState(false)
  const [territorioFiltro, setTerritorioFiltro] = useState('')
  const [quadraAtiva, setQuadraAtiva] = useState<Quadra | null>(null)
  const [painelAberto, setPainelAberto] = useState(false)
  const [ultimoTrabalho, setUltimoTrabalho] = useState<{ quadraId: string; quadraNome: string; territorioId: string } | null>(null)
  const [ultimoTrabalhoFechado, setUltimoTrabalhoFechado] = useState(false)
  const [modoDesenho, setModoDesenho] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [painelOSM, setPainelOSM] = useState(false)
  const [mapInstance, setMapInstance] = useState<any>(null)
  // Modal criar quadra
  const [modalCriar, setModalCriar] = useState(false)
  const [novaQuadraNome, setNovaQuadraNome] = useState('')
  const [novaQuadraTerritorioId, setNovaQuadraTerritorioId] = useState('')
  const [salvandoQuadra, setSalvandoQuadra] = useState(false)

  // Modal ponto de parada
  const [todosPontos, setTodosPontos] = useState<PontoParada[]>([])
  const [menuAcoesAberto, setMenuAcoesAberto] = useState(false)

  // Seleção por área: agrupar quadras sem território de uma vez num território
  const [modoSelecao, setModoSelecao] = useState(false)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [territorioParaAtribuir, setTerritorioParaAtribuir] = useState('')
  const [atribuindo, setAtribuindo] = useState(false)

  const [modalPonto, setModalPonto] = useState(false)
  const [pontoCoords, setPontoCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [pontoObs, setPontoObs] = useState('')
  const [pontoIdioma, setPontoIdioma] = useState('')
  const [pontoQtdPessoas, setPontoQtdPessoas] = useState('')
  const [editandoPonto, setEditandoPonto] = useState<PontoParada | null>(null)
  const [salvandoPonto, setSalvandoPonto] = useState(false)

  // ST e admin (que herda tudo que ST faz) podem desenhar/excluir quadras
  const podeGerenciarQuadras = usuario?.perfil === 'superintendente_territorio' || usuario?.perfil === 'admin'
  // Toda a hierarquia herda a capacidade do dirigente de marcar em campo
  const podeMarcar = !!usuario

  function mostrarFeedback(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 2500)
  }

  // ── Renderizar pontos ────────────────────────────────────────────────────────
  const renderizarPontos = useCallback((m: any, pts: PontoParada[]) => {
    const L = (window as any).L
    pontoLayersRef.current.forEach((l) => m.removeLayer(l))
    pontoLayersRef.current = []
    pts.forEach((p) => {
      const temIdioma = !!p.idioma?.trim()
      const corPino = temIdioma ? '#8A5CF6' : '#E05050'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${corPino};border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [28, 28], iconAnchor: [14, 28],
      })
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(m)
      ;(marker as any)._quadraId = p.quadra_id
      const nome = (p.usuario as any)?.nome ?? 'Desconhecido'
      const data = p.criado_em
        ? new Date(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : ''
      const mapsUrl = `https://maps.google.com/?q=${p.lat},${p.lng}`
      marker.bindPopup(`
        <div style="font-size:13px;min-width:200px;line-height:1.6">
          <b style="color:${corPino};font-size:14px">📍 Ponto de parada</b><br/>
          <span style="color:#555">👤 ${escaparHtml(nome)}</span><br/>
          ${data ? `<span style="color:#888">🕐 ${data}</span><br/>` : ''}
          ${temIdioma ? `<span style="display:inline-block;background:#F0EAFF;color:#6B3FD4;font-weight:600;border-radius:6px;padding:2px 8px;margin:2px 0">🌐 ${escaparHtml(p.idioma ?? '')}${p.qtd_pessoas ? ` — ${p.qtd_pessoas} pessoa${p.qtd_pessoas > 1 ? 's' : ''}` : ''}</span><br/>` : ''}
          ${p.observacao ? `<span style="color:#333;font-style:italic">"${escaparHtml(p.observacao)}"</span><br/>` : '<span style="color:#AAAAAA;font-style:italic">Sem observação</span><br/>'}
          <a href="${mapsUrl}" target="_blank" style="color:#378ADD;font-size:12px;font-weight:600">🗺️ Abrir no Google Maps</a>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button data-acao="editar-ponto" style="flex:1;padding:6px 8px;font-size:12px;font-weight:600;background:#F0F0F0;border:0.5px solid #DDD;border-radius:6px;color:#444;cursor:pointer">✏️ Editar</button>
            <button data-acao="apagar-ponto" style="flex:1;padding:6px 8px;font-size:12px;font-weight:600;background:#FFF0F0;border:1px solid #FFCCCC;border-radius:6px;color:#E05050;cursor:pointer">🗑️ Excluir</button>
          </div>
        </div>
      `, { maxWidth: 260 })
      marker.on('popupopen', (e: any) => {
        const el: HTMLElement = e.popup.getElement()
        el.querySelector('[data-acao="apagar-ponto"]')?.addEventListener('click', () => {
          m.closePopup()
          void apagarPontoRef.current(p.id)
        })
        el.querySelector('[data-acao="editar-ponto"]')?.addEventListener('click', () => {
          m.closePopup()
          editarPontoRef.current(p)
        })
      })
      pontoLayersRef.current.push(marker)
    })
  }, [])

  // ── Filtro "ver só um território" ───────────────────────────────────────────
  // Usa ref (não state) pra poder ser chamada no fim de carregarQuadras sem
  // entrar nas dependências do useCallback — senão toda troca de filtro
  // recriaria carregarQuadras e, por tabela, remontaria o mapa inteiro.
  const territorioFiltroRef = useRef('')
  useEffect(() => { territorioFiltroRef.current = territorioFiltro }, [territorioFiltro])

  const aplicarFiltroTerritorio = useCallback(() => {
    const m = mapInstanceRef.current
    if (!m) return
    const filtro = territorioFiltroRef.current

    const alternar = (layer: any, dentro: boolean) => {
      if (dentro) { if (!m.hasLayer(layer)) layer.addTo(m) }
      else if (m.hasLayer(layer)) m.removeLayer(layer)
    }

    territorioLayersRef.current.forEach((layer: any) =>
      alternar(layer, !filtro || layer._territorioId === filtro))

    const quadraTerritorio = new Map<string, string | null>()
    layersRef.current.forEach((layer: any) => {
      if (layer._quadra) quadraTerritorio.set(layer._quadra.id, layer._quadra.territorio_id)
      alternar(layer, !filtro || layer._quadra?.territorio_id === filtro)
    })

    pontoLayersRef.current.forEach((layer: any) =>
      alternar(layer, !filtro || quadraTerritorio.get(layer._quadraId) === filtro))
  }, [])

  useEffect(() => {
    aplicarFiltroTerritorio()
    const m = mapInstanceRef.current
    if (!m || !territorioFiltro) return
    const layer = territorioLayersRef.current.find((l: any) => l._territorioId === territorioFiltro)
    if (layer) m.fitBounds(layer.getBounds(), { maxZoom: 17, padding: [24, 24] })
  }, [territorioFiltro, aplicarFiltroTerritorio])

  // "Onde parei": última quadra que esse usuário marcou, pra retomar rápido
  // em vez de procurar no mapa de novo.
  useEffect(() => {
    if (!usuario) return
    let cancelado = false
    supabase.from('marcacoes')
      .select('quadra_id, criado_em, quadras(id, nome, territorio_id)')
      .eq('usuario_id', usuario.id)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado || !data) return
        const q = (data as any).quadras as { id: string; nome: string; territorio_id: string | null } | null
        if (!q?.territorio_id) return
        setUltimoTrabalho({ quadraId: q.id, quadraNome: q.nome, territorioId: q.territorio_id })
      })
    return () => { cancelado = true }
  }, [usuario])

  function continuarDeOndeParou() {
    if (!ultimoTrabalho) return
    const m = mapInstanceRef.current
    const layer = layersRef.current.find((l: any) => l._quadra?.id === ultimoTrabalho.quadraId)
    setTerritorioFiltro(ultimoTrabalho.territorioId)
    if (layer && m) {
      m.fitBounds(layer.getBounds(), { maxZoom: 18, padding: [40, 40] })
      abrirPainelQuadra(layer._quadra)
    }
  }

  // ── Seleção por área ─────────────────────────────────────────────────────────
  // Clique em quadra durante o modo seleção alterna ela dentro/fora do grupo,
  // em vez de abrir o painel de detalhe. Só quadra sem território entra.
  const alternarSelecaoQuadra = useCallback((q: Quadra, layer: any) => {
    if (q.territorio_id) return
    setSelecionadas((anterior) => {
      const proxima = new Set(anterior)
      if (proxima.has(q.id)) { proxima.delete(q.id); layer.setStyle(estiloDaQuadra(q.status)) }
      else { proxima.add(q.id); layer.setStyle(ESTILO_SELECIONADA) }
      return proxima
    })
  }, [])

  function abrirPainelQuadra(q: Quadra) {
    setQuadraAtiva(q); setPainelAberto(true)
  }

  // ── Carregar quadras ─────────────────────────────────────────────────────────
  const carregarQuadras = useCallback(async (map?: any) => {
    const m = map ?? mapInstanceRef.current
    if (!m) return
    const L = (window as any).L

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: usuarioData } = await supabase.from('usuarios').select('*').eq('id', user.id).single()
    if (usuarioData) setUsuario(usuarioData)

    const { data: terrsData } = await supabase.from('territorios')
      .select('id, nome, numero, geojson, link_maps').order('numero')
    setTerritorios(terrsData ?? [])
    setTerritoriosCarregados(true)

    const { data: quadrasData } = await supabase.from('quadras').select('*')
    if (!quadrasData) return

    // Depois de vários awaits, "m" pode já ter sido substituído/removido
    // (StrictMode remonta em dev, ou o usuário navegou pra outra tela) —
    // mexer nele agora quebraria o Leaflet.
    if (mapInstanceRef.current !== m) return

    // Contornos dos territórios, numa camada abaixo das quadras
    territorioLayersRef.current.forEach((l) => m.removeLayer(l))
    territorioLayersRef.current = []
    for (const t of (terrsData ?? []) as Territorio[]) {
      if (!t.geojson) continue
      const quadrasDoTerritorio = (quadrasData as Quadra[]).filter((q) => q.territorio_id === t.id)
      const progresso = progressoDoTerritorio(quadrasDoTerritorio)
      const layer = L.geoJSON(t.geojson, {
        pane: 'territorios',
        style: { color: '#1F3A5F', weight: 3, fillColor: corDoProgresso(progresso), fillOpacity: 0.2 },
      }).addTo(m)
      const nomeRotulo = escaparHtml((t.nome || '').toUpperCase())
      layer.bindTooltip(
        `<div class="rotulo-territorio-numero">${escaparHtml(String(t.numero))}</div>` +
        (nomeRotulo ? `<div class="rotulo-territorio-nome">${nomeRotulo}</div>` : ''),
        { permanent: true, direction: 'center', className: 'rotulo-territorio' }
      )
      layer.bindPopup(popupDoTerritorio(t, progresso, quadrasDoTerritorio.length), { maxWidth: 260 })
      // Tocar no território aproxima o mapa nas quadras dele
      layer.on('click', () => m.fitBounds(layer.getBounds(), { maxZoom: 17, padding: [24, 24] }))
      ;(layer as any)._territorioId = t.id
      territorioLayersRef.current.push(layer)
    }

    layersRef.current.forEach((l) => m.removeLayer(l))
    layersRef.current = []

    for (const q of quadrasData as Quadra[]) {
      if (!q.geojson) continue
      const layer = L.geoJSON(q.geojson, { style: estiloDaQuadra(q.status) }).addTo(m)
      ;(layer as any)._quadra = q
      layer.on('click', (e: any) => {
        L.DomEvent.stopPropagation(e)
        if (modoSelecaoRef.current) { alternarSelecaoQuadra(q, layer); return }
        abrirPainelQuadra(q)
      })
      layersRef.current.push(layer)
    }

    const { data: pontosData } = await supabase
      .from('pontos_parada')
      .select('*, usuario:usuario_id(nome)')
      .order('criado_em', { ascending: false })
    setTodosPontos(pontosData ?? [])
    if (mapInstanceRef.current !== m) return
    renderizarPontos(m, pontosData ?? [])
    aplicarFiltroTerritorio()
  }, [renderizarPontos, alternarSelecaoQuadra, aplicarFiltroTerritorio])

  // ── Inicializar mapa ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return
    const L = (window as any).L
    if (!L) return

    const map = L.map(mapRef.current, { center: [-6.52, -49.85], zoom: 14, zoomControl: false })
    const ruas = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 20,
    })
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services'
    const satelite = L.layerGroup([
      L.tileLayer(`${esri}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
        attribution: 'Imagens © Esri, Maxar, Earthstar Geographics', maxNativeZoom: 19, maxZoom: 20,
      }),
      // Nomes de ruas por cima do satélite
      L.tileLayer(`${esri}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, {
        maxNativeZoom: 19, maxZoom: 20,
      }),
    ])
    ruas.addTo(map)
    L.control.layers({ Ruas: ruas, 'Satélite': satelite }, undefined, { position: 'topright' }).addTo(map)

    map.createPane('territorios')
    map.getPane('territorios').style.zIndex = '390'
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapInstanceRef.current = map
    setMapInstance(map)

    // O mapa pode ser removido (StrictMode remonta em dev, ou o usuário navega
    // pra outra tela) antes dessas chamadas assíncronas responderem — sem essa
    // flag, o .then()/callback tardio mexe num mapa já destruído e o Leaflet
    // quebra tentando acessar panes/posições que não existem mais.
    let cancelado = false

    supabase.from('configuracoes').select('lat, lng').eq('id', 1).single().then(({ data }) => {
      if (cancelado) return
      if (data?.lat && data?.lng) map.setView([data.lat, data.lng], 14)
    })

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { if (!cancelado) map.setView([pos.coords.latitude, pos.coords.longitude], 15) },
        () => {}
      )
    }

    void carregarQuadras(map)

    // O container fica dentro de um layout flex/dinâmico — o tamanho real
    // só é conhecido depois do primeiro paint. Sem isso o Leaflet pode
    // desenhar um mapa cortado, com espaço em branco embaixo.
    //
    // O invalidateSize roda num requestAnimationFrame (não direto no
    // callback do ResizeObserver): lido nesse ponto, getBoundingClientRect
    // às vezes ainda reflete um layout intermediário de um reflow que
    // ainda não terminou (ex: redimensionar a janela do navegador), e o
    // Leaflet cacheava esse tamanho errado até o próximo resize.
    let raf = 0
    const recalcular = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => map.invalidateSize())
    }
    const observador = new ResizeObserver(recalcular)
    observador.observe(mapRef.current)
    window.addEventListener('resize', recalcular)
    const t = setTimeout(() => map.invalidateSize(), 200)

    return () => {
      cancelado = true
      clearTimeout(t)
      cancelAnimationFrame(raf)
      observador.disconnect()
      window.removeEventListener('resize', recalcular)
      map.remove()
      mapInstanceRef.current = null
    }
  }, [carregarQuadras])

  // ── Status quadra ────────────────────────────────────────────────────────────
  async function atualizarStatusQuadra(novoStatus: StatusQuadra) {
    if (!quadraAtiva || !usuario) return
    setSalvando(true)
    const { error } = await supabase.from('quadras')
      .update({ status: novoStatus }).eq('id', quadraAtiva.id)
    if (!error) {
      await supabase.from('marcacoes').insert({
        quadra_id: quadraAtiva.id, usuario_id: usuario.id, status: novoStatus,
      })
      setQuadraAtiva({ ...quadraAtiva, status: novoStatus })
      const layer = layersRef.current.find((l: any) => l._quadra?.id === quadraAtiva.id)
      if (layer) { layer._quadra = { ...layer._quadra, status: novoStatus }; layer.setStyle(estiloDaQuadra(novoStatus)) }
      mostrarFeedback('Quadra atualizada!')
    }
    setSalvando(false)
  }

  // ── Centralizar na localização atual ────────────────────────────────────────
  const [localizando, setLocalizando] = useState(false)
  function centralizarLocalizacaoAtual() {
    const m = mapInstanceRef.current
    if (!m || !navigator.geolocation) return
    setLocalizando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        m.setView([pos.coords.latitude, pos.coords.longitude], 16)
        setLocalizando(false)
      },
      () => {
        mostrarFeedback('⚠️ Não foi possível obter localização')
        setLocalizando(false)
      }
    )
  }

  // ── GPS ──────────────────────────────────────────────────────────────────────
  function marcarPontoGPS() {
    if (!quadraAtiva || !usuario) return
    mostrarFeedback('📡 Obtendo localização…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPontoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setPontoObs('')
        setPontoIdioma('')
        setPontoQtdPessoas('')
        setEditandoPonto(null)
        setModalPonto(true)
      },
      () => mostrarFeedback('⚠️ Não foi possível obter localização')
    )
  }

  async function confirmarPonto() {
    if (!pontoCoords || !quadraAtiva || !usuario) return
    if (pontoIdioma.trim() && !pontoQtdPessoas.trim()) {
      mostrarFeedback('Informe a quantidade de pessoas de outro idioma.')
      return
    }
    setSalvandoPonto(true)
    const { error } = await supabase.from('pontos_parada').insert({
      quadra_id: quadraAtiva.id,
      usuario_id: usuario.id, lat: pontoCoords.lat, lng: pontoCoords.lng,
      observacao: pontoObs.trim(),
      idioma: pontoIdioma.trim() || null,
      qtd_pessoas: pontoIdioma.trim() ? parseInt(pontoQtdPessoas, 10) : null,
    })
    setSalvandoPonto(false)
    if (!error) {
      setModalPonto(false)
      mostrarFeedback('📍 Ponto de parada salvo!')
      const { data } = await supabase.from('pontos_parada').select('*, usuario:usuario_id(nome)').order('criado_em', { ascending: false })
      setTodosPontos(data ?? [])
      renderizarPontos(mapInstanceRef.current, data ?? [])
    }
  }

  async function salvarObservacaoPonto() {
    if (!editandoPonto) return
    if (pontoIdioma.trim() && !pontoQtdPessoas.trim()) {
      mostrarFeedback('Informe a quantidade de pessoas de outro idioma.')
      return
    }
    setSalvandoPonto(true)
    // .select() devolve as linhas alteradas: vazio significa que o banco negou (RLS)
    const { data: alterados, error } = await supabase.from('pontos_parada')
      .update({
        observacao: pontoObs.trim(),
        idioma: pontoIdioma.trim() || null,
        qtd_pessoas: pontoIdioma.trim() ? parseInt(pontoQtdPessoas, 10) : null,
      }).eq('id', editandoPonto.id).select('id')
    setSalvandoPonto(false)
    if (error || !alterados?.length) {
      mostrarFeedback('⚠️ Só quem marcou o ponto (ou ST/admin) pode editá-lo.')
      return
    }
    setModalPonto(false)
    mostrarFeedback('Observação salva!')
    const { data } = await supabase.from('pontos_parada').select('*, usuario:usuario_id(nome)').order('criado_em', { ascending: false })
    setTodosPontos(data ?? [])
    renderizarPontos(mapInstanceRef.current, data ?? [])
  }

  async function apagarPonto(id: string) {
    if (!confirm('Apagar este ponto de parada?')) return
    const { data: apagados, error } = await supabase.from('pontos_parada').delete().eq('id', id).select('id')
    if (error || !apagados?.length) {
      mostrarFeedback('⚠️ Só quem marcou o ponto (ou ST/admin) pode apagá-lo.')
      return
    }
    mostrarFeedback('Ponto apagado.')
    const { data } = await supabase.from('pontos_parada').select('*, usuario:usuario_id(nome)').order('criado_em', { ascending: false })
    setTodosPontos(data ?? [])
    renderizarPontos(mapInstanceRef.current, data ?? [])
  }

  function editarPontoNoMapa(p: PontoParada) {
    setEditandoPonto(p); setPontoObs(p.observacao ?? ''); setPontoIdioma(p.idioma ?? '')
    setPontoQtdPessoas(p.qtd_pessoas != null ? String(p.qtd_pessoas) : ''); setModalPonto(true)
  }

  useEffect(() => {
    apagarPontoRef.current = apagarPonto
    editarPontoRef.current = editarPontoNoMapa
  })

  // ── Desenho ──────────────────────────────────────────────────────────────────
  function ativarDesenho() {
    const m = mapInstanceRef.current
    const L = (window as any).L
    if (!m || !L || !L.Draw) return
    setModoDesenho(true); setPainelAberto(false)

    const drawControl = new L.Control.Draw({
      draw: { polygon: { allowIntersection: false, showArea: true }, polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false },
      edit: false,
    })
    m.addControl(drawControl)
    new L.Draw.Polygon(m, drawControl.options.draw.polygon).enable()

    m.once(L.Draw.Event.CREATED, (e: any) => {
      m.removeControl(drawControl); setModoDesenho(false)
      pendingGeoJsonRef.current = e.layer.toGeoJSON()
      setNovaQuadraNome(''); setNovaQuadraTerritorioId(''); setModalCriar(true)
    })
    m.once(L.Draw.Event.DRAWSTOP, () => { m.removeControl(drawControl); setModoDesenho(false) })
  }

  async function confirmarCriarQuadra() {
    if (!novaQuadraNome.trim()) { mostrarFeedback('Digite o nome da quadra.'); return }
    if (!novaQuadraTerritorioId) { mostrarFeedback('Selecione um território.'); return }
    if (!pendingGeoJsonRef.current) return
    setSalvandoQuadra(true)
    const geojson = pendingGeoJsonRef.current
    const { error } = await supabase.from('quadras').insert({
      nome: novaQuadraNome.trim(), status: 'nao_iniciado', geojson,
      territorio_id: novaQuadraTerritorioId,
    })
    setSalvandoQuadra(false)
    if (!error) {
      setModalCriar(false); pendingGeoJsonRef.current = null
      mostrarFeedback(`Quadra "${novaQuadraNome}" criada!`)
      void carregarQuadras()
    } else { mostrarFeedback('Erro ao salvar quadra.') }
  }

  // ── Seleção por área: agrupar quadras sem território de uma vez ────────────
  useEffect(() => { modoSelecaoRef.current = modoSelecao }, [modoSelecao])
  useEffect(() => { selecionadasRef.current = selecionadas }, [selecionadas])

  // Arrasta um retângulo (via leaflet-draw); toda quadra sem território cujo
  // limite cruza o retângulo entra na seleção. Reabre o desenho em seguida,
  // pra dar pra marcar vários grupos sem clicar de novo no botão.
  function iniciarRetanguloDeSelecao() {
    const m = mapInstanceRef.current
    const L = (window as any).L
    if (!m || !L || !L.Draw) return
    const drawer = new L.Draw.Rectangle(m, { shapeOptions: { color: '#6B3FD4', weight: 2, fillOpacity: 0.08 } })
    drawer.enable()
    drawSelecaoRef.current = drawer

    m.once(L.Draw.Event.CREATED, (e: any) => {
      const bounds = e.layer.getBounds()
      const proxima = new Set(selecionadasRef.current)
      layersRef.current.forEach((layer: any) => {
        const q = layer._quadra as Quadra | undefined
        if (!q || q.territorio_id) return
        if (bounds.intersects(layer.getBounds())) {
          proxima.add(q.id)
          layer.setStyle(ESTILO_SELECIONADA)
        }
      })
      setSelecionadas(proxima)
      if (modoSelecaoRef.current) iniciarRetanguloDeSelecao()
    })
  }

  function ativarSelecaoPorArea() {
    const L = (window as any).L
    if (!mapInstanceRef.current || !L || !L.Draw) return
    setPainelAberto(false)
    setModoSelecao(true)
    iniciarRetanguloDeSelecao()
  }

  function sairDoModoSelecao() {
    drawSelecaoRef.current?.disable()
    drawSelecaoRef.current = null
    layersRef.current.forEach((layer: any) => {
      if (layer._quadra && selecionadasRef.current.has(layer._quadra.id)) {
        layer.setStyle(estiloDaQuadra(layer._quadra.status))
      }
    })
    setSelecionadas(new Set())
    setTerritorioParaAtribuir('')
    setModoSelecao(false)
  }

  async function atribuirSelecionadas() {
    if (!territorioParaAtribuir || selecionadas.size === 0) return
    setAtribuindo(true)
    const { error } = await supabase.from('quadras')
      .update({ territorio_id: territorioParaAtribuir })
      .in('id', [...selecionadas])
    setAtribuindo(false)
    if (error) { mostrarFeedback('Erro ao atribuir as quadras.'); return }
    const nomeTerr = territorios.find((t) => t.id === territorioParaAtribuir)?.nome ?? ''
    mostrarFeedback(`${selecionadas.size} quadra(s) atribuída(s) a "${nomeTerr}"!`)
    setSelecionadas(new Set())
    setTerritorioParaAtribuir('')
    await carregarQuadras()
  }

  function fecharPainel() {
    setPainelAberto(false); setQuadraAtiva(null)
    const m = mapInstanceRef.current
    if (m) m.getContainer().style.cursor = ''
  }

  const coresAtivas = quadraAtiva ? (CORES_STATUS[quadraAtiva.status] ?? CORES_STATUS['nao_iniciado']) : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Onde parei */}
      {!modoDesenho && !modalCriar && !modalPonto && !painelOSM && !modoSelecao && !painelAberto && ultimoTrabalho && !ultimoTrabalhoFechado && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 900,
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#fff', border: '1px solid #DDD', borderRadius: 8,
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)', padding: '6px 6px 6px 12px',
          maxWidth: 240,
        }}>
          <button
            onClick={continuarDeOndeParou}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>▶ Continuar de onde parei</span>
            <span style={{ fontSize: 13, color: '#1A1A1A', fontWeight: 700 }}>{ultimoTrabalho.quadraNome}</span>
          </button>
          <button
            onClick={() => setUltimoTrabalhoFechado(true)}
            title="Fechar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#AAA', fontSize: 14, padding: '4px 6px', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filtro: ver só um território */}
      {!modoDesenho && !modalCriar && !modalPonto && !painelOSM && !modoSelecao && territoriosCarregados && territorios.length > 0 && (
        <select
          value={territorioFiltro}
          onChange={(e) => setTerritorioFiltro(e.target.value)}
          title="Ver só um território"
          style={{
            position: 'absolute', top: 10, left: 10, zIndex: 900,
            padding: '9px 12px', fontSize: 14, fontWeight: 500,
            border: '1px solid #DDD', borderRadius: 8, background: '#fff', color: '#1A1A1A',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)', maxWidth: 220,
            cursor: 'pointer',
          }}
        >
          <option value="">🗺️ Todos os territórios</option>
          {territorios.map((t) => (
            <option key={t.id} value={t.id}>#{t.numero} — {t.nome}</option>
          ))}
        </select>
      )}

      {/* Toast */}
      {feedback && (
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#1A1A1A', color: '#fff', borderRadius: 20,
          padding: '8px 20px', fontSize: 14, fontWeight: 500,
          zIndex: 1000, pointerEvents: 'none',
        }}>
          {feedback}
        </div>
      )}

      {/* Centralizar na localização atual */}
      {!modoDesenho && !modalCriar && !modalPonto && !painelOSM && !modoSelecao && (
        <button
          onClick={centralizarLocalizacaoAtual}
          disabled={localizando}
          title="Ir para minha localização atual"
          style={{
            position: 'absolute', bottom: 96, right: 10, zIndex: 900,
            width: 40, height: 40, borderRadius: 8,
            background: '#fff', border: '2px solid rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, cursor: localizando ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            opacity: localizando ? 0.6 : 1,
          }}
        >
          {localizando ? '⏳' : '🎯'}
        </button>
      )}

      {/* Botão de ações ST: um único FAB que abre um menu curto, em vez de
          três botões largos empilhados brigando com o resto da tela */}
      {podeGerenciarQuadras && !painelAberto && !modoDesenho && !modalCriar && !painelOSM && !modoSelecao && (
        <div style={{ position: 'absolute', bottom: 96, left: 16, zIndex: 900, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
          {menuAcoesAberto && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <BotaoAcaoMapa icone="🔲" texto="Selecionar p/ território" cor="#6B3FD4"
                onClick={() => { setMenuAcoesAberto(false); ativarSelecaoPorArea() }} />
              <BotaoAcaoMapa icone="🌐" texto="Gerar quadras pelas ruas" cor="#378ADD"
                onClick={() => { setMenuAcoesAberto(false); setPainelOSM(true) }} />
              <BotaoAcaoMapa icone="✏️" texto="Desenhar quadra" cor="#3BAD68"
                onClick={() => { setMenuAcoesAberto(false); ativarDesenho() }} />
            </div>
          )}
          <button onClick={() => setMenuAcoesAberto((v) => !v)} title="Ações de território" style={{
            width: 52, height: 52, borderRadius: '50%', background: '#1A1A1A', color: '#fff',
            border: 'none', fontSize: 24, lineHeight: '52px', textAlign: 'center', padding: 0,
            cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            transform: menuAcoesAberto ? 'rotate(45deg)' : 'none', transition: 'transform 0.15s ease',
          }}>
            +
          </button>
        </div>
      )}

      {/* Painel de seleção por área */}
      {modoSelecao && (
        <div style={{
          position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 1100,
          background: '#FFFFFF', borderRadius: 14, padding: '14px 16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420, margin: '0 auto',
        }}>
          <div style={{ fontSize: 13, color: '#444', lineHeight: 1.5 }}>
            🔲 Arraste um retângulo no mapa pra selecionar quadras <strong>sem território</strong>. Pode arrastar várias vezes pra juntar mais de uma área. Clicar numa quadra também alterna ela na seleção.
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6B3FD4' }}>
            {selecionadas.size} quadra{selecionadas.size !== 1 ? 's' : ''} selecionada{selecionadas.size !== 1 ? 's' : ''}
          </div>
          <select value={territorioParaAtribuir} onChange={(e) => setTerritorioParaAtribuir(e.target.value)}
            disabled={selecionadas.size === 0}
            style={{ width: '100%', padding: '11px 14px', fontSize: 14, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none' }}>
            <option value="">— Atribuir ao território —</option>
            {territorios.map((t) => <option key={t.id} value={t.id}>#{t.numero} — {t.nome}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={sairDoModoSelecao} style={{
              flex: 1, padding: '12px', fontSize: 14, fontWeight: 500,
              background: '#F7F7F7', color: '#555', border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer',
            }}>
              Sair
            </button>
            <button onClick={() => void atribuirSelecionadas()} disabled={atribuindo || !territorioParaAtribuir || selecionadas.size === 0} style={{
              flex: 2, padding: '12px', fontSize: 14, fontWeight: 600,
              background: (atribuindo || !territorioParaAtribuir || selecionadas.size === 0) ? '#CCCCCC' : '#6B3FD4',
              color: '#fff', border: 'none', borderRadius: 10,
              cursor: (atribuindo || !territorioParaAtribuir || selecionadas.size === 0) ? 'not-allowed' : 'pointer',
            }}>
              {atribuindo ? 'Atribuindo…' : `✅ Atribuir ${selecionadas.size || ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Painel OSM */}
      {painelOSM && mapInstance && (
        <ImportarOSM
          mapInstance={mapInstance}
          territorios={territorios}
          onConcluir={() => void carregarQuadras()}
          onFechar={() => setPainelOSM(false)}
        />
      )}

      {/* Modal criar quadra */}
      {modalCriar && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20,
        }}>
          <div style={{ background: '#FFF', borderRadius: 16, padding: '28px 24px', width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A1A', margin: '0 0 20px' }}>Nova quadra</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Nome da quadra</label>
                <input type="text" value={novaQuadraNome} onChange={(e) => setNovaQuadraNome(e.target.value)}
                  placeholder="ex: Quadra A" autoFocus
                  style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Território</label>
                {!territoriosCarregados ? (
                  <p style={{ color: '#888', fontSize: 14 }}>Carregando territórios…</p>
                ) : territorios.length === 0 ? (
                  <p style={{ color: '#E05050', fontSize: 14 }}>⚠️ Crie um território primeiro.</p>
                ) : (
                  <select value={novaQuadraTerritorioId} onChange={(e) => setNovaQuadraTerritorioId(e.target.value)}
                    style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none' }}>
                    <option value="">— Selecione o território —</option>
                    {territorios.map((t) => <option key={t.id} value={t.id}>#{t.numero} — {t.nome}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => { setModalCriar(false); pendingGeoJsonRef.current = null }}
                style={{ flex: 1, padding: '13px', fontSize: 15, fontWeight: 500, background: '#F7F7F7', color: '#555', border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => void confirmarCriarQuadra()}
                disabled={salvandoQuadra || !novaQuadraNome.trim() || !novaQuadraTerritorioId}
                style={{
                  flex: 1, padding: '13px', fontSize: 15, fontWeight: 600,
                  background: (salvandoQuadra || !novaQuadraNome.trim() || !novaQuadraTerritorioId) ? '#CCC' : '#3BAD68',
                  color: '#FFF', border: 'none', borderRadius: 10,
                  cursor: (salvandoQuadra || !novaQuadraNome.trim() || !novaQuadraTerritorioId) ? 'not-allowed' : 'pointer',
                }}>
                {salvandoQuadra ? 'Salvando…' : 'Criar quadra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ponto de parada */}
      {modalPonto && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 2000,
        }}>
          <div style={{ background: '#FFF', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px', width: '100%', maxWidth: 480, boxShadow: '0 -4px 24px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 40, height: 4, background: '#DDD', borderRadius: 2 }} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1A1A1A', margin: '0 0 4px' }}>
              {editandoPonto ? 'Editar observação' : '📍 Ponto de parada'}
            </h3>
            {pontoCoords && !editandoPonto && (
              <p style={{ fontSize: 13, color: '#888', margin: '0 0 16px' }}>
                📡 {pontoCoords.lat.toFixed(6)}, {pontoCoords.lng.toFixed(6)}
              </p>
            )}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 8 }}>
              Observação (opcional)
            </label>
            <textarea value={pontoObs} onChange={(e) => setPontoObs(e.target.value)}
              placeholder="Ex: Parei na casa azul, voltei depois…" rows={3} autoFocus
              style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 10, background: '#FAFAFA', color: '#1A1A1A', resize: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', margin: '14px 0 8px' }}>
              🌐 Pessoas de outro idioma (opcional)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={pontoIdioma} onChange={(e) => setPontoIdioma(e.target.value)}
                placeholder="Ex: Espanhol, Libras…"
                style={{ flex: 2, padding: '12px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 10, background: '#FAFAFA', color: '#1A1A1A', outline: 'none', boxSizing: 'border-box' }} />
              <input type="number" min={1} value={pontoQtdPessoas} onChange={(e) => setPontoQtdPessoas(e.target.value)}
                disabled={!pontoIdioma.trim()} placeholder="Qtd"
                style={{ flex: 1, padding: '12px 14px', fontSize: 15, border: '1px solid #DDD', borderRadius: 10, background: pontoIdioma.trim() ? '#FAFAFA' : '#F0F0F0', color: '#1A1A1A', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setModalPonto(false)}
                style={{ flex: 1, padding: '13px', fontSize: 15, fontWeight: 500, background: '#F7F7F7', color: '#555', border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => void (editandoPonto ? salvarObservacaoPonto() : confirmarPonto())}
                disabled={salvandoPonto}
                style={{ flex: 2, padding: '13px', fontSize: 15, fontWeight: 600, background: salvandoPonto ? '#CCC' : '#E05050', color: '#FFF', border: 'none', borderRadius: 10, cursor: salvandoPonto ? 'not-allowed' : 'pointer' }}>
                {salvandoPonto ? 'Salvando…' : editandoPonto ? 'Salvar observação' : '📍 Confirmar ponto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel deslizante */}
      <div style={{
        position: 'absolute', bottom: painelAberto ? 0 : '-100%', left: 0, right: 0,
        background: '#FFF', borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)', zIndex: 1000,
        transition: 'bottom 0.3s ease', maxHeight: '75vh', overflowY: 'auto', padding: '0 0 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, background: '#DDD', borderRadius: 2 }} />
        </div>

        {quadraAtiva && (
          <div style={{ padding: '0 20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>
                  {quadraAtiva.nome}
                </h2>
              </div>
              <button onClick={fecharPainel} style={{ background: '#F7F7F7', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 18, cursor: 'pointer', color: '#666' }}>✕</button>
            </div>

            {/* Badge status */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: coresAtivas?.fill ?? '#EEE', border: `1px solid ${coresAtivas?.stroke ?? '#CCC'}`,
                borderRadius: 20, padding: '4px 12px',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: coresAtivas?.stroke ?? '#999', display: 'inline-block' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>
                  {CORES_STATUS[quadraAtiva.status]?.label ?? quadraAtiva.status}
                </span>
              </div>
              {!quadraAtiva.territorio_id && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: '#FFF8E7', border: '1px solid #F0C060',
                  borderRadius: 20, padding: '4px 12px',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#412402' }}>🏙️ Sem território</span>
                </div>
              )}
            </div>

            {/* Status — um único seletor pra quadra inteira */}
            {podeMarcar && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>
                    Marcar quadra como:
                  </label>
                  <select
                    value={quadraAtiva.status}
                    disabled={salvando}
                    onChange={(e) => void atualizarStatusQuadra(e.target.value as StatusQuadra)}
                    style={{
                      width: '100%', padding: '14px 16px', borderRadius: 10, fontSize: 15, fontWeight: 700,
                      border: `2px solid ${CORES_STATUS[quadraAtiva.status]?.stroke ?? '#ccc'}`,
                      background: CORES_STATUS[quadraAtiva.status]?.fill ?? '#eee',
                      color: '#1A1A1A', cursor: salvando ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {(Object.entries(CORES_STATUS) as [StatusQuadra, any][]).map(([status, cores]) => (
                      <option key={status} value={status}>{cores.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ height: 1, background: '#EEE', margin: '16px 0' }} />

                {/* GPS */}
                <button onClick={marcarPontoGPS} style={{
                  width: '100%', padding: '14px', border: '1.5px solid #EEE', borderRadius: 10,
                  background: '#FFF', color: '#1A1A1A', fontSize: 15, fontWeight: 500,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  📍 Marcar onde parei — usar GPS
                </button>

                <p style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 10, lineHeight: 1.4 }}>
                  🔒 Isso registra sua localização e o endereço aproximado — evite anotar dados
                  pessoais de moradores além do necessário para o trabalho de campo.
                </p>

                {/* Lista de pontos desta quadra */}
                {(() => {
                  const pts = todosPontos.filter((p) => p.quadra_id === quadraAtiva.id)
                  if (pts.length === 0) return null
                  return (
                    <div style={{ marginTop: 14 }}>
                      <p style={{ fontSize: 13, color: '#666', fontWeight: 500, marginBottom: 8 }}>
                        Pontos marcados ({pts.length})
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {pts.map((p) => {
                          const nome = (p.usuario as any)?.nome ?? 'Desconhecido'
                          const data = p.criado_em
                            ? new Date(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : ''
                          const mapsUrl = `https://maps.google.com/?q=${p.lat},${p.lng}`
                          return (
                            <div key={p.id} style={{ background: '#FFF5F5', border: '1px solid #FFE0E0', borderRadius: 10, padding: '10px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>👤 {nome}</div>
                                  {data && <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>🕐 {data}</div>}
                                  {p.idioma && (
                                    <div style={{ display: 'inline-block', background: '#F0EAFF', color: '#6B3FD4', fontWeight: 600, fontSize: 11, borderRadius: 6, padding: '2px 8px', marginTop: 4 }}>
                                      🌐 {p.idioma}{p.qtd_pessoas ? ` — ${p.qtd_pessoas} pessoa${p.qtd_pessoas > 1 ? 's' : ''}` : ''}
                                    </div>
                                  )}
                                  {p.observacao
                                    ? <div style={{ fontSize: 12, color: '#555', marginTop: 4, fontStyle: 'italic' }}>&ldquo;{p.observacao}&rdquo;</div>
                                    : <div style={{ fontSize: 12, color: '#AAAAAA', marginTop: 4 }}>Sem observação</div>
                                  }
                                  <a href={mapsUrl} target="_blank" rel="noreferrer"
                                    style={{ fontSize: 12, color: '#378ADD', marginTop: 6, display: 'inline-block', fontWeight: 500 }}>
                                    🗺️ Abrir no Google Maps
                                  </a>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                                  <button onClick={() => editarPontoNoMapa(p)}
                                    style={{ padding: '5px 8px', fontSize: 12, background: '#F0F0F0', border: '0.5px solid #DDD', borderRadius: 6, cursor: 'pointer', color: '#444' }}>✏️</button>
                                  <button onClick={() => void apagarPonto(p.id)}
                                    style={{ padding: '5px 8px', fontSize: 12, background: '#FFF0F0', border: '1px solid #FFCCCC', borderRadius: 6, cursor: 'pointer', color: '#E05050' }}>🗑️</button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            {/* Excluir quadra — só ST */}
            {podeGerenciarQuadras && (
              <>
                <div style={{ height: 1, background: '#EEE', margin: '12px 0' }} />
                <button onClick={() => {
                  if (!quadraAtiva) return
                  if (!confirm(`Excluir a quadra "${quadraAtiva.nome}"?`)) return
                  void supabase.from('quadras').delete().eq('id', quadraAtiva.id).then(({ error }) => {
                    if (!error) { fecharPainel(); mostrarFeedback('Quadra excluída.'); void carregarQuadras() }
                  })
                }} style={{
                  width: '100%', padding: '13px', border: '1px solid #FFCCCC', borderRadius: 10,
                  background: '#FFF0F0', color: '#E05050', fontSize: 14, fontWeight: 500,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  🗑️ Excluir esta quadra
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
