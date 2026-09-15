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
  congregacao: string | null
}

interface DesignacaoLinha {
  usuario_id: string
  territorio_id: string | null
  data_inicio: string
}

interface MembroGrupoLinha {
  dirigente_id: string
  sg_id: string
}

// ── Árvore montada em memória ──────────────────────────────────────────────────
interface NoTerritorio {
  territorio: TerritorioLinha
  st: UsuarioLinha | null
  sg: UsuarioLinha | null
  sgDataInicio: string | null
  dirigentes: UsuarioLinha[]
}
interface NoCongregacao {
  nome: string
  territorios: NoTerritorio[]
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
  const [designacoes, setDesignacoes] = useState<DesignacaoLinha[]>([])
  const [membros, setMembros] = useState<MembroGrupoLinha[]>([])
  const [prazoDias, setPrazoDias] = useState(120)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (verificandoAcesso || !autorizado) return

    void Promise.all([
      supabase.from('usuarios').select('id, nome, email, perfil, ativo, congregacao'),
      supabase.from('territorios').select('id, nome, numero, criado_por, congregacao'),
      supabase.from('designacoes').select('usuario_id, territorio_id, data_inicio').is('quadra_id', null).is('data_fim', null),
      supabase.from('membros_grupo').select('dirigente_id, sg_id').is('data_fim', null),
      supabase.from('configuracoes').select('prazo_territorio_dias').eq('id', 1).single(),
    ]).then(([u, t, d, mg, c]) => {
      setUsuarios((u.data as UsuarioLinha[]) ?? [])
      setTerritorios((t.data as TerritorioLinha[]) ?? [])
      setDesignacoes((d.data as DesignacaoLinha[]) ?? [])
      setMembros((mg.data as MembroGrupoLinha[]) ?? [])
      setPrazoDias(c.data?.prazo_territorio_dias ?? 120)
      setCarregando(false)
    })
  }, [verificandoAcesso, autorizado])

  const { congregacoes, orfaos } = useMemo(() => {
    const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]))

    // SG designado por território
    const sgPorTerritorio = new Map<string, UsuarioLinha>()
    const sgDataInicioPorTerritorio = new Map<string, string>()
    const usadosComoSG = new Set<string>()
    for (const d of designacoes) {
      const usuario = usuarioPorId.get(d.usuario_id)
      if (!usuario || !d.territorio_id) continue
      sgPorTerritorio.set(d.territorio_id, usuario)
      sgDataInicioPorTerritorio.set(d.territorio_id, d.data_inicio)
      usadosComoSG.add(usuario.id)
    }

    // Dirigentes do grupo de cada SG
    const dirigentesPorSG = new Map<string, UsuarioLinha[]>()
    const usadosComoDirigente = new Set<string>()
    for (const m of membros) {
      const dirigente = usuarioPorId.get(m.dirigente_id)
      if (!dirigente) continue
      const lista = dirigentesPorSG.get(m.sg_id) ?? []
      lista.push(dirigente)
      dirigentesPorSG.set(m.sg_id, lista)
      usadosComoDirigente.add(dirigente.id)
    }

    function montarNoTerritorio(t: TerritorioLinha): NoTerritorio {
      const st = t.criado_por ? usuarioPorId.get(t.criado_por) ?? null : null
      const sg = sgPorTerritorio.get(t.id) ?? null
      const sgDataInicio = sgDataInicioPorTerritorio.get(t.id) ?? null
      const dirigentes = sg ? dirigentesPorSG.get(sg.id) ?? [] : []
      return { territorio: t, st, sg, sgDataInicio, dirigentes }
    }

    const grupos = new Map<string, NoTerritorio[]>()
    for (const t of territorios) {
      const chave = t.congregacao?.trim() || 'Sem congregação definida'
      const lista = grupos.get(chave) ?? []
      lista.push(montarNoTerritorio(t))
      grupos.set(chave, lista)
    }

    const congregacoesMontadas: NoCongregacao[] = Array.from(grupos.entries())
      .map(([nome, terrs]) => ({
        nome,
        territorios: terrs.sort((a, b) => Number(a.territorio.numero) - Number(b.territorio.numero)),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome))

    // Quem ficou de fora da árvore inteira
    const sgSemTerritorio = usuarios.filter((u) => u.perfil === 'superintendente_grupo' && !usadosComoSG.has(u.id))
    const dirigenteSemGrupo = usuarios.filter((u) => u.perfil === 'dirigente' && !usadosComoDirigente.has(u.id))
    const stSemTerritorio = usuarios.filter((u) =>
      u.perfil === 'superintendente_territorio' && !territorios.some((t) => t.criado_por === u.id))

    return {
      congregacoes: congregacoesMontadas,
      orfaos: { sgSemTerritorio, dirigenteSemGrupo, stSemTerritorio },
    }
  }, [usuarios, territorios, designacoes, membros])

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
          Congregação → Território (Sup. de Território) → Sup. de Grupo → Dirigente
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
          Nenhum território cadastrado ainda.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {congregacoes.map((cong) => (
          <div key={cong.nome} style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 14, padding: '1.1rem 1.25rem' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              🏛️ {cong.nome}
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: '#AAAAAA', textTransform: 'none' }}>
                {cong.territorios.length} território{cong.territorios.length !== 1 ? 's' : ''}
              </span>
            </div>

            {cong.territorios.map((nt) => {
              const prazo = nt.sgDataInicio ? calcularPrazoTerritorio(nt.sgDataInicio, prazoDias) : null
              return (
                <div key={nt.territorio.id} style={{ marginTop: 14 }}>
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

                  <Galho cor={CORES_PERFIL.superintendente_territorio.acento}>
                    {nt.st ? (
                      <LinhaPessoa usuario={nt.st} sub="Sup. de Território" />
                    ) : (
                      <span style={{ fontSize: 13, color: '#E05050' }}>⚠️ Sem Sup. de Território dono</span>
                    )}

                    <Galho cor={CORES_PERFIL.superintendente_grupo.acento}>
                      {nt.sg ? (
                        <div>
                          <LinhaPessoa usuario={nt.sg} sub="Sup. de Grupo" />
                          <Galho cor={CORES_PERFIL.dirigente.acento}>
                            {nt.dirigentes.length === 0 && (
                              <span style={{ fontSize: 13, color: '#AAAAAA' }}>Nenhum dirigente no grupo.</span>
                            )}
                            {nt.dirigentes.map((usuario) => (
                              <LinhaPessoa key={usuario.id} usuario={usuario} sub="Dirigente" />
                            ))}
                          </Galho>
                        </div>
                      ) : (
                        <span style={{ fontSize: 13, color: '#E05050' }}>⚠️ Sem Sup. de Grupo designado</span>
                      )}
                    </Galho>
                  </Galho>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Pessoas sem vínculo */}
      {(orfaos.stSemTerritorio.length > 0 || orfaos.sgSemTerritorio.length > 0 || orfaos.dirigenteSemGrupo.length > 0) && (
        <div style={{ marginTop: 20, background: '#F7F7F7', border: '1px dashed #DDDDDD', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 12 }}>👥 Sem designação atual</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orfaos.stSemTerritorio.filter((u) => combina(u.nome)).map((u) => (
              <LinhaPessoa key={u.id} usuario={u} sub="Sup. de Território — sem território criado" />
            ))}
            {orfaos.sgSemTerritorio.filter((u) => combina(u.nome)).map((u) => (
              <LinhaPessoa key={u.id} usuario={u} sub="Sup. de Grupo — sem território" />
            ))}
            {orfaos.dirigenteSemGrupo.filter((u) => combina(u.nome)).map((u) => (
              <LinhaPessoa key={u.id} usuario={u} sub="Dirigente — sem grupo" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
