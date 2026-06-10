'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface Config {
  nome_congregacao: string
  cidade: string
  lat: number
  lng: number
  superintendente_id: string
}

interface ST {
  id: string
  nome: string
  email: string
}

const DEFAULTS: Config = {
  nome_congregacao: '',
  cidade: '',
  lat: -6.52,
  lng: -49.85,
  superintendente_id: '',
}

export default function ConfiguracoesPage() {
  const [config, setConfig] = useState<Config>(DEFAULTS)
  const [sts, setSTs] = useState<ST[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [autorizado, setAutorizado] = useState(false)

  const carregar = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: u } = await supabase
      .from('usuarios').select('perfil').eq('id', user.id).single()
    if (u?.perfil !== 'admin') { setLoading(false); return }
    setAutorizado(true)

    const { data } = await supabase
      .from('configuracoes').select('*').eq('id', 1).single()
    if (data) {
      setConfig({
        nome_congregacao: data.nome_congregacao ?? '',
        cidade: data.cidade ?? '',
        lat: data.lat ?? -6.52,
        lng: data.lng ?? -49.85,
        superintendente_id: data.superintendente_id ?? '',
      })
    }

    const { data: stData } = await supabase
      .from('usuarios')
      .select('id, nome, email')
      .eq('perfil', 'superintendente_territorio')
      .eq('ativo', true)
      .order('nome')
    setSTs(stData ?? [])

    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  async function buscarCoordenadas() {
    if (!config.cidade) return
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(config.cidade)}&format=json&limit=1`
      )
      const data = await res.json() as { lat: string; lon: string }[]
      if (data?.[0]) {
        setConfig((c) => ({ ...c, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }))
      }
    } catch { /* ignora */ }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase.from('configuracoes').upsert({
      id: 1,
      nome_congregacao: config.nome_congregacao,
      cidade: config.cidade,
      lat: config.lat,
      lng: config.lng,
      superintendente_id: config.superintendente_id || null,
    }, { onConflict: 'id' })
    setSalvando(false)
    if (!error) {
        alert('Erro ao salvar: ' + error.message)
  return
  // setSucesso(true)
  //     setTimeout(() => setSucesso(false), 3000)
  //   }
    }setSucesso(true)
setTimeout(() => setSucesso(false), 3000)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
      <p style={{ color: '#666', fontSize: 16 }}>Carregando…</p>
    </div>
  )

  if (!autorizado) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#666', fontSize: 17 }}>
      Você não tem permissão para acessar esta página.
    </div>
  )

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Configurações</h1>
        <p style={{ fontSize: 15, color: '#666', marginTop: 4 }}>Dados gerais do sistema</p>
      </div>

      {sucesso && (
        <div style={{
          background: '#EAF7EF', border: '1px solid #60C898', borderRadius: 10,
          padding: '12px 16px', marginBottom: '1.5rem', color: '#04342C', fontSize: 15,
        }}>
          ✅ Configurações salvas com sucesso!
        </div>
      )}

      <form onSubmit={(e) => void salvar(e)}>

        {/* Congregação */}
        <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: '1rem' }}>
            Congregação
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field
              label="Nome da congregação"
              value={config.nome_congregacao}
              onChange={(v) => setConfig((c) => ({ ...c, nome_congregacao: v }))}
              placeholder="ex: Congregação Central"
            />
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>
                Cidade
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={config.cidade}
                  onChange={(e) => setConfig((c) => ({ ...c, cidade: e.target.value }))}
                  placeholder="ex: Canaã dos Carajás"
                  style={{
                    flex: 1, padding: '12px 14px', fontSize: 15,
                    border: '1px solid #DDDDDD', borderRadius: 8,
                    background: '#FAFAFA', color: '#1A1A1A',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => void buscarCoordenadas()}
                  style={{
                    padding: '12px 14px', fontSize: 14, fontWeight: 500,
                    background: '#F7F7F7', color: '#444',
                    border: '1px solid #DDDDDD', borderRadius: 8,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  📍 Buscar
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#AAAAAA', marginTop: 4 }}>
                Clique em Buscar para preencher as coordenadas automaticamente.
              </p>
            </div>
          </div>
        </div>

        {/* Centro do mapa */}
        <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: 4 }}>
            Centro do mapa
          </h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>
            O mapa abre nessas coordenadas por padrão.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Latitude</label>
              <input
                type="number" step="any" value={config.lat}
                onChange={(e) => setConfig((c) => ({ ...c, lat: parseFloat(e.target.value) }))}
                style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>Longitude</label>
              <input
                type="number" step="any" value={config.lng}
                onChange={(e) => setConfig((c) => ({ ...c, lng: parseFloat(e.target.value) }))}
                style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>

        {/* Sup. de Território */}
        <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: 4 }}>
            Sup. de Território responsável
          </h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>
            Responsável principal pela gestão dos territórios.
          </p>
          {sts.length === 0 ? (
            <p style={{ color: '#AAAAAA', fontSize: 14 }}>Nenhum Sup. de Território ativo cadastrado.</p>
          ) : (
            <select
              value={config.superintendente_id}
              onChange={(e) => setConfig((c) => ({ ...c, superintendente_id: e.target.value }))}
              style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A', outline: 'none' }}
            >
              <option value="">— Selecione —</option>
              {sts.map((st) => (
                <option key={st.id} value={st.id}>{st.nome} · {st.email}</option>
              ))}
            </select>
          )}
        </div>

        <button
          type="submit"
          disabled={salvando}
          style={{
            width: '100%', padding: '16px', fontSize: 16, fontWeight: 600,
            background: salvando ? '#CCCCCC' : '#7B6FD0',
            color: '#FFFFFF', border: 'none', borderRadius: 10,
            cursor: salvando ? 'not-allowed' : 'pointer', minHeight: 56,
          }}
        >
          {salvando ? 'Salvando…' : '💾 Salvar configurações'}
        </button>
      </form>

      {/* Info do sistema */}
      <div style={{ marginTop: '2.5rem', background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: 4 }}>
          Informações do sistema
        </h2>
        <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>Versão e dados técnicos</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InfoRow label="Versão" valor="1.0.0" />
          <InfoRow label="Banco" valor="Supabase PostgreSQL" />
          <InfoRow label="Hospedagem" valor="Vercel" />
          <InfoRow label="Ambiente" valor={process.env.NODE_ENV ?? '—'} />
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>{label}</label>
      <input
        type="text" value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A', outline: 'none', boxSizing: 'border-box' }}
      />
    </div>
  )
}

function InfoRow({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderBottom: '0.5px solid #F5F5F5' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: '#1A1A1A', fontWeight: 500 }}>{valor}</span>
    </div>
  )
}
