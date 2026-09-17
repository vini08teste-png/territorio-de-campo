'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { verificarCodigoLogin } from '@/lib/mfa'

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

const MENSAGEM_DESATIVADO = 'Seu acesso foi desativado. Fale com o administrador.'

function LoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  // Quem foi deslogado por estar desativado chega com ?desativado=1
  const [erro, setErro] = useState(() => {
    if (searchParams.get('desativado') === '1') return MENSAGEM_DESATIVADO
    return ''
  })
  const [carregando, setCarregando] = useState(false)
  // Contas com verificação em 2 etapas passam por um segundo passo: o código
  // de 6 dígitos do app autenticador.
  const [pedindoCodigo, setPedindoCodigo] = useState(false)
  const [codigo, setCodigo] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      setErro('Email ou senha incorretos.')
      setCarregando(false)
      return
    }

    const { data: usuario } = await supabase.from('usuarios').select('ativo').eq('id', data.user.id).single()

    if (!usuario?.ativo) {
      await supabase.auth.signOut()
      setErro(MENSAGEM_DESATIVADO)
      setCarregando(false)
      return
    }

    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (nivel?.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') {
      setSenha('')
      setPedindoCodigo(true)
      setCarregando(false)
      return
    }

    // Hard redirect garante que cookies são lidos frescos pelo middleware
    window.location.href = '/app'
  }

  async function handleCodigo(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      await verificarCodigoLogin(codigo)
      window.location.href = '/app'
    } catch {
      setErro('Código inválido ou expirado. Tente o código atual do app autenticador.')
      setCodigo('')
      setCarregando(false)
    }
  }

  async function cancelarCodigo() {
    await supabase.auth.signOut()
    setPedindoCodigo(false)
    setCodigo('')
    setSenha('')
    setErro('')
  }

  return (
    <div style={{
      minHeight: '100dvh',
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
          {pedindoCodigo ? 'Verificação em 2 etapas' : 'Entrar'}
        </h2>

        {pedindoCodigo ? (
          <form onSubmit={(e) => void handleCodigo(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
              Digite o código de 6 dígitos do seu app autenticador.
            </p>

            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              style={{
                padding: '13px 14px', fontSize: 24, fontWeight: 700,
                letterSpacing: 8, textAlign: 'center',
                border: '1px solid #DDDDDD', borderRadius: 10,
                background: '#FAFAFA', color: '#1A1A1A',
                outline: 'none', width: '100%',
                boxSizing: 'border-box',
              }}
            />

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
              disabled={carregando || codigo.length < 6}
              style={{
                marginTop: 6, padding: '15px',
                fontSize: 16, fontWeight: 600,
                background: carregando || codigo.length < 6 ? '#AAAAAA' : '#3BAD68',
                color: '#FFFFFF', border: 'none', borderRadius: 10,
                cursor: carregando ? 'not-allowed' : 'pointer',
                minHeight: 52, transition: 'background 0.2s',
              }}
            >
              {carregando ? 'Verificando…' : 'Confirmar'}
            </button>

            <button
              type="button"
              onClick={() => void cancelarCodigo()}
              style={{
                background: 'none', border: 'none', color: '#888',
                fontSize: 14, cursor: 'pointer', padding: 4,
              }}
            >
              Entrar com outra conta
            </button>
          </form>
        ) : (
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
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 13, color: '#AAAAAA', textAlign: 'center' }}>
        Acesso por convite. Fale com o administrador.
      </p>
    </div>
  )
}
