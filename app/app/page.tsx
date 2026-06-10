
'use client'

import dynamic from 'next/dynamic'
import { CORES_STATUS } from '@/lib/supabase'

// Mapa é carregado só no cliente (Leaflet não funciona no SSR)
const MapaComponent = dynamic(() => import('@/components/Mapa'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#F7F7F7', gap: 12,
    }}>
      <div style={{ fontSize: 36 }}>🗺️</div>
      <p style={{ color: '#888', fontSize: 15 }}>Carregando mapa…</p>
    </div>
  ),
})

export default function MapaPage() {
  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>

      {/* Mapa autossuficiente — gerencia dados, painel e ações internamente */}
      <MapaComponent />

      {/* Legenda fixa */}
      <div style={{
        position: 'absolute', bottom: 16, right: 16, zIndex: 500,
        background: '#FFFFFF', borderRadius: 12, padding: '10px 14px',
        border: '0.5px solid #EEEEEE',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        minWidth: 150,
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Legenda
        </div>
        {Object.entries(CORES_STATUS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <div style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              background: v.fill, border: `1.5px solid ${v.stroke}`,
            }} />
            <span style={{ fontSize: 12, color: '#555' }}>{v.label}</span>
          </div>
        ))}
      </div>

    </div>
  )
}

