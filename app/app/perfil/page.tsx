'use client'
import { useEffect, useState } from 'react'
import { supabase, CORES_PERFIL, type Usuario } from '@/lib/supabase'

export default function PerfilPage() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmaSenha, setConfirmaSenha] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data } = await supabase.from('usuarios').select('*').eq('id', session.user.id).single()
      setUsuario(data)
    })
  }, [])

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault()
    if (novaSenha !== confirmaSenha) { setMsg('⚠️ As senhas não coincidem'); return }
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) setMsg('⚠️ ' + error.message)
    else { setMsg('✅ Senha alterada com sucesso!'); setNovaSenha(''); setConfirmaSenha('') }
    setTimeout(() => setMsg(''), 3000)
  }

  if (!usuario) return <p style={{ padding: 24, color: '#888' }}>Carregando...</p>

  const cores = CORES_PERFIL[usuario.perfil]

  return (
    <div style={{ padding: 24, maxWidth: 500, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 24 }}>👤 Meu perfil</h1>

      <div className="card" style={{ marginBottom: 24, background: cores.bg, border: `2px solid ${cores.acento}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32,
            background: cores.acento, color: cores.texto,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 26,
          }}>
            {usuario.nome.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: cores.texto }}>{usuario.nome}</div>
            <div style={{ fontSize: 15, color: '#666' }}>{usuario.email}</div>
            <span className="tag-perfil" style={{ background: cores.acento, color: cores.texto, marginTop: 4, display: 'inline-block' }}>
              {cores.label}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>🔒 Trocar senha</h2>
        <form onSubmit={trocarSenha} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label>Nova senha</label>
            <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} required />
          </div>
          <div>
            <label>Confirmar nova senha</label>
            <input type="password" value={confirmaSenha} onChange={e => setConfirmaSenha(e.target.value)} placeholder="Repita a senha" required />
          </div>
          {msg && (
            <div style={{ padding: '12px 16px', borderRadius: 10, fontSize: 16, fontWeight: 700, background: msg.includes('✅') ? '#B8EAC8' : '#FFB3B3', color: msg.includes('✅') ? '#04342C' : '#501313' }}>
              {msg}
            </div>
          )}
          <button type="submit" className="btn-grande btn-azul">🔒 Salvar nova senha</button>
        </form>
      </div>
    </div>
  )
}
