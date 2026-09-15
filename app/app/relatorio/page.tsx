'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getUsuarioAtual } from '@/lib/auth'

// ── Tipos ──────────────────────────────────────────────────────────────────────
type StatusQuadra = 'nao_iniciado' | 'em_andamento' | 'parcial' | 'concluido' | 'pendente'

interface Quadra {
  id: string
  nome: string
  status: StatusQuadra
}

interface Territorio {
  id: string
  nome: string
  numero: number
  bairro: string
}

interface Marcacao {
  id: string
  quadra_id: string
  lado_id: string | null
  usuario_id: string
  status: StatusQuadra
  observacao: string | null
  criado_em: string
  usuario?: { nome: string }
  quadra?: { nome: string }
}

interface PontoParada {
  id: string
  quadra_id: string
  lat: number
  lng: number
  endereco: string
  observacao: string
  criado_em: string
  usuario?: { nome: string }
  quadra?: { nome: string }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const PESO: Record<StatusQuadra, number> = {
  concluido: 1, parcial: 0.5,
  nao_iniciado: 0, em_andamento: 0, pendente: 0,
}

const CORES: Record<StatusQuadra, { fill: string; stroke: string; label: string }> = {
  nao_iniciado: { fill: '#F0F0F0', stroke: '#CCCCCC', label: 'Não iniciado' },
  em_andamento: { fill: '#DDEEFF', stroke: '#378ADD', label: 'Em andamento' },
  parcial:      { fill: '#FFF3CC', stroke: '#F0C060', label: 'Parcial' },
  concluido:    { fill: '#DFFAEB', stroke: '#3BAD68', label: 'Concluído' },
  pendente:     { fill: '#FFE5E5', stroke: '#E05050', label: 'Pendente' },
}

function calcularProgresso(quadras: Quadra[]): number {
  if (!quadras.length) return 0
  const soma = quadras.reduce((acc, q) => acc + (PESO[q.status] ?? 0), 0)
  return Math.round((soma / quadras.length) * 100)
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function RelatorioPage() {
  const [loading, setLoading] = useState(true)
  const [territorio, setTerritorio] = useState<Territorio | null>(null)
  const [quadras, setQuadras] = useState<Quadra[]>([])
  const [marcacoes, setMarcacoes] = useState<Marcacao[]>([])
  const [pontos, setPontos] = useState<PontoParada[]>([])
  const [aba, setAba] = useState<'quadras' | 'atividade' | 'pontos'>('quadras')

  const carregar = useCallback(async () => {
    setLoading(true)
    const atual = await getUsuarioAtual()
    if (!atual) { setLoading(false); return }

    // Buscar território designado ao SG
    const { data: desig } = await supabase
      .from('designacoes')
      .select('territorio_id')
      .eq('usuario_id', atual.id)
      .is('quadra_id', null)
      .is('data_fim', null)
      .single()

    if (!desig?.territorio_id) { setLoading(false); return }

    const { data: terr } = await supabase
      .from('territorios').select('*').eq('id', desig.territorio_id).single()
    setTerritorio(terr)

    const { data: qs } = await supabase
      .from('quadras').select('*').eq('territorio_id', desig.territorio_id).order('nome')
    setQuadras(qs ?? [])

    const quadraIds = (qs ?? []).map((q: Quadra) => q.id)

    if (quadraIds.length) {
      // Marcações com join em usuario e quadra
      const { data: mrc } = await supabase
        .from('marcacoes')
        .select('*, usuario:usuario_id(nome), quadra:quadra_id(nome)')
        .in('quadra_id', quadraIds)
        .order('criado_em', { ascending: false })
        .limit(50)
      setMarcacoes((mrc as Marcacao[]) ?? [])

      // Pontos de parada
      const { data: pts } = await supabase
        .from('pontos_parada')
        .select('*, usuario:usuario_id(nome), quadra:quadra_id(nome)')
        .in('quadra_id', quadraIds)
        .order('criado_em', { ascending: false })
      setPontos((pts as PontoParada[]) ?? [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const progresso = calcularProgresso(quadras)
  const concluidas = quadras.filter((q) => q.status === 'concluido').length
  const emAndamento = quadras.filter((q) => q.status === 'em_andamento').length
  const parciais = quadras.filter((q) => q.status === 'parcial').length
  const pendentes = quadras.filter((q) => q.status === 'pendente').length
  const naoIniciadas = quadras.filter((q) => q.status === 'nao_iniciado').length

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <p style={{ color: '#666', fontSize: 16 }}>Carregando relatório…</p>
      </div>
    )
  }

  if (!territorio) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <p style={{ fontSize: 17, color: '#666' }}>Você não está designado a nenhum território.</p>
      </div>
    )
  }

  const corProgresso = progresso === 100 ? '#3BAD68' : progresso >= 50 ? '#378ADD' : progresso > 0 ? '#F0C060' : '#CCCCCC'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 2px', fontWeight: 500 }}>
          Território #{territorio.numero} — {territorio.bairro}
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>
          {territorio.nome}
        </h1>
      </div>

      {/* Progresso hero */}
      <div style={{
        background: '#FFFFFF', border: '0.5px solid #EEEEEE',
        borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 48, fontWeight: 700, color: corProgresso, lineHeight: 1 }}>
            {progresso}%
          </span>
          <span style={{ fontSize: 15, color: '#666', paddingBottom: 6 }}>concluído</span>
        </div>
        <div style={{ height: 10, background: '#F0F0F0', borderRadius: 5, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{
            height: '100%', width: `${progresso}%`, background: corProgresso,
            borderRadius: 5, transition: 'width 0.6s ease',
          }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 }}>
          <MiniStat label="Concluídas" valor={concluidas} cor="#3BAD68" />
          <MiniStat label="Parciais" valor={parciais} cor="#F0C060" />
          <MiniStat label="Andamento" valor={emAndamento} cor="#378ADD" />
          <MiniStat label="Pendentes" valor={pendentes} cor="#E05050" />
          <MiniStat label="Não inic." valor={naoIniciadas} cor="#CCCCCC" />
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', background: '#F7F7F7', borderRadius: 10, padding: 4 }}>
        {([
          { key: 'quadras', label: `Quadras (${quadras.length})` },
          { key: 'atividade', label: `Atividade (${marcacoes.length})` },
          { key: 'pontos', label: `Paradas (${pontos.length})` },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setAba(tab.key)}
            style={{
              flex: 1, padding: '10px 4px', fontSize: 14, fontWeight: aba === tab.key ? 600 : 400,
              background: aba === tab.key ? '#FFFFFF' : 'transparent',
              border: aba === tab.key ? '0.5px solid #EEEEEE' : 'none',
              borderRadius: 8, cursor: 'pointer',
              color: aba === tab.key ? '#1A1A1A' : '#888',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Aba Quadras */}
      {aba === 'quadras' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {quadras.length === 0 ? (
            <Empty texto="Nenhuma quadra neste território." />
          ) : (
            quadras.map((q) => {
              const c = CORES[q.status] ?? CORES.nao_iniciado
              return (
                <div key={q.id} style={{
                  background: '#FFFFFF', border: '0.5px solid #EEEEEE',
                  borderRadius: 10, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A' }}>{q.nome}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
                      background: c.fill, color: '#333', border: `1px solid ${c.stroke}55`,
                    }}>
                      {c.label}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Aba Atividade */}
      {aba === 'atividade' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {marcacoes.length === 0 ? (
            <Empty texto="Nenhuma atividade registrada ainda." />
          ) : (
            marcacoes.map((m) => {
              const c = CORES[m.status] ?? CORES.nao_iniciado
              return (
                <div key={m.id} style={{
                  background: '#FFFFFF', border: '0.5px solid #EEEEEE',
                  borderRadius: 10, padding: '12px 16px',
                  borderLeft: `3px solid ${c.stroke}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>
                      {(m.quadra as { nome?: string })?.nome ?? '—'}
                    </span>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 20,
                      background: c.fill, border: `1px solid ${c.stroke}55`, color: '#333',
                    }}>
                      {c.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                    {(m.usuario as { nome?: string })?.nome ?? '—'} · {formatarData(m.criado_em)}
                  </div>
                  {m.observacao && (
                    <div style={{ fontSize: 13, color: '#888', marginTop: 4, fontStyle: 'italic' }}>
                      &ldquo;{m.observacao}&rdquo;
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Aba Pontos de parada */}
      {aba === 'pontos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pontos.length === 0 ? (
            <Empty texto="Nenhum ponto de parada marcado." />
          ) : (
            pontos.map((p) => (
              <div key={p.id} style={{
                background: '#FFFFFF', border: '0.5px solid #EEEEEE',
                borderRadius: 10, padding: '12px 16px',
                display: 'flex', gap: 12,
              }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>📍</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>
                    {(p.quadra as { nome?: string })?.nome ?? '—'}
                  </div>
                  {p.endereco && (
                    <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{p.endereco}</div>
                  )}
                  {p.observacao && (
                    <div style={{ fontSize: 13, color: '#888', marginTop: 2, fontStyle: 'italic' }}>
                      &ldquo;{p.observacao}&rdquo;
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#AAAAAA', marginTop: 4 }}>
                    {(p.usuario as { nome?: string })?.nome ?? '—'} · {formatarData(p.criado_em)}
                  </div>
                  <a
                    href={`https://maps.google.com/?q=${p.lat},${p.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, color: '#378ADD', marginTop: 4, display: 'inline-block' }}
                  >
                    Ver no Maps ↗
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div style={{ background: '#F7F7F7', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: cor }}>{valor}</div>
    </div>
  )
}

function Empty({ texto }: { texto: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '2rem', background: '#F7F7F7',
      borderRadius: 12, border: '1px dashed #DDDDDD', color: '#999', fontSize: 15,
    }}>
      {texto}
    </div>
  )
}
