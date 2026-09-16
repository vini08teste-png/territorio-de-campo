'use client'

import { useEffect, useState } from 'react'
import { contarFila, aoMudarFila } from '@/lib/offline/fila'
import { sincronizar } from '@/lib/offline/sincronizar'

// Dispara a sincronização da fila offline (ao abrir o app e quando a internet
// volta) e mostra um selo com quantas ações ainda faltam gravar. Montado uma
// vez, no layout raiz.
export default function SincronizadorOffline() {
  const [pendentes, setPendentes] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)

  useEffect(() => {
    let vivo = true

    const atualizarContagem = async () => {
      const n = await contarFila()
      if (vivo) setPendentes(n)
    }

    const rodar = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) { void atualizarContagem(); return }
      if (vivo) setSincronizando(true)
      try { await sincronizar() } finally {
        if (vivo) { setSincronizando(false); void atualizarContagem() }
      }
    }

    void atualizarContagem()
    void rodar()

    const aoVoltarInternet = () => void rodar()
    window.addEventListener('online', aoVoltarInternet)
    const desinscrever = aoMudarFila(() => void atualizarContagem())
    // Rede pode oscilar sem disparar o evento 'online' — tenta de novo a cada 30s
    // se ainda houver pendências.
    const intervalo = setInterval(() => { if (navigator.onLine) void rodar() }, 30000)

    return () => {
      vivo = false
      window.removeEventListener('online', aoVoltarInternet)
      desinscrever()
      clearInterval(intervalo)
    }
  }, [])

  if (pendentes === 0 && !sincronizando) return null

  return (
    <div style={{
      position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
      zIndex: 4000, background: '#1A1A1A', color: '#fff', borderRadius: 20,
      padding: '7px 14px', fontSize: 12, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
    }}>
      {sincronizando
        ? <>🔄 Sincronizando…</>
        : <>⏳ {pendentes} para sincronizar</>}
    </div>
  )
}
