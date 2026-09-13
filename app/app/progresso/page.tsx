'use client'
import { useEffect, useState } from 'react'
import { supabase, CORES_STATUS, type Quadra, type Territorio } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'

export default function ProgressoPage() {
  const { usuario, carregando: verificandoAcesso, autorizado } = usePaginaRestrita([
    'superintendente_grupo', 'superintendente_territorio', 'admin',
  ])
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [quadras, setQuadras] = useState<Quadra[]>([])

  useEffect(() => {
    if (!usuario || !autorizado) return

    async function carregar() {
      // Sup. de Grupo só vê o progresso dos territórios em que está designado
      if (usuario!.perfil === 'superintendente_grupo') {
        const { data: designacoes } = await supabase
          .from('designacoes')
          .select('territorio_id')
          .eq('usuario_id', usuario!.id)
          .is('quadra_id', null)
          .is('data_fim', null)

        const territorioIds = (designacoes ?? []).map((d) => d.territorio_id).filter(Boolean)
        if (territorioIds.length === 0) { setTerritorios([]); setQuadras([]); return }

        const [t, q] = await Promise.all([
          supabase.from('territorios').select('*').in('id', territorioIds),
          supabase.from('quadras').select('*').in('territorio_id', territorioIds),
        ])
        setTerritorios(t.data || [])
        setQuadras(q.data || [])
        return
      }

      const [t, q] = await Promise.all([
        supabase.from('territorios').select('*'),
        supabase.from('quadras').select('*'),
      ])
      setTerritorios(t.data || [])
      setQuadras(q.data || [])
    }

    void carregar()
  }, [usuario, autorizado])

  function calcularProgresso(territorioId: string) {
    const qs = quadras.filter(q => q.territorio_id === territorioId)
    if (!qs.length) return { total: 0, concluidas: 0, pct: 0 }
    const pesos = { concluido: 1, parcial: 0.5, em_andamento: 0.25, nao_iniciado: 0, pendente: 0 }
    const soma = qs.reduce((acc, q) => acc + (pesos[q.status as keyof typeof pesos] || 0), 0)
    return { total: qs.length, concluidas: qs.filter(q => q.status === 'concluido').length, pct: Math.round((soma / qs.length) * 100) }
  }

  if (verificandoAcesso) return <Carregando />
  if (!autorizado) return <SemPermissao />

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 24 }}>📊 Progresso dos territórios</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {territorios.map(t => {
          const prog = calcularProgresso(t.id)
          const qs = quadras.filter(q => q.territorio_id === t.id)
          return (
            <div key={t.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>📍 {t.nome}</div>
                  <div style={{ fontSize: 15, color: '#666' }}>{t.bairro} — Nº {t.numero}</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: prog.pct >= 100 ? '#3BAD68' : prog.pct > 50 ? '#F0A030' : '#E05050' }}>
                  {prog.pct}%
                </div>
              </div>
              <div className="barra-progresso" style={{ marginBottom: 12 }}>
                <div className="barra-progresso-inner" style={{ width: `${prog.pct}%`, background: prog.pct >= 100 ? '#3BAD68' : prog.pct > 50 ? '#F0A030' : '#E05050' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.entries(CORES_STATUS).map(([k, v]) => {
                  const qtd = qs.filter(q => q.status === k).length
                  if (!qtd) return null
                  return (
                    <span key={k} style={{ padding: '4px 10px', borderRadius: 8, fontSize: 14, fontWeight: 700, background: v.fill, border: `1.5px solid ${v.stroke}`, color: '#333' }}>
                      {qtd} {v.label}
                    </span>
                  )
                })}
                {!qs.length && <span style={{ color: '#888', fontSize: 15 }}>Nenhuma quadra cadastrada</span>}
              </div>
            </div>
          )
        })}
        {!territorios.length && <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>Nenhum território encontrado.</p>}
      </div>
    </div>
  )
}
