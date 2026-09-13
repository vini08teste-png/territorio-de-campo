'use client'

import dynamic from 'next/dynamic'

// components/Mapa é totalmente autossuficiente: busca usuário, territórios,
// quadras e cuida de todo o painel de marcação internamente.
const MapaComponent = dynamic(() => import('@/components/Mapa'), { ssr: false })

export default function MapaPage() {
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <MapaComponent />
    </div>
  )
}
