'use client'
import { useEffect, useState } from 'react'
import { supabase, CORES_STATUS } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'

interface MarcacaoPendente {
  id: string
  status: string
  observacao: string | null
  criado_em: string
  quadras: {
    nome: string
    territorio_id: string
    territorios: { nome: string; numero: string } | null
  } | null
  usuarios: { nome: string } | null
}

export default function ValidarPage() {
  const { usuario, carregando: verificandoAcesso, autorizado } = usePaginaRestrita([
    'superintendente_grupo', 'superintendente_territorio', 'admin',
  ])
  const [marcacoes, setMarcacoes] = useState<MarcacaoPendente[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!usuario || !autorizado) return

    async function carregar() {
      let query = supabase.from('marcacoes')
        .select('*, quadras(nome, territorio_id, territorios(nome, numero)), usuarios(nome)')
        .is('validado_por', null)
        .order('criado_em', { ascending: false })

      // Sup. de Grupo só valida marcações dos territórios em que está designado
      if (usuario!.perfil === 'superintendente_grupo') {
        const { data: designacoes } = await supabase
          .from('designacoes')
          .select('territorio_id')
          .eq('usuario_id', usuario!.id)
          .is('quadra_id', null)
          .is('data_fim', null)

        const territorioIds = (designacoes ?? []).map((d) => d.territorio_id).filter(Boolean)

        if (territorioIds.length === 0) {
          setMarcacoes([])
          setCarregando(false)
          return
        }

        const { data: quadrasDoTerritorio } = await supabase
          .from('quadras').select('id').in('territorio_id', territorioIds)

        const quadraIds = (quadrasDoTerritorio ?? []).map((q) => q.id)
        if (quadraIds.length === 0) {
          setMarcacoes([])
          setCarregando(false)
          return
        }

        query = query.in('quadra_id', quadraIds)
      }

      const { data } = await query
      setMarcacoes(data || [])
      setCarregando(false)
    }

    void carregar()
  }, [usuario, autorizado])

  async function validar(id: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('marcacoes').update({ validado_por: session.user.id }).eq('id', id)
    setMarcacoes(prev => prev.filter(m => m.id !== id))
  }

  async function rejeitar(id: string) {
    await supabase.from('marcacoes').delete().eq('id', id)
    setMarcacoes(prev => prev.filter(m => m.id !== id))
  }

  if (verificandoAcesso) return <Carregando />
  if (!autorizado) return <SemPermissao />

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>✅ Validar marcações</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 16 }}>Marcações pendentes de aprovação</p>

      {carregando ? <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>Carregando...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {marcacoes.map(m => {
            const cor = CORES_STATUS[m.status as keyof typeof CORES_STATUS]
            return (
              <div key={m.id} className="card" style={{ borderLeft: `5px solid ${cor?.stroke || '#ccc'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{m.quadras?.nome || 'Quadra'}</div>
                    {m.quadras?.territorios && (
                      <div style={{ fontSize: 13, color: '#378ADD', fontWeight: 600, marginTop: 1 }}>
                        🗺️ #{m.quadras.territorios.numero} — {m.quadras.territorios.nome}
                      </div>
                    )}
                    <div style={{ fontSize: 14, color: '#666', marginTop: 2 }}>Por: {m.usuarios?.nome}</div>
                    <div style={{ fontSize: 13, color: '#999' }}>{new Date(m.criado_em).toLocaleString('pt-BR')}</div>
                  </div>
                  <span style={{ padding: '5px 12px', borderRadius: 10, fontSize: 14, fontWeight: 700, background: cor?.fill, border: `1.5px solid ${cor?.stroke}`, color: '#333' }}>
                    {cor?.label}
                  </span>
                </div>
                {m.observacao && <p style={{ fontSize: 15, color: '#555', marginBottom: 12, fontStyle: 'italic' }}>&ldquo;{m.observacao}&rdquo;</p>}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => validar(m.id)} className="btn-grande btn-verde" style={{ flex: 2, minHeight: 52 }}>✅ Aprovar</button>
                  <button onClick={() => rejeitar(m.id)} className="btn-grande btn-vermelho" style={{ flex: 1, minHeight: 52 }}>✕ Rejeitar</button>
                </div>
              </div>
            )
          })}
          {!marcacoes.length && (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <p style={{ fontSize: 18, color: '#3BAD68', fontWeight: 700 }}>Tudo em dia!</p>
              <p style={{ color: '#888', marginTop: 4 }}>Nenhuma marcação pendente.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
