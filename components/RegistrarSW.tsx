'use client'

import { useEffect } from 'react'

// Registra o service worker (public/sw.js) só em produção — em dev ele
// brigaria com o hot-reload do Turbopack, cacheando chunks que mudam a toda
// hora. O offline de verdade é testado na versão publicada (Vercel).
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const registrar = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* sem SW, app segue normal online */ })
    }
    // Espera a página carregar pra não competir com o primeiro render.
    if (document.readyState === 'complete') registrar()
    else window.addEventListener('load', registrar, { once: true })
  }, [])

  return null
}
