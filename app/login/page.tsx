'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import Image from 'next/image'
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setErro('Email ou senha incorretos.')
      setCarregando(false)
      return
    }

    // Hard redirect garante que cookies são lidos frescos pelo middleware
    window.location.href = '/app'
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F7F7F7',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 20px',
    }}>

      {/* Logo */}
<div style={{
  width: 80,
  height: 80,
  margin: '0 auto 59px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}}>
  <Image
    src="/logo.png"
    alt="Território de Campo"
    width={400}
    height={300}
    style={{
      objectFit: 'contain'
    }}
  />
</div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 380,
        background: '#FFFFFF',
        border: '0.5px solid #EEEEEE',
        borderRadius: 16,
        padding: '32px 28px',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', margin: '0 0 24px' }}>
          Entrar
        </h2>

        <form onSubmit={(e) => void handleLogin(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#444' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
              style={{
                padding: '13px 14px', fontSize: 16,
                border: '1px solid #DDDDDD', borderRadius: 10,
                background: '#FAFAFA', color: '#1A1A1A',
                outline: 'none', width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#444' }}>Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={{
                padding: '13px 14px', fontSize: 16,
                border: '1px solid #DDDDDD', borderRadius: 10,
                background: '#FAFAFA', color: '#1A1A1A',
                outline: 'none', width: '100%',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {erro && (
            <div style={{
              background: '#FFF0F0', border: '1px solid #E05050',
              borderRadius: 10, padding: '10px 14px',
              color: '#501313', fontSize: 14,
            }}>
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            style={{
              marginTop: 6,
              padding: '15px',
              fontSize: 16, fontWeight: 600,
              background: carregando ? '#AAAAAA' : '#3BAD68',
              color: '#FFFFFF',
              border: 'none', borderRadius: 10,
              cursor: carregando ? 'not-allowed' : 'pointer',
              minHeight: 52,
              transition: 'background 0.2s',
            }}
          >
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>

      <p style={{ marginTop: 24, fontSize: 13, color: '#AAAAAA', textAlign: 'center' }}>
        Acesso por convite. Fale com o administrador.
      </p>
    </div>
  )
}
