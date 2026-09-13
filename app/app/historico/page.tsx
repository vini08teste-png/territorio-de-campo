'use client'
import { useEffect, useState } from 'react'
import { supabase, CORES_STATUS } from '@/lib/supabase'

interface MarcacaoHistorico {
  id: string
  status: string
  criado_em: string
  validado_por: string | null
  quadras: { nome: string } | null
}

interface PontoHistorico {
  id: string
  lat: number
  lng: number
  observacao: string | null
  criado_em: string
  quadras: { nome: string } | null
}

export default function HistoricoPage() {
  const [marcacoes, setMarcacoes] = useState<MarcacaoHistorico[]>([])
  const [pontos, setPontos] = useState<PontoHistorico[]>([])

  useEffect(() => {
    async function carregar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const [{ data: m }, { data: p }] = await Promise.all([
        supabase.from('marcacoes').select('*, quadras(nome)').eq('usuario_id', session.user.id).order('criado_em', { ascending: false }).limit(30),
        supabase.from('pontos_parada').select('*, quadras(nome)').eq('usuario_id', session.user.id).order('criado_em', { ascending: false }).limit(10),
      ])
      setMarcacoes(m || [])
      setPontos(p || [])
    }
    carregar()
  }, [])

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 24 }}>📋 Meu histórico</h1>

      {pontos.length > 0 && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>📍 Meus pontos de parada</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {pontos.map(p => (
              <div key={p.id} className="card" style={{ borderLeft: '4px solid #F0A030' }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{p.quadras?.nome}</div>
                <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
                  📍 {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                </div>
                {p.observacao && <div style={{ fontSize: 14, color: '#888', marginTop: 4 }}>&ldquo;{p.observacao}&rdquo;</div>}
                <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>{new Date(p.criado_em).toLocaleString('pt-BR')}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>📝 Minhas marcações</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {marcacoes.map(m => {
          const cor = CORES_STATUS[m.status as keyof typeof CORES_STATUS]
          return (
            <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{m.quadras?.nome}</div>
                <div style={{ fontSize: 13, color: '#999' }}>{new Date(m.criado_em).toLocaleString('pt-BR')}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: cor?.fill, border: `1.5px solid ${cor?.stroke}`, color: '#333' }}>
                  {cor?.label}
                </span>
                <span style={{ fontSize: 12, color: m.validado_por ? '#3BAD68' : '#F0A030' }}>
                  {m.validado_por ? '✅ Validado' : '⏳ Pendente'}
                </span>
              </div>
            </div>
          )
        })}
        {!marcacoes.length && <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>Nenhuma marcação ainda.</p>}
      </div>
    </div>
  )
}
