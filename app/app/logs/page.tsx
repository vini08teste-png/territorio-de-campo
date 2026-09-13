'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getUsuarioAtual } from '@/lib/auth'

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface LogEntry {
  id: string
  criado_em: string
  usuario?: { nome: string; perfil: string }
  quadra?: { nome: string }
  territorio?: { nome: string; numero: number }
  status?: string
  observacao?: string
  tipo: 'marcacao' | 'ponto_parada' | 'designacao' | 'usuario'
  descricao: string
}

interface Marcacao {
  id: string
  criado_em: string
  status: string
  observacao: string | null
  usuario: { nome: string; perfil: string } | null
  quadra: { nome: string; territorio: { nome: string; numero: number } | null } | null
}

interface PontoParada {
  id: string
  criado_em: string
  endereco: string
  observacao: string | null
  usuario: { nome: string; perfil: string } | null
  quadra: { nome: string; territorio: { nome: string; numero: number } | null } | null
}

interface Designacao {
  id: string
  data_inicio: string
  data_fim: string | null
  usuario: { nome: string; perfil: string } | null
  territorio: { nome: string; numero: number } | null
  quadra: { nome: string } | null
}

interface Usuario {
  id: string
  criado_em: string
  nome: string
  email: string
  perfil: string
  ativo: boolean
}

type FiltroTipo = 'todos' | 'marcacao' | 'ponto_parada' | 'designacao' | 'usuario'

// ── Helpers ────────────────────────────────────────────────────────────────────
const LABEL_PERFIL: Record<string, string> = {
  dirigente: 'Dirigente',
  superintendente_grupo: 'Sup. Grupo',
  superintendente_territorio: 'Sup. Território',
  admin: 'Admin',
}

const CORES_STATUS: Record<string, string> = {
  concluido: '#3BAD68', parcial: '#F0C060',
  em_andamento: '#378ADD', pendente: '#E05050', nao_iniciado: '#CCCCCC',
}

const LABEL_STATUS: Record<string, string> = {
  concluido: 'Concluído', parcial: 'Parcial',
  em_andamento: 'Em andamento', pendente: 'Pendente', nao_iniciado: 'Não iniciado',
}

const ICONE_TIPO: Record<FiltroTipo, string> = {
  todos: '📋', marcacao: '✏️', ponto_parada: '📍', designacao: '👤', usuario: '🔑',
}

const LABEL_TIPO: Record<FiltroTipo, string> = {
  todos: 'Todos', marcacao: 'Marcações', ponto_parada: 'Paradas',
  designacao: 'Designações', usuario: 'Usuários',
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function LogsPage() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [filtroPerfil, setFiltroPerfil] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [autorizado, setAutorizado] = useState(false)
  const [limpoEm, setLimpoEm] = useState<number | null>(null)

  useEffect(() => {
    try {
      const salvo = localStorage.getItem('logsLimpoEm')
      if (salvo) setLimpoEm(Number(salvo))
    } catch {
      // localStorage indisponível — ignora
    }
  }, [])

  function limparTela() {
    const agora = Date.now()
    setLimpoEm(agora)
    try {
      localStorage.setItem('logsLimpoEm', String(agora))
    } catch {
      // localStorage indisponível — ignora
    }
  }

  function restaurarTela() {
    setLimpoEm(null)
    try {
      localStorage.removeItem('logsLimpoEm')
    } catch {
      // localStorage indisponível — ignora
    }
  }

  const carregar = useCallback(async () => {
    setLoading(true)
    const atual = await getUsuarioAtual()
    if (!atual) { setLoading(false); return }

    const { data: u } = await supabase
      .from('usuarios').select('perfil').eq('id', atual.id).single()

    if (u?.perfil !== 'admin' && u?.perfil !== 'superintendente_territorio') {
      setLoading(false); return
    }
    setAutorizado(true)

    const entradas: LogEntry[] = []

    // ── Marcações ──────────────────────────────────────────────────────────────
    const { data: marcacoes } = await supabase
      .from('marcacoes')
      .select('id, criado_em, status, observacao, usuario:usuario_id(nome, perfil), quadra:quadra_id(nome, territorio:territorio_id(nome, numero))')
      .order('criado_em', { ascending: false })
      .limit(100)

    ;((marcacoes ?? []) as unknown as Marcacao[]).forEach((m) => {
      const terr = (m.quadra as { nome?: string; territorio?: { nome: string; numero: number } })?.territorio
      entradas.push({
        id: m.id,
        tipo: 'marcacao',
        criado_em: m.criado_em,
        usuario: m.usuario ?? undefined,
        descricao: [
          m.usuario?.nome ?? '—',
          'marcou',
          `"${(m.quadra as { nome?: string })?.nome ?? '—'}"`,
          'como',
          LABEL_STATUS[m.status] ?? m.status,
          terr ? `(Território #${terr.numero} ${terr.nome})` : '',
        ].join(' '),
        status: m.status,
        observacao: m.observacao ?? undefined,
      })
    })

    // ── Pontos de parada ───────────────────────────────────────────────────────
    const { data: pontos } = await supabase
      .from('pontos_parada')
      .select('id, criado_em, endereco, observacao, usuario:usuario_id(nome, perfil), quadra:quadra_id(nome, territorio:territorio_id(nome, numero))')
      .order('criado_em', { ascending: false })
      .limit(100)

    ;((pontos ?? []) as unknown as PontoParada[]).forEach((p) => {
      const terr = (p.quadra as { nome?: string; territorio?: { nome: string; numero: number } })?.territorio
      entradas.push({
        id: p.id,
        tipo: 'ponto_parada',
        criado_em: p.criado_em,
        usuario: p.usuario ?? undefined,
        descricao: [
          p.usuario?.nome ?? '—',
          'marcou ponto de parada em',
          `"${(p.quadra as { nome?: string })?.nome ?? '—'}"`,
          terr ? `(Território #${terr.numero} ${terr.nome})` : '',
          p.endereco ? `— ${p.endereco}` : '',
        ].join(' '),
        observacao: p.observacao ?? undefined,
      })
    })

    // ── Designações ────────────────────────────────────────────────────────────
    const { data: designacoes } = await supabase
      .from('designacoes')
      .select('id, data_inicio, data_fim, usuario:usuario_id(nome, perfil), territorio:territorio_id(nome, numero), quadra:quadra_id(nome)')
      .order('data_inicio', { ascending: false })
      .limit(100)

    ;((designacoes ?? []) as unknown as Designacao[]).forEach((d) => {
      const ativo = !d.data_fim
      const alvo = d.quadra
        ? `quadra "${(d.quadra as { nome?: string })?.nome ?? "—"}"` 
        : d.territorio
        ? `território #${(d.territorio as { nome?: string; numero?: number })?.numero} ${(d.territorio as { nome?: string; numero?: number })?.nome}`
        : '—'
      entradas.push({
        id: d.id,
        tipo: 'designacao',
        criado_em: ativo ? d.data_inicio : d.data_fim!,
        usuario: d.usuario ?? undefined,
        descricao: ativo
          ? `${d.usuario?.nome ?? '—'} foi designado(a) para ${alvo}`
          : `Designação de ${d.usuario?.nome ?? '—'} em ${alvo} foi encerrada`,
      })
    })

    // ── Usuários criados ───────────────────────────────────────────────────────
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, criado_em, nome, email, perfil, ativo')
      .order('criado_em', { ascending: false })
      .limit(50)

    ;(usuarios as Usuario[] ?? []).forEach((u) => {
      entradas.push({
        id: u.id,
        tipo: 'usuario',
        criado_em: u.criado_em,
        usuario: { nome: u.nome, perfil: u.perfil },
        descricao: `Usuário "${u.nome}" (${LABEL_PERFIL[u.perfil] ?? u.perfil}) cadastrado — ${u.ativo ? 'ativo' : 'inativo'}`,
      })
    })

    // Ordenar tudo por data desc
    entradas.sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
    setLogs(entradas)
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  // ── Filtros ────────────────────────────────────────────────────────────────
  const logsFiltrados = logs.filter((l) => {
    if (limpoEm && new Date(l.criado_em).getTime() <= limpoEm) return false
    if (filtroTipo !== 'todos' && l.tipo !== filtroTipo) return false
    if (filtroPerfil !== 'todos' && l.usuario?.perfil !== filtroPerfil) return false
    if (busca) {
      const q = busca.toLowerCase()
      if (!l.descricao.toLowerCase().includes(q) && !(l.usuario?.nome ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // ── Contagens por tipo ─────────────────────────────────────────────────────
  const logsVisiveis = limpoEm ? logs.filter((l) => new Date(l.criado_em).getTime() > limpoEm) : logs

  const contagem = (tipo: FiltroTipo) =>
    tipo === 'todos' ? logsVisiveis.length : logsVisiveis.filter((l) => l.tipo === tipo).length

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <p style={{ color: '#666', fontSize: 16 }}>Carregando logs…</p>
      </div>
    )
  }

  if (!autorizado) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666', fontSize: 17 }}>
        Você não tem permissão para ver esta página.
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Logs do sistema</h1>
          <p style={{ fontSize: 15, color: '#666', marginTop: 4 }}>
            {logsFiltrados.length} registros{limpoEm ? ' visíveis (tela limpa manualmente)' : ' — últimas atividades de todos os usuários'}
          </p>
        </div>

        {limpoEm ? (
          <button
            onClick={restaurarTela}
            style={{
              padding: '9px 16px', fontSize: 14, fontWeight: 600,
              background: '#F7F7F7', color: '#378ADD',
              border: '1px solid #DDDDDD', borderRadius: 10, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ↺ Restaurar
          </button>
        ) : (
          <button
            onClick={limparTela}
            disabled={logs.length === 0}
            style={{
              padding: '9px 16px', fontSize: 14, fontWeight: 600,
              background: '#FFF0F0', color: '#E05050',
              border: '1px solid #FFCCCC', borderRadius: 10,
              cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
              opacity: logs.length === 0 ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            🧹 Limpar tela
          </button>
        )}
      </div>

      {/* Filtros de tipo (pills) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {(['todos', 'marcacao', 'ponto_parada', 'designacao', 'usuario'] as FiltroTipo[]).map((tipo) => (
          <button
            key={tipo}
            onClick={() => setFiltroTipo(tipo)}
            style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', border: '1px solid',
              borderColor: filtroTipo === tipo ? '#378ADD' : '#EEEEEE',
              background: filtroTipo === tipo ? '#DDEEFF' : '#FFFFFF',
              color: filtroTipo === tipo ? '#042C53' : '#666',
            }}
          >
            {ICONE_TIPO[tipo]} {LABEL_TIPO[tipo]} ({contagem(tipo)})
          </button>
        ))}
      </div>

      {/* Busca + filtro perfil */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar por nome ou descrição…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            flex: 1, minWidth: 180, padding: '10px 14px', fontSize: 15,
            border: '1px solid #DDDDDD', borderRadius: 10, background: '#FAFAFA',
            color: '#1A1A1A', outline: 'none',
          }}
        />
        <select
          value={filtroPerfil}
          onChange={(e) => setFiltroPerfil(e.target.value)}
          style={{
            padding: '10px 14px', fontSize: 14, border: '1px solid #DDDDDD',
            borderRadius: 10, background: '#FAFAFA', color: '#1A1A1A', cursor: 'pointer',
          }}
        >
          <option value="todos">Todos os perfis</option>
          <option value="dirigente">Dirigente</option>
          <option value="superintendente_grupo">Sup. Grupo</option>
          <option value="superintendente_territorio">Sup. Território</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* Lista de logs */}
      {logsFiltrados.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '2.5rem', background: '#F7F7F7',
          borderRadius: 12, border: '1px dashed #DDDDDD', color: '#999', fontSize: 15,
        }}>
          Nenhum registro encontrado.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logsFiltrados.map((log) => (
            <LogCard key={`${log.tipo}-${log.id}`} log={log} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Card individual de log ─────────────────────────────────────────────────────
function LogCard({ log }: { log: LogEntry }) {
  const COR_TIPO: Record<string, string> = {
    marcacao: '#378ADD',
    ponto_parada: '#E05050',
    designacao: '#3BAD68',
    usuario: '#A090E0',
  }
  const cor = COR_TIPO[log.tipo] ?? '#CCCCCC'

  return (
    <div style={{
      background: '#FFFFFF', border: '0.5px solid #EEEEEE',
      borderRadius: 10, padding: '12px 16px',
      borderLeft: `3px solid ${cor}`,
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
        {ICONE_TIPO[log.tipo as FiltroTipo]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: '#1A1A1A', lineHeight: 1.5 }}>
          {log.descricao}
        </div>
        {log.observacao && (
          <div style={{ fontSize: 12, color: '#888', marginTop: 3, fontStyle: 'italic' }}>
            &ldquo;{log.observacao}&rdquo;
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#AAAAAA' }}>{formatarData(log.criado_em)}</span>
          {log.usuario?.perfil && (
            <span style={{
              fontSize: 11, padding: '1px 7px', borderRadius: 10,
              background: '#F0F0F0', color: '#555', border: '1px solid #E0E0E0',
            }}>
              {LABEL_PERFIL[log.usuario.perfil] ?? log.usuario.perfil}
            </span>
          )}
          {log.status && (
            <span style={{
              fontSize: 11, padding: '1px 7px', borderRadius: 10,
              background: (CORES_STATUS[log.status] ?? '#CCC') + '22',
              border: `1px solid ${(CORES_STATUS[log.status] ?? '#CCC')}55`,
              color: '#333',
            }}>
              {LABEL_STATUS[log.status] ?? log.status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
