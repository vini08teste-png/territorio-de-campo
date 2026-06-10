'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export function AcessoNegadoToast() {
  const params = useSearchParams()
  const router = useRouter()
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    if (params.get('acesso_negado') !== '1') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisivel(true)
    router.replace('/app', { scroll: false })
    const t = setTimeout(() => setVisivel(false), 4000)
    return () => clearTimeout(t)
  }, [params, router])

  if (!visivel) return null

  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      background: '#FFE5E5', border: '1px solid #E05050',
      borderRadius: 12, padding: '12px 20px',
      fontSize: 15, fontWeight: 500, color: '#501313',
      zIndex: 9999, boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
      display: 'flex', alignItems: 'center', gap: 8,
      whiteSpace: 'nowrap',
    }}>
      🚫 Você não tem acesso a esta página.
    </div>
  )
}
