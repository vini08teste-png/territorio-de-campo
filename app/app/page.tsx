'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react'
import { supabase, CORES_STATUS, type Quadra, type Usuario } from '@/lib/supabase'
import dynamic from 'next/dynamic'

const MapaComponent = dynamic(() => import('@/components/Mapa'), { ssr: false }) as any

export default function MapaPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [territorios, setTerritorios] = useState<any[]>([])
  const [quadras, setQuadras] = useState<Quadra[]>([])
  const [quadraSelecionada, setQuadraSelecionada] = useState<Quadra | null>(null)
  const [painelAberto, setPainelAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    async function carregar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: usr } = await supabase.from('usuarios').select('*').eq('id', session.user.id).single()
      setUsuario(usr)
      const { data: terr } = await supabase.from('territorios').select('*')
      setTerritorios(terr || [])
      const { data: quad } = await supabase.from('quadras').select('*')
      setQuadras(quad || [])
    }
    carregar()
  }, [])

  async function marcarStatus(status: string) {
    if (!quadraSelecionada || !usuario) return
    setSalvando(true)
    await supabase.from('marcacoes').insert({ quadra_id: quadraSelecionada.id, usuario_id: usuario.id, status })
    await supabase.from('quadras').update({ status }).eq('id', quadraSelecionada.id)
    setQuadras(prev => prev.map(q => q.id === quadraSelecionada.id ? { ...q, status: status as Quadra['status'] } : q))
    setQuadraSelecionada(prev => prev ? { ...prev, status: status as Quadra['status'] } : null)
    setSalvando(false)
    setSucesso('Salvo!')
    setTimeout(() => setSucesso(''), 2000)
  }

  async function marcarPontoGPS() {
    if (!quadraSelecionada || !usuario) return
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await supabase.from('pontos_parada').insert({
        quadra_id: quadraSelecionada.id,
        usuario_id: usuario.id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      })
      setSucesso('Ponto salvo!')
      setTimeout(() => setSucesso(''), 2000)
    })
  }

  const podeMarca = usuario?.perfil !== 'admin'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Mapa ocupa todo o espaço */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {usuario && (
          <MapaComponent
            quadras={quadras}
            territorios={territorios}
            usuario={usuario}
            onCliqueQuadra={(q: any) => { setQuadraSelecionada(q); setPainelAberto(true) }}
            podeDesenhar={usuario.perfil === 'superintendente_territorio'}
          />
        )}

        {/* Legenda */}
        <div style={{
          position: 'absolute', bottom: painelAberto ? 220 : 16, right: 12, zIndex: 500,
          background: 'white', borderRadius: 10, padding: '10px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)', minWidth: 150,
          transition: 'bottom 0.3s ease',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legenda</div>
          {Object.entries(CORES_STATUS).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: v.fill, border: `1.5px solid ${v.stroke}`, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#444' }}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Painel inferior ao clicar na quadra */}
      {painelAberto && quadraSelecionada && (
        <>
          {/* Overlay escuro */}
          <div
            onClick={() => setPainelAberto(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 599, background: 'rgba(0,0,0,0.2)' }}
          />

          {/* Painel */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 600,
            background: '#fff',
            borderRadius: '20px 20px 0 0',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
            padding: '0 0 24px',
            maxHeight: '70vh', overflowY: 'auto',
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E0E0E0' }} />
            </div>

            <div style={{ padding: '0 20px' }}>
              {/* Título */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A', marginBottom: 4 }}>{quadraSelecionada.nome}</h2>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                    background: CORES_STATUS[quadraSelecionada.status]?.fill || '#eee',
                    color: '#333',
                    border: `1.5px solid ${CORES_STATUS[quadraSelecionada.status]?.stroke || '#ccc'}`,
                  }}>
                    {CORES_STATUS[quadraSelecionada.status]?.label}
                  </span>
                </div>
                <button onClick={() => setPainelAberto(false)} style={{
                  background: '#F5F5F5', border: 'none', borderRadius: 8,
                  width: 36, height: 36, fontSize: 16, cursor: 'pointer', color: '#666',
                }}>✕</button>
              </div>

              {/* Feedback */}
              {sucesso && (
                <div style={{
                  background: '#E8F7F0', border: '1.5px solid #3BAD68',
                  borderRadius: 10, padding: '10px 14px',
                  fontSize: 15, fontWeight: 700, color: '#04342C',
                  marginBottom: 14, textAlign: 'center',
                }}>
                  ✅ {sucesso}
                </div>
              )}

              {podeMarca && (
                <>
                  <p style={{ fontSize: 15, color: '#666', marginBottom: 12 }}>Como está esta quadra?</p>

                  {/* Grid de status */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    {Object.entries(CORES_STATUS).map(([k, v]) => (
                      <button key={k} onClick={() => marcarStatus(k)} disabled={salvando} style={{
                        padding: '12px 8px',
                        borderRadius: 10,
                        border: `2px solid ${quadraSelecionada.status === k ? '#333' : v.stroke}`,
                        background: v.fill,
                        fontWeight: quadraSelecionada.status === k ? 800 : 600,
                        fontSize: 14, cursor: 'pointer',
                        color: '#333',
                      }}>
                        {quadraSelecionada.status === k ? '✓ ' : ''}{v.label}
                      </button>
                    ))}
                  </div>

                  <button onClick={marcarPontoGPS} style={{
                    width: '100%', padding: '14px',
                    background: '#FFF8E7', border: '1.5px solid #F0C060',
                    borderRadius: 12, fontSize: 16, fontWeight: 700,
                    color: '#412402', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    📍 Marcar onde parei
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
