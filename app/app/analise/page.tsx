'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'
import { calcularPrazoTerritorio } from '@/lib/prazoTerritorio'

// ── Tipos ──────────────────────────────────────────────────────────────────────
type StatusQuadra = 'nao_iniciado' | 'em_andamento' | 'parcial' | 'concluido' | 'pendente'

interface Quadra {
  id: string
  nome: string
  status: StatusQuadra
  territorio_id: string
}

interface Territorio {
  id: string
  nome: string
  numero: number
  bairro: string
  status: string
}

interface TerritorioDados {
  territorio: Territorio
  quadras: Quadra[]
  progresso: number
  concluidas: number
  parciais: number
  pendentes: number
  naoIniciadas: number
  emAndamento: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const PESO: Record<StatusQuadra, number> = {
  concluido: 1, parcial: 0.5,
  nao_iniciado: 0, em_andamento: 0, pendente: 0,
}

function calcularProgresso(quadras: Quadra[]): number {
  if (!quadras.length) return 0
  const soma = quadras.reduce((acc, q) => acc + (PESO[q.status] ?? 0), 0)
  return Math.round((soma / quadras.length) * 100)
}

const COR_PROGRESSO = (p: number) =>
  p === 100 ? '#3BAD68' : p >= 50 ? '#378ADD' : p > 0 ? '#F0C060' : '#CCCCCC'

// ── Componente principal ───────────────────────────────────────────────────────
export default function AnalisePage() {
  const { usuario, carregando: verificandoAcesso, autorizado } = usePaginaRestrita(['superintendente_territorio', 'admin'])
  const [loading, setLoading] = useState(true)
  const [dados, setDados] = useState<TerritorioDados[]>([])
  const [ordenar, setOrdenar] = useState<'numero' | 'progresso' | 'nome'>('numero')
  const [busca, setBusca] = useState('')
  const [territoriosVencidos, setTerritoriosVencidos] = useState(0)

  // Só é chamada depois que o acesso foi verificado (ver useEffect abaixo)
  const carregar = useCallback(async () => {
    const [{ data: territorios }, { data: quadras }, { data: designacoesSG }, { data: config }] = await Promise.all([
      supabase.from('territorios').select('*').order('numero'),
      supabase.from('quadras').select('*'),
      supabase.from('designacoes').select('territorio_id, data_inicio').is('quadra_id', null).is('data_fim', null),
      supabase.from('configuracoes').select('prazo_territorio_dias').eq('id', 1).single(),
    ])

    if (!territorios || !quadras) { setLoading(false); return }

    const prazoDias = config?.prazo_territorio_dias ?? 120
    const vencidos = (designacoesSG ?? []).filter(
      (d) => calcularPrazoTerritorio(d.data_inicio, prazoDias).vencido
    ).length
    setTerritoriosVencidos(vencidos)

    const resultado: TerritorioDados[] = territorios.map((t: Territorio) => {
      const qs = (quadras as Quadra[]).filter((q) => q.territorio_id === t.id)
      return {
        territorio: t,
        quadras: qs,
        progresso: calcularProgresso(qs),
        concluidas: qs.filter((q) => q.status === 'concluido').length,
        parciais: qs.filter((q) => q.status === 'parcial').length,
        pendentes: qs.filter((q) => q.status === 'pendente').length,
        naoIniciadas: qs.filter((q) => q.status === 'nao_iniciado').length,
        emAndamento: qs.filter((q) => q.status === 'em_andamento').length,
      }
    })

    setDados(resultado)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!usuario || !autorizado) return
    // carregar só chama setState depois dos awaits (mesmo padrão de designar/configuracoes)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [usuario, autorizado, carregar])

  // ── Totais globais ────────────────────────────────────────────────────────────
  const totalTerritorios = dados.length
  const totalQuadras = dados.reduce((s, d) => s + d.quadras.length, 0)
  const totalConcluidas = dados.reduce((s, d) => s + d.concluidas, 0)
  const progressoGeral = dados.length
    ? Math.round(dados.reduce((s, d) => s + d.progresso, 0) / dados.length)
    : 0

  // ── Filtro e ordenação ────────────────────────────────────────────────────────
  const dadosFiltrados = dados
    .filter((d) =>
      d.territorio.nome.toLowerCase().includes(busca.toLowerCase()) ||
      d.territorio.bairro.toLowerCase().includes(busca.toLowerCase()) ||
      String(d.territorio.numero).includes(busca)
    )
    .sort((a, b) => {
      if (ordenar === 'progresso') return b.progresso - a.progresso
      if (ordenar === 'nome') return a.territorio.nome.localeCompare(b.territorio.nome)
      return a.territorio.numero - b.territorio.numero
    })

  // ── Exportar JSON ─────────────────────────────────────────────────────────────
  function exportarJSON() {
    const payload = dados.map((d) => ({
      numero: d.territorio.numero,
      nome: d.territorio.nome,
      bairro: d.territorio.bairro,
      progresso_pct: d.progresso,
      quadras_total: d.quadras.length,
      concluidas: d.concluidas,
      parciais: d.parciais,
      pendentes: d.pendentes,
      em_andamento: d.emAndamento,
      nao_iniciadas: d.naoIniciadas,
    }))
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analise_territorios_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (verificandoAcesso) return <Carregando />
  if (!autorizado) return <SemPermissao />
  if (loading) return <Carregando texto="Carregando análise…" />

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Análise geral</h1>
          <p style={{ fontSize: 15, color: '#666', marginTop: 4 }}>Visão consolidada de todos os territórios</p>
        </div>
        <button
          onClick={exportarJSON}
          style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 500,
            background: '#FFFFFF', border: '1px solid #DDDDDD',
            borderRadius: 10, cursor: 'pointer', color: '#1A1A1A',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ⬇️ Exportar JSON
        </button>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: '2rem' }}>
        <MetricCard label="Progresso geral" valor={`${progressoGeral}%`} cor={COR_PROGRESSO(progressoGeral)} />
        <MetricCard label="Territórios" valor={totalTerritorios} />
        <MetricCard label="Quadras totais" valor={totalQuadras} />
        <MetricCard label="Concluídas" valor={totalConcluidas} cor="#3BAD68" />
        <MetricCard label="Territórios vencidos" valor={territoriosVencidos} cor={territoriosVencidos > 0 ? '#E05050' : undefined} />
      </div>

      {/* Gráfico de barras */}
      {dados.length > 0 && (
        <div style={{
          background: '#FFFFFF', border: '0.5px solid #EEEEEE',
          borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem',
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: '1.25rem' }}>
            Progresso por território
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...dados]
              .sort((a, b) => b.progresso - a.progresso)
              .slice(0, 12)
              .map((d) => (
                <div key={d.territorio.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: '#666', minWidth: 22, textAlign: 'right' }}>
                    #{d.territorio.numero}
                  </span>
                  <span style={{ fontSize: 13, color: '#1A1A1A', minWidth: 120, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.territorio.nome}
                  </span>
                  <div style={{ flex: 1, height: 12, background: '#F0F0F0', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${d.progresso}%`,
                      background: COR_PROGRESSO(d.progresso),
                      borderRadius: 6,
                      transition: 'width 0.5s ease',
                      minWidth: d.progresso > 0 ? 4 : 0,
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1A1A', minWidth: 36, textAlign: 'right' }}>
                    {d.progresso}%
                  </span>
                </div>
              ))}
            {dados.length > 12 && (
              <p style={{ fontSize: 12, color: '#999', margin: '4px 0 0', textAlign: 'center' }}>
                Mostrando top 12 — veja a tabela abaixo para todos
              </p>
            )}
          </div>
        </div>
      )}

      {/* Filtros da tabela */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar território…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            flex: 1, minWidth: 180, padding: '10px 14px', fontSize: 15,
            border: '1px solid #DDDDDD', borderRadius: 10, background: '#FAFAFA',
            color: '#1A1A1A', outline: 'none',
          }}
        />
        <select
          value={ordenar}
          onChange={(e) => setOrdenar(e.target.value as typeof ordenar)}
          style={{
            padding: '10px 14px', fontSize: 14, border: '1px solid #DDDDDD',
            borderRadius: 10, background: '#FAFAFA', color: '#1A1A1A',
            cursor: 'pointer',
          }}
        >
          <option value="numero">Ordenar por número</option>
          <option value="progresso">Ordenar por progresso</option>
          <option value="nome">Ordenar por nome</option>
        </select>
      </div>

      {/* Tabela de territórios */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dadosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#999', fontSize: 15 }}>
            Nenhum território encontrado.
          </div>
        ) : (
          dadosFiltrados.map((d) => (
            <TerritorioCarta key={d.territorio.id} dados={d} />
          ))
        )}
      </div>
    </div>
  )
}

// ── Card de métrica ────────────────────────────────────────────────────────────
function MetricCard({ label, valor, cor }: { label: string; valor: string | number; cor?: string }) {
  return (
    <div style={{
      background: '#F7F7F7', borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: cor ?? '#1A1A1A' }}>{valor}</div>
    </div>
  )
}

// ── Card de território na tabela ───────────────────────────────────────────────
function TerritorioCarta({ dados: d }: { dados: TerritorioDados }) {
  const [expandido, setExpandido] = useState(false)
  const cor = COR_PROGRESSO(d.progresso)

  return (
    <div style={{
      background: '#FFFFFF', border: '0.5px solid #EEEEEE',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Linha principal */}
      <button
        onClick={() => setExpandido((v) => !v)}
        style={{
          width: '100%', padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        {/* Número */}
        <span style={{
          fontSize: 13, fontWeight: 700, color: '#666',
          minWidth: 28, textAlign: 'center',
        }}>
          #{d.territorio.numero}
        </span>

        {/* Nome + bairro */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.territorio.nome}
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>{d.territorio.bairro}</div>
        </div>

        {/* Barra mini */}
        <div style={{ width: 80, height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ height: '100%', width: `${d.progresso}%`, background: cor, borderRadius: 3 }} />
        </div>

        {/* % */}
        <span style={{ fontSize: 14, fontWeight: 700, color: cor, minWidth: 38, textAlign: 'right', flexShrink: 0 }}>
          {d.progresso}%
        </span>

        <span style={{ fontSize: 12, color: '#BBBBBB', flexShrink: 0 }}>{expandido ? '▲' : '▼'}</span>
      </button>

      {/* Detalhe expandido */}
      {expandido && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #F0F0F0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginTop: 12 }}>
            <MiniStat label="Total" valor={d.quadras.length} />
            <MiniStat label="Concluídas" valor={d.concluidas} cor="#3BAD68" />
            <MiniStat label="Parciais" valor={d.parciais} cor="#F0C060" />
            <MiniStat label="Em andamento" valor={d.emAndamento} cor="#378ADD" />
            <MiniStat label="Pendentes" valor={d.pendentes} cor="#E05050" />
            <MiniStat label="Não iniciadas" valor={d.naoIniciadas} cor="#AAAAAA" />
          </div>

          {/* Lista de quadras */}
          {d.quadras.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 12, color: '#888', marginBottom: 8, fontWeight: 500 }}>Quadras</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {d.quadras.map((q) => {
                  const cores: Record<StatusQuadra, string> = {
                    concluido: '#3BAD68', parcial: '#F0C060',
                    em_andamento: '#378ADD', pendente: '#E05050', nao_iniciado: '#CCCCCC',
                  }
                  return (
                    <span
                      key={q.id}
                      title={q.nome}
                      style={{
                        fontSize: 12, padding: '3px 10px', borderRadius: 20,
                        background: cores[q.status] + '22',
                        border: `1px solid ${cores[q.status]}55`,
                        color: '#333',
                      }}
                    >
                      {q.nome}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, valor, cor }: { label: string; valor: number; cor?: string }) {
  return (
    <div style={{ background: '#F7F7F7', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: cor ?? '#1A1A1A' }}>{valor}</div>
    </div>
  )
}
