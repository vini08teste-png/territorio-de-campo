'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

// Cartão de território pra imprimir: mapa com as quadras numeradas + uma
// legenda com espaço em branco pra anotar o nome de cada rua na mão (o
// sistema não tem nome de rua cadastrado, só o contorno da quadra).

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, CORES_STATUS, type Territorio, type Quadra } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'

export default function CartaoTerritorioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { carregando: verificandoAcesso, autorizado } = usePaginaRestrita(['superintendente_territorio', 'admin'])

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  const [territorio, setTerritorio] = useState<Territorio | null>(null)
  const [quadras, setQuadras] = useState<Quadra[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!autorizado) return
    void Promise.all([
      supabase.from('territorios').select('*').eq('id', id).single(),
      supabase.from('quadras').select('*').eq('territorio_id', id).order('nome'),
    ]).then(([t, q]) => {
      setTerritorio((t.data as Territorio) ?? null)
      setQuadras((q.data as Quadra[]) ?? [])
      setCarregando(false)
    })
  }, [id, autorizado])

  // Mapa estático (sem controles) só com as quadras deste território,
  // cada uma marcada com o número que aparece na legenda de ruas abaixo.
  useEffect(() => {
    if (carregando || !mapRef.current || mapInstanceRef.current) return
    const L = (window as any).L
    if (!L) return

    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20 }).addTo(map)
    mapInstanceRef.current = map

    const camadas: any[] = []
    quadras.forEach((q, i) => {
      if (!q.geojson) return
      const cores = CORES_STATUS[q.status] ?? CORES_STATUS['nao_iniciado']
      const layer = L.geoJSON(q.geojson, {
        style: { color: cores.stroke, weight: 2, fillColor: cores.fill, fillOpacity: 0.12 },
      }).addTo(map)
      const centro = layer.getBounds().getCenter()
      L.marker(centro, {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#1A1A1A;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${i + 1}</div>`,
          iconSize: [22, 22], iconAnchor: [11, 11],
        }),
        interactive: false,
      }).addTo(map)
      camadas.push(layer)
    })

    if (camadas.length > 0) {
      map.fitBounds(L.featureGroup(camadas).getBounds(), { padding: [4, 4], maxZoom: 19 })
    } else if (territorio?.geojson) {
      const layer = L.geoJSON(territorio.geojson).addTo(map)
      map.fitBounds(layer.getBounds(), { padding: [4, 4], maxZoom: 19 })
    } else {
      map.setView([-6.52, -49.85], 16)
    }

    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [carregando, quadras, territorio])

  useEffect(() => {
    return () => { mapInstanceRef.current?.remove(); mapInstanceRef.current = null }
  }, [])

  if (verificandoAcesso || carregando) return <Carregando />
  if (!autorizado) return <SemPermissao />
  if (!territorio) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Território não encontrado.</div>
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .cartao-imprimir, .cartao-imprimir * { visibility: visible; }
          .cartao-imprimir { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
          .nao-imprimir { display: none !important; }
        }
      `}</style>
      <div style={{ padding: '1.5rem 1rem 4rem', maxWidth: 1100, margin: '0 auto' }}>
        <div className="nao-imprimir" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/app/territorios')} style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 500, background: '#F7F7F7', color: '#555',
            border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer',
          }}>
            ← Territórios
          </button>
          <button onClick={() => window.print()} style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 600, background: '#3BAD68', color: '#fff',
            border: 'none', borderRadius: 10, cursor: 'pointer',
          }}>
            🖨️ Imprimir cartão
          </button>
        </div>

        <div className="cartao-imprimir">
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#1A1A1A' }}>
              Território #{territorio.numero} — {territorio.nome}
            </h1>
            {territorio.bairro && (
              <p style={{ fontSize: 14, color: '#666', margin: '4px 0 0' }}>{territorio.bairro}</p>
            )}
          </div>

          <div ref={mapRef} style={{ width: '100%', height: 640, border: '1px solid #DDD', borderRadius: 8, marginBottom: 24 }} />

          {quadras.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999', fontSize: 14 }}>
              Este território ainda não tem quadras agrupadas.
            </p>
          ) : (
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: '#1A1A1A' }}>
                Ruas <span style={{ fontWeight: 400, color: '#999' }}>— anote o nome de cada rua pelo número no mapa</span>
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 32px' }}>
                {quadras.map((q, i) => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, borderBottom: '1px solid #CCC', paddingBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, minWidth: 20, color: '#1A1A1A' }}>{i + 1}.</span>
                    <span style={{ flex: 1, fontSize: 12, color: '#AAA' }}>&nbsp;</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
