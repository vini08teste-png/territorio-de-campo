'use client'

import { useEffect, useState } from 'react'

// Faixa fina no topo avisando quando está sem internet — importante pro
// usuário saber que está vendo dados salvos (do cache) e que marcações ainda
// não vão gravar até o sinal voltar.
export default function StatusConexao() {
  const [online, setOnline] = useState(true)
  const [montado, setMontado] = useState(false)

  useEffect(() => {
    setMontado(true)
    setOnline(navigator.onLine)
    const aoMudar = () => setOnline(navigator.onLine)
    window.addEventListener('online', aoMudar)
    window.addEventListener('offline', aoMudar)
    return () => {
      window.removeEventListener('online', aoMudar)
      window.removeEventListener('offline', aoMudar)
    }
  }, [])

  if (!montado || online) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 5000,
      background: '#412402', color: '#FFE0A0', fontSize: 13, fontWeight: 600,
      textAlign: 'center', padding: '6px 12px', lineHeight: 1.3,
    }}>
      📴 Sem internet — vendo dados salvos. Marcações vão gravar quando o sinal voltar.
    </div>
  )
}
