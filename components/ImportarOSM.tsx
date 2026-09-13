'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface Territorio {
  id: string
  nome: string
  numero: string
}

interface OsmWay {
  id: number
  nome: string
  geometry: { lat: number; lon: number }[]
  tags: Record<string, string>
}

interface Props {
  mapInstance: any // instância do Leaflet já inicializada
  territorios: Territorio[]
  onConcluir: () => void // callback para recarregar quadras
  onFechar: () => void
}

function gerarLadosFromCoords(coords: [number, number][]): object[] {
  const pontos = coords.slice(0, -1)
  return pontos.map((ponto, i) => ({
    id: crypto.randomUUID(),
    indice: i,
    inicio: ponto,
    fim: pontos[(i + 1) % pontos.length],
    status: 'nao_iniciado',
  }))
}

export default function ImportarOSM({ mapInstance: map, territorios, onConcluir, onFechar }: Props) {
  const [etapa, setEtapa] = useState<'instrucao' | 'selecionando' | 'carregando' | 'revisao' | 'importando' | 'erro'>('instrucao')
  const [waysSugeridos, setWaysSugeridos] = useState<OsmWay[]>([])
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [territorioId, setTerritorioId] = useState('')
  const [prefixoNome, setPrefixoNome] = useState('Quadra')
  const [erroMsg, setErroMsg] = useState('')
  const [progresso, setProgresso] = useState(0)
  const previewLayersRef = useRef<any[]>([])
  const retanguloLayerRef = useRef<any>(null)

  const L = typeof window !== 'undefined' ? (window as any).L : null

  // Limpar layers de preview ao desmontar
  useEffect(() => {
    return () => {
      previewLayersRef.current.forEach((l) => { try { map.removeLayer(l) } catch {} })
      if (retanguloLayerRef.current) { try { map.removeLayer(retanguloLayerRef.current) } catch {} }
    }
  }, [map])

  // ── Renderizar pré-visualização no mapa ────────────────────────────────────
  const renderizarPreview = useCallback((ways: OsmWay[]) => {
    if (!L) return
    previewLayersRef.current.forEach((l) => { try { map.removeLayer(l) } catch {} })
    previewLayersRef.current = []
    ways.forEach((way) => {
      const coords = way.geometry.map((g) => [g.lat, g.lon] as [number, number])
      const layer = L.polygon(coords, {
        color: '#3BAD68', fillColor: '#B8EAC8', fillOpacity: 0.5, weight: 2,
      }).addTo(map)
      layer.bindTooltip(way.nome, { permanent: false, direction: 'center' })
      previewLayersRef.current.push(layer)
    })
  }, [L, map])

  // ── Consultar Overpass API ─────────────────────────────────────────────────
  const buscarOSM = useCallback(async (s: number, w: number, n: number, e: number) => {
    setEtapa('carregando')

    // Query Overpass — busca landuse + building + place para cobrir diferentes qualidades de dado OSM
  const query = `
  [out:json][timeout:60];
  (
    way["landuse"~"residential|commercial|industrial|retail"](${s},${w},${n},${e});
    way["place"~"block|neighbourhood|quarter"](${s},${w},${n},${e});
  );
  out geom;
`

    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
      })

      if (!res.ok) throw new Error('Erro na API do OSM')
      const data = await res.json() as { elements: any[] }

      // Filtrar apenas ways fechados com geometria válida (polígonos)
      const ways: OsmWay[] = data.elements
        .filter((el: any) =>
          el.type === 'way' &&
          el.geometry?.length >= 4 &&
          // Verificar se é fechado (primeiro == último ponto)
          el.geometry[0].lat === el.geometry[el.geometry.length - 1].lat
        )
        .map((el: any, idx: number) => ({
          id: el.id,
          nome: el.tags?.name ?? el.tags?.['addr:street'] ?? `${prefixoNome} ${idx + 1}`,
          geometry: el.geometry,
          tags: el.tags ?? {},
        }))

      if (ways.length === 0) {
        setErroMsg('Nenhuma quadra encontrada nesta área. Tente uma área diferente ou com mais dados no OpenStreetMap.')
        setEtapa('erro')
        return
      }

      setWaysSugeridos(ways)
      // Selecionar todos por padrão
      setSelecionados(new Set(ways.map((w) => w.id)))
      renderizarPreview(ways)
      setEtapa('revisao')
    } catch {
      setErroMsg('Erro ao consultar o OpenStreetMap. Verifique sua conexão.')
      setEtapa('erro')
    }
  }, [prefixoNome, renderizarPreview])

  // ── Ativar seleção de retângulo ────────────────────────────────────────────
  const ativarRetangulo = useCallback(() => {
    if (!L || !L.Draw) return
    setEtapa('selecionando')

    const drawControl = new L.Control.Draw({
      draw: {
        rectangle: { shapeOptions: { color: '#378ADD', weight: 2, fillOpacity: 0.1 } },
        polygon: false, polyline: false, circle: false, marker: false, circlemarker: false,
      },
      edit: false,
    })
    map.addControl(drawControl)
    new L.Draw.Rectangle(map, drawControl.options.draw.rectangle).enable()

    map.once(L.Draw.Event.CREATED, async (e: any) => {
      map.removeControl(drawControl)
      const bounds = e.layer.getBounds()
      retanguloLayerRef.current = e.layer.addTo(map)
      await buscarOSM(
        bounds.getSouth(), bounds.getWest(),
        bounds.getNorth(), bounds.getEast()
      )
    })

    map.once(L.Draw.Event.DRAWSTOP, () => {
      try { map.removeControl(drawControl) } catch {}
      setEtapa('instrucao')
    })
  }, [L, map, buscarOSM])



  function toggleSelecionado(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      // Atualizar cor no mapa
      const idx = waysSugeridos.findIndex((w) => w.id === id)
      const layer = previewLayersRef.current[idx]
      if (layer) {
        const sel = next.has(id)
        layer.setStyle({
          color: sel ? '#3BAD68' : '#CCCCCC',
          fillColor: sel ? '#B8EAC8' : '#EEEEEE',
        })
      }
      return next
    })
  }

  function selecionarTodos() {
    const todos = new Set(waysSugeridos.map((w) => w.id))
    setSelecionados(todos)
    previewLayersRef.current.forEach((l) => l.setStyle({ color: '#3BAD68', fillColor: '#B8EAC8' }))
  }

  function deselecionarTodos() {
    setSelecionados(new Set())
    previewLayersRef.current.forEach((l) => l.setStyle({ color: '#CCCCCC', fillColor: '#EEEEEE' }))
  }

  // ── Importar quadras selecionadas ──────────────────────────────────────────
  async function importar() {
    if (!territorioId) return
    if (selecionados.size === 0) return

    setEtapa('importando')
    const paraImportar = waysSugeridos.filter((w) => selecionados.has(w.id))
    for (let i = 0; i < paraImportar.length; i++) {
      const way = paraImportar[i]
      setProgresso(Math.round(((i + 1) / paraImportar.length) * 100))

      // Converter geometry OSM para GeoJSON
      const coordinates = [
        way.geometry.map((g) => [g.lon, g.lat] as [number, number])
      ]

      // Garantir que o polígono é fechado
      const firstCoord = coordinates[0][0]
      const lastCoord = coordinates[0][coordinates[0].length - 1]
      if (firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1]) {
        coordinates[0].push(firstCoord)
      }

      const geojson = {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates },
        properties: { osm_id: way.id, ...way.tags },
      }

      const lados = gerarLadosFromCoords(coordinates[0])

      const nomeCustom = way.nome.startsWith('Quadra ')
        ? `${prefixoNome} ${way.nome.replace('Quadra ', '')}`
        : way.nome

      await supabase.from('quadras').insert({
        nome: nomeCustom,
        status: 'nao_iniciado',
        geojson,
        lados,
        territorio_id: territorioId,
      })

      // ignorar erros individuais
    }

    // Limpar preview
    previewLayersRef.current.forEach((l) => { try { map.removeLayer(l) } catch {} })
    if (retanguloLayerRef.current) { try { map.removeLayer(retanguloLayerRef.current) } catch {} }

    onConcluir()
    onFechar()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const selecionadosCount = selecionados.size

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: '100%', maxWidth: 360,
      background: '#FFFFFF',
      borderLeft: '0.5px solid #EEEEEE',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
      zIndex: 1100,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #EEEEEE', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Importar do OpenStreetMap</h2>
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
            {etapa === 'instrucao' && 'Desenhe uma área no mapa'}
            {etapa === 'selecionando' && '🖱️ Desenhe o retângulo no mapa'}
            {etapa === 'carregando' && '⏳ Consultando OpenStreetMap…'}
            {etapa === 'revisao' && `${waysSugeridos.length} quadras encontradas`}
            {etapa === 'importando' && `Importando… ${progresso}%`}
            {etapa === 'erro' && '⚠️ Erro'}
          </p>
        </div>
        <button onClick={onFechar} style={{ background: '#F7F7F7', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 16, cursor: 'pointer', color: '#666' }}>✕</button>
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {etapa === 'instrucao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F0F9FF', border: '1px solid #B3D9FF', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#042C53', lineHeight: 1.6 }}>
              <strong>Como funciona:</strong><br />
              1. Clique em &ldquo;Selecionar área&rdquo;<br />
              2. Desenhe um retângulo sobre a região<br />
              3. O sistema busca as quadras do OpenStreetMap<br />
              4. Você escolhe quais importar
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>
                Prefixo dos nomes
              </label>
              <input
                value={prefixoNome}
                onChange={(e) => setPrefixoNome(e.target.value)}
                placeholder="Quadra"
                style={{ width: '100%', padding: '11px 14px', fontSize: 14, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: 12, color: '#AAAAAA', marginTop: 4 }}>Ex: &ldquo;Quadra&rdquo; → &ldquo;Quadra 1&rdquo;, &ldquo;Quadra 2&rdquo;…</p>
            </div>

            <button onClick={ativarRetangulo} style={{
              padding: '14px', fontSize: 15, fontWeight: 600,
              background: '#378ADD', color: '#fff',
              border: 'none', borderRadius: 10, cursor: 'pointer',
            }}>
              🔲 Selecionar área no mapa
            </button>
          </div>
        )}

        {etapa === 'selecionando' && (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#666' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🖱️</div>
            <p style={{ fontSize: 15 }}>Clique e arraste no mapa para selecionar a área de importação.</p>
          </div>
        )}

        {etapa === 'carregando' && (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#666' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌐</div>
            <p style={{ fontSize: 15 }}>Consultando OpenStreetMap…</p>
            <p style={{ fontSize: 13, color: '#AAAAAA', marginTop: 8 }}>Isso pode levar alguns segundos.</p>
          </div>
        )}

        {etapa === 'erro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#FFF0F0', border: '1px solid #E05050', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#501313' }}>
              {erroMsg}
            </div>
            <button onClick={() => setEtapa('instrucao')} style={{
              padding: '13px', fontSize: 14, fontWeight: 600,
              background: '#F7F7F7', color: '#555',
              border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer',
            }}>
              ← Tentar novamente
            </button>
          </div>
        )}

        {etapa === 'revisao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Território */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>
                Território de destino *
              </label>
              {territorios.length === 0 ? (
                <p style={{ color: '#E05050', fontSize: 13 }}>Crie um território primeiro.</p>
              ) : (
                <select value={territorioId} onChange={(e) => setTerritorioId(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', fontSize: 14, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none' }}>
                  <option value="">— Selecione —</option>
                  {territorios.map((t) => (
                    <option key={t.id} value={t.id}>#{t.numero} — {t.nome}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Controles de seleção */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#666' }}>
                {selecionadosCount} de {waysSugeridos.length} selecionadas
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={selecionarTodos} style={{ fontSize: 12, padding: '4px 10px', background: '#F7F7F7', border: '0.5px solid #DDD', borderRadius: 6, cursor: 'pointer', color: '#444' }}>
                  Todas
                </button>
                <button onClick={deselecionarTodos} style={{ fontSize: 12, padding: '4px 10px', background: '#F7F7F7', border: '0.5px solid #DDD', borderRadius: 6, cursor: 'pointer', color: '#444' }}>
                  Nenhuma
                </button>
              </div>
            </div>

            {/* Lista */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {waysSugeridos.map((way) => {
                const sel = selecionados.has(way.id)
                const tipoTag = way.tags?.landuse ?? way.tags?.building ?? way.tags?.amenity ?? ''
                return (
                  <button
                    key={way.id}
                    onClick={() => toggleSelecionado(way.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                      border: sel ? '1.5px solid #3BAD68' : '1px solid #EEEEEE',
                      background: sel ? '#EAF7EF' : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{sel ? '✅' : '⬜'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {way.nome}
                      </div>
                      {tipoTag && <div style={{ fontSize: 11, color: '#888' }}>{tipoTag}</div>}
                    </div>
                    <span style={{ fontSize: 11, color: '#AAAAAA', flexShrink: 0 }}>
                      {way.geometry.length - 1} lados
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {etapa === 'importando' && (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#666' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <p style={{ fontSize: 15, marginBottom: 12 }}>Importando {selecionadosCount} quadras…</p>
            <div style={{ height: 8, background: '#EEEEEE', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progresso}%`, background: '#3BAD68', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: 13, color: '#AAAAAA', marginTop: 8 }}>{progresso}%</p>
          </div>
        )}
      </div>

      {/* Footer — botão importar */}
      {etapa === 'revisao' && (
        <div style={{ padding: '14px 20px', borderTop: '0.5px solid #EEEEEE' }}>
          <button
            onClick={() => void importar()}
            disabled={selecionadosCount === 0 || !territorioId}
            style={{
              width: '100%', padding: '14px', fontSize: 15, fontWeight: 600,
              background: selecionadosCount === 0 || !territorioId ? '#CCCCCC' : '#3BAD68',
              color: '#FFFFFF', border: 'none', borderRadius: 10,
              cursor: selecionadosCount === 0 || !territorioId ? 'not-allowed' : 'pointer',
            }}
          >
            ✅ Importar {selecionadosCount} quadra{selecionadosCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
