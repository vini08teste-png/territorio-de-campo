'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.push('/app')
      else router.push('/login')
    })
  }, [router])
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#E8F7F0' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
        <p style={{ fontSize: 20, color: '#0F6E56', fontWeight: 600 }}>Território de Campo</p>
        <p style={{ fontSize: 16, color: '#888', marginTop: 8 }}>Carregando...</p>
      </div>
    </div>
  )
}
