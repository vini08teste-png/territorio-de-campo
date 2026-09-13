'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase, CORES_PERFIL, type Perfil } from '@/lib/supabase'
import { usePaginaRestrita } from '@/lib/permissoes'
import { Carregando, SemPermissao } from '@/components/EstadoPagina'
import { calcularPrazoTerritorio, formatarPrazo } from '@/lib/prazoTerritorio'

interface UsuarioLinha {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  congregacao?: string | null
}

interface TerritorioLinha {
  id: string
  nome: string
  numero: string
  criado_por: string | null
}

interface QuadraLinha {
  id: string
  territorio_id: string
}

interface DesignacaoLinha {
  usuario_id: string
  territorio_id: string | null
  quadra_id: string | null
  data_inicio: string
}

// ── Árvore montada em memória ──────────────────────────────────────────────────
interface NoDirigente { usuario: UsuarioLinha }
interface NoTerritorio {
  territorio: TerritorioLinha
  sg: UsuarioLinha | null
  sgDataInicio: string | null
  dirigentes: NoDirigente[]
}
interface NoST {
  usuario: UsuarioLinha
  territorios: NoTerritorio[]
}
interface NoCongregacao {
  nome: string
  sts: NoST[]
}

function Avatar({ nome, perfil }: { nome: string; perfil: Perfil }) {
  const cores = CORES_PERFIL[perfil]
  const iniciais = nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: cores.bg, color: cores.texto, border: `1.5px solid ${cores.acento}`,
      fontWeight: 700, fontSize: 12,
    }}>
      {iniciais}
    </span>
  )
}

function LinhaPessoa({ usuario, sub }: { usuario: UsuarioLinha; sub?: string }) {
  const cores = CORES_PERFIL[usuario.perfil]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: usuario.ativo ? 1 : 0.5 }}>
      <Avatar nome={usuario.nome} perfil={usuario.perfil} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {usuario.nome}
          {!usuario.ativo && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#FFF0F0', color: '#E05050', border: '1px solid #FFCCCC' }}>
              INATIVO
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: cores.texto }}>{sub ?? CORES_PERFIL[usuario.perfil].label}</div>
      </div>
    </div>
  )
}

function Galho({ children, cor = '#EEEEEE' }: { children: React.ReactNode; cor?: string }) {
  return (
    <div style={{ marginLeft: 17, paddingLeft: 20, borderLeft: `2px solid ${cor}`, display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
      {children}
    </div>
  )
}

export default function HierarquiaPage() {
  const { carregando: verificandoAcesso, autorizado } = usePaginaRestrita(['admin'])
  const [carregando, setCarregando] = useState(true)
  const [usuarios, setUsuarios] = useState<UsuarioLinha[]>([])
  const [territorios, setTerritorios] = useState<TerritorioLinha[]>([])
  const [quadras, setQuadras] = useState<QuadraLinha[]>([])
  const [designacoes, setDesignacoes] = useState<DesignacaoLinha[]>([])
  const [prazoDias, setPrazoDias] = useState(120)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (verificandoAcesso || !autorizado) return

    void Promise.all([
      supabase.from('usuarios').select('id, nome, email, perfil, ativo, congregacao'),
      supabase.from('territorios').select('id, nome, numero, criado_por'),
      supabase.from('quadras').select('id, territorio_id'),
      supabase.from('designacoes').select('usuario_id, territorio_id, quadra_id, data_inicio').is('data_fim', null),
      supabase.from('configuracoes').select('prazo_territorio_dias').eq('id', 1).single(),
    ]).then(([u, t, q, d, c]) => {
      setUsuarios((u.data as UsuarioLinha[]) ?? [])
      setTerritorios((t.data as TerritorioLinha[]) ?? [])
      setQuadras((q.data as QuadraLinha[]) ?? [])
      setDesignacoes((d.data as DesignacaoLinha[]) ?? [])
      setPrazoDias(c.data?.prazo_territorio_dias ?? 120)
      setCarregando(false)
    })
  }, [verificandoAcesso, autorizado])

  const { congregacoes, orfaos, semTerritorio } = useMemo(() => {
    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]))

    // SG designado por território (quadra_id nulo)
    const sgPorTerritorio = new Map<string, UsuarioLinha>()
    const sgDataInicioPorTerritorio = new Map<string, string>()
    // Dirigentes designados por quadra
    const dirigentePorQuadra = new Map<string, UsuarioLinha[]>()
    // Ids de quem já apareceu em algum lugar da árvore
    const usadosComoSG = new Set<string>()
    const usadosComoDirigente = new Set<string>()

    for (const d of designacoes) {
      const usuario = usuarioPorId.get(d.usuario_id)
      if (!usuario) continue
      if (d.quadra_id === null && d.territorio_id) {
        sgPorTerritorio.set(d.territorio_id, usuario)
        sgDataInicioPorTerritorio.set(d.territorio_id, d.data_inicio)
        usadosComoSG.add(usuario.id)
      } else if (d.quadra_id) {
        const lista = dirigentePorQuadra.get(d.quadra_id) ?? []
        lista.push(usuario)
        dirigentePorQuadra.set(d.quadra_id, lista)
        usadosComoDirigente.add(usuario.id)
      }
    }

    const quadrasPorTerritorio = new Map<string, QuadraLinha[]>()
    for (const q of quadras) {
      const lista = quadrasPorTerritorio.get(q.territorio_id) ?? []
      lista.push(q)
      quadrasPorTerritorio.set(q.territorio_id, lista)
    }

    const territoriosPorST = new Map<string, TerritorioLinha[]>()
    const territoriosSemST: TerritorioLinha[] = []
    for (const t of territorios) {
      if (t.criado_por) {
        const lista = territoriosPorST.get(t.criado_por) ?? []
        lista.push(t)
        territoriosPorST.set(t.criado_por, lista)
      } else {
        territoriosSemST.push(t)
      }
    }

    function montarNoTerritorio(t: TerritorioLinha): NoTerritorio {
      const sg = sgPorTerritorio.get(t.id) ?? null
      const sgDataInicio = sgDataInicioPorTerritorio.get(t.id) ?? null
      const qs = quadrasPorTerritorio.get(t.id) ?? []
      const dirigentes: NoDirigente[] = qs
        .flatMap((q) => dirigentePorQuadra.get(q.id) ?? [])
        .map((usuario) => ({ usuario }))
      return { territorio: t, sg, sgDataInicio, dirigentes }
    }

    const sts = usuarios.filter((u) => u.perfil === 'superintendente_territorio')
    const grupos = new Map<string, NoST[]>()

    for (const st of sts) {
      const chave = st.congregacao?.trim() || 'Sem congregação definida'
      const noST: NoST = {
        usuario: st,
        territorios: (territoriosPorST.get(st.id) ?? []).map(montarNoTerritorio),
      }
      const lista = grupos.get(chave) ?? []
      lista.push(noST)
      grupos.set(chave, lista)
    }

    const congregacoesMontadas: NoCongregacao[] = Array.from(grupos.entries())
      .map(([nome, sts2]) => ({ nome, sts: sts2 }))
      .sort((a, b) => a.nome.localeCompare(b.nome))

    // Quem ficou de fora da árvore inteira
    const sgSemTerritorio = usuarios.filter((u) => u.perfil === 'superintendente_grupo' && !usadosComoSG.has(u.id))
    const dirigenteSemQuadra = usuarios.filter((u) => u.perfil === 'dirigente' && !usadosComoDirigente.has(u.id))

    return {
      congregacoes: congregacoesMontadas,
      orfaos: { sgSemTerritorio, dirigenteSemQuadra },
      semTerritorio: territoriosSemST,
    }
  }, [usuarios, territorios, quadras, designacoes])

  if (verificandoAcesso) return <Carregando />
  if (!autorizado) return <SemPermissao />
  if (carregando) return <Carregando texto="Montando a hierarquia…" />

  const termo = busca.trim().toLowerCase()
  const filtroAtivo = termo.length > 0

  function combina(nome: string) {
    return !filtroAtivo || nome.toLowerCase().includes(termo)
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Hierarquia</h1>
        <p style={{ fontSize: 15, color: '#666', marginTop: 4 }}>
          Congregação → Sup. de Território → Sup. de Grupo → Dirigente
        </p>
      </div>

      <input
        type="search"
        placeholder="Buscar por nome…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        style={{
          width: '100%', padding: '12px 14px', fontSize: 15,
          border: '1px solid #DDDDDD', borderRadius: 10, background: '#FAFAFA',
          color: '#1A1A1A', marginBottom: 20, boxSizing: 'border-box', outline: 'none',
        }}
      />

      {congregacoes.length === 0 && (
        <p style={{ textAlign: 'center', color: '#888', padding: 40 }}>
          Nenhum Sup. de Território cadastrado ainda.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {congregacoes.map((cong) => (
          <div key={cong.nome} style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 14, padding: '1.1rem 1.25rem' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              🏛️ {cong.nome}
            </div>

            {cong.sts.map((no) => (
              <div key={no.usuario.id} style={{ marginTop: 14 }}>
                <LinhaPessoa usuario={no.usuario} sub="Sup. de Território" />

                <Galho cor={CORES_PERFIL.superintendente_territorio.acento}>
                  {no.territorios.length === 0 && (
                    <span style={{ fontSize: 13, color: '#AAAAAA' }}>Nenhum território criado.</span>
                  )}

                  {no.territorios.map((nt) => {
                    const prazo = nt.sgDataInicio ? calcularPrazoTerritorio(nt.sgDataInicio, prazoDias) : null
                    return (
                    <div key={nt.territorio.id}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        🗺️ #{nt.territorio.numero} — {nt.territorio.nome}
                        {prazo && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
                            background: prazo.vencido ? '#FFF0F0' : '#F7F7F7',
                            color: prazo.vencido ? '#E05050' : '#888',
                            border: `1px solid ${prazo.vencido ? '#FFCCCC' : '#DDDDDD'}`,
                          }}>
                            {formatarPrazo(prazo)}
                          </span>
                        )}
                      </div>

                      <Galho cor={CORES_PERFIL.superintendente_grupo.acento}>
                        {nt.sg ? (
                          <div>
                            <LinhaPessoa usuario={nt.sg} sub="Sup. de Grupo" />
                            <Galho cor={CORES_PERFIL.dirigente.acento}>
                              {nt.dirigentes.length === 0 && (
                                <span style={{ fontSize: 13, color: '#AAAAAA' }}>Nenhum dirigente designado.</span>
                              )}
                              {nt.dirigentes.map(({ usuario }, i) => (
                                <LinhaPessoa key={usuario.id + i} usuario={usuario} sub="Dirigente" />
                              ))}
                            </Galho>
                          </div>
                        ) : (
                          <span style={{ fontSize: 13, color: '#E05050' }}>⚠️ Sem Sup. de Grupo designado</span>
                        )}
                      </Galho>
                    </div>
                    )
                  })}
                </Galho>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Territórios sem ST dono */}
      {semTerritorio.length > 0 && (
        <div style={{ marginTop: 24, background: '#FFF8E7', border: '1px solid #F0C060', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#412402', marginBottom: 8 }}>⚠️ Territórios sem Sup. de Território responsável</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {semTerritorio.filter((t) => combina(t.nome)).map((t) => (
              <span key={t.id} style={{ fontSize: 13, color: '#664400' }}>#{t.numero} — {t.nome}</span>
            ))}
          </div>
        </div>
      )}

      {/* Pessoas sem vínculo */}
      {(orfaos.sgSemTerritorio.length > 0 || orfaos.dirigenteSemQuadra.length > 0) && (
        <div style={{ marginTop: 20, background: '#F7F7F7', border: '1px dashed #DDDDDD', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 12 }}>👥 Sem designação atual</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orfaos.sgSemTerritorio.filter((u) => combina(u.nome)).map((u) => (
              <LinhaPessoa key={u.id} usuario={u} sub="Sup. de Grupo — sem território" />
            ))}
            {orfaos.dirigenteSemQuadra.filter((u) => combina(u.nome)).map((u) => (
              <LinhaPessoa key={u.id} usuario={u} sub="Dirigente — sem quadra" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
