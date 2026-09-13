'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase, CORES_STATUS } from '@/lib/supabase'
import ImportarOSM from '@/components/ImportarOSM'


type StatusQuadra = 'nao_iniciado' | 'em_andamento' | 'parcial' | 'concluido' | 'pendente'

interface GeoJSONFeature {
  type: string
  geometry: { type: string; coordinates: number[][][] }
  properties?: Record<string, unknown>
}

interface Lado {
  id: string
  indice: number
  inicio: [number, number]
  fim: [number, number]
  status: StatusQuadra
}

interface Quadra {
  id: string
  nome: string
  status: StatusQuadra
  geojson: GeoJSONFeature
  lados: Lado[]
  territorio_id: string
}

interface Territorio {
  id: string
  nome: string
  numero: number
}

interface PontoParada {
  id: string
  quadra_id: string
  lado_id: string | null
  lat: number
  lng: number
  endereco: string
  observacao: string
  criado_em?: string
  usuario?: { nome: string }
}

interface Usuario {
  id: string
  nome: string
  perfil: string
}

const PESO: Record<StatusQuadra, number> = {
  concluido: 1, parcial: 0.5,
  nao_iniciado: 0, em_andamento: 0, pendente: 0,
}

function calcularProgresso(lados: Lado[]): number {
  if (!lados || lados.length === 0) return 0
  const soma = lados.reduce((acc, l) => acc + (PESO[l.status] ?? 0), 0)
  return Math.round((soma / lados.length) * 100)
}

function gerarLados(coordinates: [number, number][]): Lado[] {
  const pontos = coordinates.slice(0, -1)
  return pontos.map((ponto, i) => ({
    id: crypto.randomUUID(),
    indice: i,
    inicio: ponto,
    fim: pontos[(i + 1) % pontos.length],
    status: 'nao_iniciado' as StatusQuadra,
  }))
}

export default function Mapa() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const layersRef = useRef<any[]>([])
  const ladoLayersRef = useRef<Map<string, any>>(new Map())
  const pontoLayersRef = useRef<any[]>([])
  const pendingGeoJsonRef = useRef<any>(null)
  const apagarPontoRef = useRef<(id: string) => Promise<void>>(async () => {})
  const editarPontoRef = useRef<(p: PontoParada) => void>(() => {})

  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [quadraAtiva, setQuadraAtiva] = useState<Quadra | null>(null)
  const [ladoAtivo, setLadoAtivo] = useState<Lado | null>(null)
  const [painelAberto, setPainelAberto] = useState(false)
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
  const [modalPonto, setModalPonto] = useState(false)
  const [pontoCoords, setPontoCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [pontoObs, setPontoObs] = useState('')
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

  // ── Renderizar lados ─────────────────────────────────────────────────────────
  const renderizarLados = useCallback((m: any, quadra: Quadra, abrirFn: (q: Quadra, l: Lado) => void) => {
    const L = (window as any).L
    quadra.lados.forEach((lado) => {
      const inicio: [number, number] = [lado.inicio[1], lado.inicio[0]]
      const fim: [number, number] = [lado.fim[1], lado.fim[0]]
      const cores = CORES_STATUS[lado.status] ?? CORES_STATUS['nao_iniciado']
      const linha = L.polyline([inicio, fim], { color: cores.stroke, weight: 5, opacity: 0.85 }).addTo(m)
      linha.on('click', (e: any) => { L.DomEvent.stopPropagation(e); abrirFn(quadra, lado) })
      ladoLayersRef.current.set(lado.id, linha)
    })
  }, [])

  // ── Renderizar pontos ────────────────────────────────────────────────────────
  const renderizarPontos = useCallback((m: any, pts: PontoParada[]) => {
    const L = (window as any).L
    pontoLayersRef.current.forEach((l) => m.removeLayer(l))
    pontoLayersRef.current = []
    pts.forEach((p) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#E05050;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [28, 28], iconAnchor: [14, 28],
      })
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(m)
      const nome = (p.usuario as any)?.nome ?? 'Desconhecido'
      const data = p.criado_em
        ? new Date(p.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : ''
      const mapsUrl = `https://maps.google.com/?q=${p.lat},${p.lng}`
      marker.bindPopup(`
        <div style="font-size:13px;min-width:200px;line-height:1.6">
          <b style="color:#E05050;font-size:14px">📍 Ponto de parada</b><br/>
          <span style="color:#555">👤 ${nome}</span><br/>
          ${data ? `<span style="color:#888">🕐 ${data}</span><br/>` : ''}
          ${p.observacao ? `<span style="color:#333;font-style:italic">"${p.observacao}"</span><br/>` : '<span style="color:#AAAAAA;font-style:italic">Sem observação</span><br/>'}
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

  const abrirPainelLado = useCallback((q: Quadra, l: Lado) => {
    setQuadraAtiva(q); setLadoAtivo(l); setPainelAberto(true)
  }, [])

  function abrirPainelQuadra(q: Quadra) {
    setQuadraAtiva(q); setLadoAtivo(null); setPainelAberto(true)
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

    const { data: terrsData } = await supabase.from('territorios').select('id, nome, numero').order('numero')
    setTerritorios(terrsData ?? [])

    const { data: quadrasData } = await supabase.from('quadras').select('*')
    if (!quadrasData) return

    layersRef.current.forEach((l) => m.removeLayer(l))
    layersRef.current = []
    ladoLayersRef.current.forEach((l) => m.removeLayer(l))
    ladoLayersRef.current = new Map()

    for (const q of quadrasData as Quadra[]) {
      if (!q.geojson) continue
      const cores = CORES_STATUS[q.status] ?? CORES_STATUS['nao_iniciado']
      const layer = L.geoJSON(q.geojson, {
        style: { fillColor: cores.fill, fillOpacity: 0.45, color: cores.stroke, weight: 2 },
      }).addTo(m)
      layer.on('click', (e: any) => { L.DomEvent.stopPropagation(e); abrirPainelQuadra(q) })
      layersRef.current.push(layer)
      if (q.lados?.length > 0) renderizarLados(m, q, abrirPainelLado)
    }

    const { data: pontosData } = await supabase
      .from('pontos_parada')
      .select('*, usuario:usuario_id(nome)')
      .order('criado_em', { ascending: false })
    setTodosPontos(pontosData ?? [])
    renderizarPontos(m, pontosData ?? [])
  }, [renderizarLados, renderizarPontos, abrirPainelLado])

  // ── Inicializar mapa ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return
    const L = (window as any).L
    if (!L) return

    const map = L.map(mapRef.current, { center: [-6.52, -49.85], zoom: 14, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 20,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapInstanceRef.current = map
    setMapInstance(map)

    supabase.from('configuracoes').select('lat, lng').eq('id', 1).single().then(({ data }) => {
      if (data?.lat && data?.lng) map.setView([data.lat, data.lng], 14)
    })

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15),
        () => {}
      )
    }

    void carregarQuadras(map)
    return () => { map.remove(); mapInstanceRef.current = null }
  }, [carregarQuadras])

  // ── Status lado ──────────────────────────────────────────────────────────────
  async function atualizarStatusLado(novoStatus: StatusQuadra) {
    if (!quadraAtiva || !ladoAtivo || !usuario) return
    setSalvando(true)
    const novosLados = quadraAtiva.lados.map((l) =>
      l.id === ladoAtivo.id ? { ...l, status: novoStatus } : l
    )
    const prog = calcularProgresso(novosLados)
    let novoStatusQuadra: StatusQuadra = 'nao_iniciado'
    if (prog === 100) novoStatusQuadra = 'concluido'
    else if (prog > 50) novoStatusQuadra = 'em_andamento'
    else if (prog > 0) novoStatusQuadra = 'parcial'

    const { error } = await supabase.from('quadras')
      .update({ lados: novosLados, status: novoStatusQuadra }).eq('id', quadraAtiva.id)
    if (!error) {
      await supabase.from('marcacoes').insert({
        quadra_id: quadraAtiva.id, lado_id: ladoAtivo.id, usuario_id: usuario.id, status: novoStatus,
      })
      setQuadraAtiva({ ...quadraAtiva, lados: novosLados, status: novoStatusQuadra })
      setLadoAtivo({ ...ladoAtivo, status: novoStatus })
      const layer = ladoLayersRef.current.get(ladoAtivo.id)
      if (layer) layer.setStyle({ color: CORES_STATUS[novoStatus].stroke })
      mostrarFeedback('Status atualizado!')
    }
    setSalvando(false)
  }

  // ── Status quadra ────────────────────────────────────────────────────────────
  async function atualizarStatusQuadra(novoStatus: StatusQuadra) {
    if (!quadraAtiva || !usuario) return
    setSalvando(true)
    const novosLados = (quadraAtiva.lados ?? []).map((l) => ({ ...l, status: novoStatus }))
    const { error } = await supabase.from('quadras')
      .update({ status: novoStatus, lados: novosLados }).eq('id', quadraAtiva.id)
    if (!error) {
      await supabase.from('marcacoes').insert({
        quadra_id: quadraAtiva.id, usuario_id: usuario.id, status: novoStatus,
      })
      setQuadraAtiva({ ...quadraAtiva, status: novoStatus, lados: novosLados })
      novosLados.forEach((l) => {
        const layer = ladoLayersRef.current.get(l.id)
        if (layer) layer.setStyle({ color: CORES_STATUS[novoStatus].stroke })
      })
      mostrarFeedback('Quadra atualizada!')
    }
    setSalvando(false)
  }

  // ── GPS ──────────────────────────────────────────────────────────────────────
  function marcarPontoGPS() {
    if (!quadraAtiva || !usuario) return
    mostrarFeedback('📡 Obtendo localização…')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPontoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setPontoObs('')
        setEditandoPonto(null)
        setModalPonto(true)
      },
      () => mostrarFeedback('⚠️ Não foi possível obter localização')
    )
  }

  async function confirmarPonto() {
    if (!pontoCoords || !quadraAtiva || !usuario) return
    setSalvandoPonto(true)
    const { error } = await supabase.from('pontos_parada').insert({
      quadra_id: quadraAtiva.id, lado_id: ladoAtivo?.id ?? null,
      usuario_id: usuario.id, lat: pontoCoords.lat, lng: pontoCoords.lng,
      observacao: pontoObs.trim(),
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
    setSalvandoPonto(true)
    const { error } = await supabase.from('pontos_parada')
      .update({ observacao: pontoObs.trim() }).eq('id', editandoPonto.id)
    setSalvandoPonto(false)
    if (!error) {
      setModalPonto(false)
      mostrarFeedback('Observação salva!')
      const { data } = await supabase.from('pontos_parada').select('*, usuario:usuario_id(nome)').order('criado_em', { ascending: false })
      setTodosPontos(data ?? [])
      renderizarPontos(mapInstanceRef.current, data ?? [])
    }
  }

  async function apagarPonto(id: string) {
    if (!confirm('Apagar este ponto de parada?')) return
    const { error } = await supabase.from('pontos_parada').delete().eq('id', id)
    if (!error) {
      mostrarFeedback('Ponto apagado.')
      const { data } = await supabase.from('pontos_parada').select('*, usuario:usuario_id(nome)').order('criado_em', { ascending: false })
      setTodosPontos(data ?? [])
      renderizarPontos(mapInstanceRef.current, data ?? [])
    }
  }

  function editarPontoNoMapa(p: PontoParada) {
    setEditandoPonto(p); setPontoObs(p.observacao ?? ''); setModalPonto(true)
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
    const coords: [number, number][] = geojson.geometry.coordinates[0]
    const lados = gerarLados(coords)
    const { error } = await supabase.from('quadras').insert({
      nome: novaQuadraNome.trim(), status: 'nao_iniciado', geojson, lados,
      territorio_id: novaQuadraTerritorioId,
    })
    setSalvandoQuadra(false)
    if (!error) {
      setModalCriar(false); pendingGeoJsonRef.current = null
      mostrarFeedback(`Quadra "${novaQuadraNome}" criada!`)
      void carregarQuadras()
    } else { mostrarFeedback('Erro ao salvar quadra.') }
  }

  function fecharPainel() {
    setPainelAberto(false); setQuadraAtiva(null); setLadoAtivo(null)
    const m = mapInstanceRef.current
    if (m) m.getContainer().style.cursor = ''
  }

  const progresso = quadraAtiva ? calcularProgresso(quadraAtiva.lados ?? []) : 0
  const coresAtivas = quadraAtiva ? (CORES_STATUS[quadraAtiva.status] ?? CORES_STATUS['nao_iniciado']) : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

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

      {/* Botões ST */}
      {podeGerenciarQuadras && !painelAberto && !modoDesenho && !modalCriar && !painelOSM && (
        <div style={{
          position: 'absolute', bottom: 160, left: 16,
          display: 'flex', flexDirection: 'column', gap: 8, zIndex: 900,
        }}>
          <button onClick={ativarDesenho} style={{
            background: '#3BAD68', color: '#fff', border: 'none', borderRadius: 12,
            padding: '12px 18px', fontSize: 15, fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            ✏️ Desenhar quadra
          </button>
          {/* <button onClick={() => setPainelOSM(true)} style={{
            background: '#378ADD', color: '#fff', border: 'none', borderRadius: 12,
            padding: '12px 18px', fontSize: 15, fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            🌐 Importar do OSM
          </button> */}
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
                {territorios.length === 0 ? (
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
                  {ladoAtivo ? `Lado ${ladoAtivo.indice + 1}` : quadraAtiva.nome}
                </h2>
                {ladoAtivo && (
                  <button onClick={() => setLadoAtivo(null)} style={{ fontSize: 13, color: '#378ADD', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}>
                    ← Voltar para {quadraAtiva.nome}
                  </button>
                )}
              </div>
              <button onClick={fecharPainel} style={{ background: '#F7F7F7', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 18, cursor: 'pointer', color: '#666' }}>✕</button>
            </div>

            {/* Badge status */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: coresAtivas?.fill ?? '#EEE', border: `1px solid ${coresAtivas?.stroke ?? '#CCC'}`,
              borderRadius: 20, padding: '4px 12px', marginBottom: 16,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: coresAtivas?.stroke ?? '#999', display: 'inline-block' }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>
                {ladoAtivo ? (CORES_STATUS[ladoAtivo.status]?.label ?? ladoAtivo.status) : (CORES_STATUS[quadraAtiva.status]?.label ?? quadraAtiva.status)}
              </span>
            </div>

            {/* Progresso */}
            {!ladoAtivo && quadraAtiva.lados?.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666', marginBottom: 4 }}>
                  <span>{quadraAtiva.lados.length} lados</span>
                  <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{progresso}% concluído</span>
                </div>
                <div style={{ height: 8, background: '#EEE', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progresso}%`, background: progresso === 100 ? '#3BAD68' : '#378ADD', borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
              </div>
            )}

            {/* Lados — grade compacta em vez de lista de linhas */}
            {!ladoAtivo && quadraAtiva.lados?.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>Selecione um lado:</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 8 }}>
                  {quadraAtiva.lados.map((l) => {
                    const c = CORES_STATUS[l.status] ?? CORES_STATUS['nao_iniciado']
                    return (
                      <button key={l.id} onClick={() => abrirPainelLado(quadraAtiva, l)} title={`Lado ${l.indice + 1} — ${c.label}`} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 2, padding: '8px 4px', borderRadius: 10,
                        background: c.fill, border: `1.5px solid ${c.stroke}`,
                        cursor: 'pointer', minHeight: 48,
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{l.indice + 1}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Status — um único seletor no lugar da grade de 5 botões */}
            {podeMarcar && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 8, fontWeight: 500 }}>
                    {ladoAtivo ? 'Marcar este lado como:' : 'Marcar quadra inteira como:'}
                  </label>
                  <select
                    value={ladoAtivo ? ladoAtivo.status : quadraAtiva.status}
                    disabled={salvando}
                    onChange={(e) => void (ladoAtivo ? atualizarStatusLado(e.target.value as StatusQuadra) : atualizarStatusQuadra(e.target.value as StatusQuadra))}
                    style={{
                      width: '100%', padding: '14px 16px', borderRadius: 10, fontSize: 15, fontWeight: 700,
                      border: `2px solid ${(ladoAtivo ? CORES_STATUS[ladoAtivo.status] : CORES_STATUS[quadraAtiva.status])?.stroke ?? '#ccc'}`,
                      background: (ladoAtivo ? CORES_STATUS[ladoAtivo.status] : CORES_STATUS[quadraAtiva.status])?.fill ?? '#eee',
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
                                  <button onClick={() => { setEditandoPonto(p); setPontoObs(p.observacao ?? ''); setModalPonto(true) }}
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
            {podeGerenciarQuadras && !ladoAtivo && (
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
