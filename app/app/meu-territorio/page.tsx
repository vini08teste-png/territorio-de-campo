'use client'
import { useEffect, useState } from 'react'
import { supabase, CORES_STATUS, type Quadra, type Territorio } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'

const CHAVE_ULTIMO_TERRITORIO = 'territorio_de_campo:ultimo_territorio_id'

interface UltimaAtividade {
  quadra_id: string
  criado_em: string
}

interface Observacao {
  id: string
  quadra_id: string
  observacao: string
  criado_em: string
  quadraNome: string
}

export default function MeuTerritorioPage() {
  const { usuario, carregando: verificandoAcesso, autorizado } = usePaginaRestrita([
    'dirigente', 'superintendente_grupo', 'superintendente_territorio', 'admin',
  ])
  const [territorios, setTerritorios] = useState<Territorio[]>([])
  const [territorioId, setTerritorioId] = useState('')
  const [quadras, setQuadras] = useState<Quadra[]>([])
  const [ultimasAtividades, setUltimasAtividades] = useState<UltimaAtividade[]>([])
  const [observacoes, setObservacoes] = useState<Observacao[]>([])
  const [carregandoDados, setCarregandoDados] = useState(true)

  // Territórios onde o usuário tem (ou teve) quadra designada
  useEffect(() => {
    if (!usuario) return
    supabase.from('designacoes')
      .select('territorio_id, territorio:territorio_id(id, nome, numero, bairro, status, geojson, criado_por, criado_em)')
      .eq('usuario_id', usuario.id)
      .not('quadra_id', 'is', null)
      .then(({ data }) => {
        const vistos = new Set<string>()
        const lista: Territorio[] = []
        for (const d of (data ?? []) as unknown as { territorio: Territorio | null }[]) {
          if (d.territorio && !vistos.has(d.territorio.id)) {
            vistos.add(d.territorio.id)
            lista.push(d.territorio)
          }
        }
        lista.sort((a, b) => Number(a.numero) - Number(b.numero))
        setTerritorios(lista)

        const salvo = localStorage.getItem(CHAVE_ULTIMO_TERRITORIO)
        const valido = salvo && lista.some((t) => t.id === salvo)
        setTerritorioId(valido ? salvo! : (lista[0]?.id ?? ''))
      })
  }, [usuario])

  useEffect(() => {
    if (!territorioId) return
    localStorage.setItem(CHAVE_ULTIMO_TERRITORIO, territorioId)

    supabase.from('quadras').select('*').eq('territorio_id', territorioId).then(({ data: qs }) => {
      const quadrasIds = (qs ?? []).map((q) => q.id)
      setQuadras(qs ?? [])

      if (quadrasIds.length === 0) {
        setUltimasAtividades([])
        setObservacoes([])
        setCarregandoDados(false)
        return
      }

      Promise.all([
        supabase.from('marcacoes').select('quadra_id, criado_em').in('quadra_id', quadrasIds).order('criado_em', { ascending: false }),
        supabase.from('pontos_parada').select('id, quadra_id, observacao, criado_em, quadras(nome)').in('quadra_id', quadrasIds).not('observacao', 'is', null).order('criado_em', { ascending: false }).limit(20),
      ]).then(([{ data: marcacoes }, { data: pontos }]) => {
        const ultimaPorQuadra = new Map<string, string>()
        for (const m of marcacoes ?? []) {
          if (!ultimaPorQuadra.has(m.quadra_id)) ultimaPorQuadra.set(m.quadra_id, m.criado_em)
        }
        setUltimasAtividades(Array.from(ultimaPorQuadra, ([quadra_id, criado_em]) => ({ quadra_id, criado_em })))

        type PontoComQuadra = { id: string; quadra_id: string; observacao: string | null; criado_em: string; quadras: { nome: string } | null }
        setObservacoes(
          ((pontos ?? []) as unknown as PontoComQuadra[])
            .filter((p) => p.observacao?.trim())
            .map((p) => ({
              id: p.id, quadra_id: p.quadra_id, observacao: p.observacao ?? '',
              criado_em: p.criado_em, quadraNome: p.quadras?.nome ?? '',
            }))
        )
        setCarregandoDados(false)
      })
    })
  }, [territorioId])

  if (verificandoAcesso) return <Carregando />
  if (!autorizado) return <SemPermissao />

  const territorioAtivo = territorios.find((t) => t.id === territorioId)
  const concluidas = quadras.filter((q) => q.status === 'concluido').length
  const pct = quadras.length ? Math.round((concluidas / quadras.length) * 100) : 0

  return (
    <div style={{ padding: '1.5rem 1rem 4rem', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: '0 0 16px' }}>Meu território</h1>

      {territorios.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>
          Você ainda não tem nenhuma quadra designada em nenhum território.
        </p>
      ) : (
        <>
          {/* Seletor de território */}
          <select
            value={territorioId}
            onChange={(e) => { setCarregandoDados(true); setTerritorioId(e.target.value) }}
            style={{
              width: '100%', padding: '12px 14px', fontSize: 16, fontWeight: 600,
              border: '1px solid #DDD', borderRadius: 10, background: '#FAFAFA',
              color: '#1A1A1A', outline: 'none', marginBottom: 20,
            }}
          >
            {territorios.map((t) => (
              <option key={t.id} value={t.id}>#{t.numero} — {t.nome}</option>
            ))}
          </select>

          {carregandoDados ? (
            <Carregando texto="Carregando território…" />
          ) : (
            <>
              {/* Resumo */}
              <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: 20 }}>
                <div style={{ fontSize: 15, color: '#666', marginBottom: 4 }}>{territorioAtivo?.bairro}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, color: pct === 100 ? '#3BAD68' : '#1A1A1A' }}>{pct}%</span>
                  <span style={{ fontSize: 14, color: '#888' }}>concluído</span>
                </div>
                <div style={{ height: 8, background: '#EEEEEE', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#3BAD68' : '#378ADD', borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#666' }}>{quadras.length} quadra{quadras.length !== 1 ? 's' : ''} no total</span>
                  {Object.entries(CORES_STATUS).map(([k, v]) => {
                    const qtd = quadras.filter((q) => q.status === k).length
                    if (!qtd) return null
                    return (
                      <span key={k} style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: v.fill, border: `1px solid ${v.stroke}` }}>
                        {qtd} {v.label}
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Lista de quadras com última atividade */}
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A', margin: '0 0 10px' }}>Quadras</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                {quadras.length === 0 && <p style={{ color: '#999', fontSize: 14 }}>Nenhuma quadra cadastrada neste território.</p>}
                {quadras.map((q) => {
                  const c = CORES_STATUS[q.status] ?? CORES_STATUS['nao_iniciado']
                  const ultima = ultimasAtividades.find((u) => u.quadra_id === q.id)
                  return (
                    <div key={q.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: '#FFF', border: '0.5px solid #EEEEEE', borderRadius: 10, padding: '10px 14px',
                    }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.stroke, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>{q.nome}</span>
                      <span style={{ fontSize: 11, color: '#888' }}>{c.label}</span>
                      {ultima && (
                        <span style={{ fontSize: 11, color: '#AAA' }}>
                          {new Date(ultima.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Observações */}
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A', margin: '0 0 10px' }}>Observações recentes</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {observacoes.length === 0 && <p style={{ color: '#999', fontSize: 14 }}>Nenhuma observação registrada.</p>}
                {observacoes.map((o) => (
                  <div key={o.id} style={{ background: '#FAFAFA', border: '0.5px solid #EEEEEE', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{o.quadraNome}</div>
                    <div style={{ fontSize: 13, color: '#555', fontStyle: 'italic', marginTop: 2 }}>&ldquo;{o.observacao}&rdquo;</div>
                    <div style={{ fontSize: 11, color: '#AAA', marginTop: 4 }}>
                      {new Date(o.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
