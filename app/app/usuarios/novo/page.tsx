'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CORES_PERFIL, type Perfil } from '@/lib/supabase'

export default function NovoUsuarioPage() {
  const router = useRouter()
  const [form, setForm] = useState({ nome: '', email: '', senha: '', perfil: 'dirigente' as Perfil })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')

    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok || data.error) {
        setErro(data.error ?? 'Erro ao criar usuário.')
        return
      }

      router.push('/app/usuarios')
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  const cores = CORES_PERFIL[form.perfil]

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Novo usuário</h1>
        <p style={{ fontSize: 15, color: '#666', marginTop: 4 }}>Preencha os dados do novo acesso</p>
      </div>

      <form onSubmit={(e) => void salvar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <Field label="Nome completo" type="text" value={form.nome} placeholder="Ex: João da Silva" required
          onChange={(v) => setForm((p) => ({ ...p, nome: v }))} />

        <Field label="Email" type="email" value={form.email} placeholder="joao@email.com" required
          onChange={(v) => setForm((p) => ({ ...p, email: v }))} />

        <Field label="Senha inicial" type="password" value={form.senha} placeholder="Mínimo 6 caracteres" required minLength={6}
          onChange={(v) => setForm((p) => ({ ...p, senha: v }))} />

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Perfil</label>
          <select
            value={form.perfil}
            onChange={(e) => setForm((p) => ({ ...p, perfil: e.target.value as Perfil }))}
            style={{
              width: '100%', padding: '12px 14px', fontSize: 15,
              border: '1px solid #DDDDDD', borderRadius: 8,
              background: '#FAFAFA', color: '#1A1A1A', outline: 'none',
            }}
          >
            {Object.entries(CORES_PERFIL).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Preview do perfil */}
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: cores.bg, border: `1.5px solid ${cores.acento}`,
          fontSize: 14, color: cores.texto,
        }}>
          <strong>{cores.label}</strong> — {
            form.perfil === 'dirigente' ? 'vê o mapa e marca progresso nas quadras' :
            form.perfil === 'superintendente_grupo' ? 'gerencia 1 território e valida marcações' :
            form.perfil === 'superintendente_territorio' ? 'cria territórios, analisa e designa SGs' :
            'gerencia usuários e configurações do sistema'
          }.
        </div>

        {erro && (
          <div style={{
            background: '#FFF0F0', border: '1px solid #E05050', borderRadius: 10,
            padding: '12px 14px', color: '#501313', fontSize: 14,
          }}>
            ⚠️ {erro}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              flex: 1, padding: '14px', fontSize: 15, fontWeight: 500,
              background: '#F7F7F7', color: '#555',
              border: '0.5px solid #DDDDDD', borderRadius: 10, cursor: 'pointer',
            }}
          >
            Voltar
          </button>
          <button
            type="submit"
            disabled={salvando}
            style={{
              flex: 2, padding: '14px', fontSize: 15, fontWeight: 600,
              background: salvando ? '#CCCCCC' : '#3BAD68',
              color: '#FFFFFF', border: 'none', borderRadius: 10,
              cursor: salvando ? 'not-allowed' : 'pointer',
            }}
          >
            {salvando ? 'Criando…' : '✅ Criar usuário'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, type, value, onChange, placeholder, required, minLength }: {
  label: string; type: string; value: string
  onChange: (v: string) => void; placeholder?: string
  required?: boolean; minLength?: number
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        required={required} minLength={minLength}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', padding: '12px 14px', fontSize: 15,
          border: '1px solid #DDDDDD', borderRadius: 8,
          background: '#FAFAFA', color: '#1A1A1A',
          outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}
