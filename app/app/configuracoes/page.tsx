'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCongregacoesExistentes, useCongregacoesCompletas, type CongregacaoCompleta } from '@/lib/congregacoes'

interface ConfigCong {
  cidade: string
  lat: number
  lng: number
  superintendente_id: string
  prazo_territorio_dias: number
  bloquear_territorio_vencido: boolean
  validacao_automatica: boolean
}

interface ST {
  id: string
  nome: string
  email: string
}

const DEFAULTS: ConfigCong = {
  cidade: '',
  lat: -6.52,
  lng: -49.85,
  superintendente_id: '',
  prazo_territorio_dias: 120,
  bloquear_territorio_vencido: false,
  validacao_automatica: false,
}

function paraConfig(c: CongregacaoCompleta): ConfigCong {
  return {
    cidade: c.cidade ?? '',
    lat: c.lat ?? -6.52,
    lng: c.lng ?? -49.85,
    superintendente_id: c.superintendente_id ?? '',
    prazo_territorio_dias: c.prazo_territorio_dias ?? 120,
    bloquear_territorio_vencido: c.bloquear_territorio_vencido ?? false,
    validacao_automatica: c.validacao_automatica ?? false,
  }
}

export default function ConfiguracoesPage() {
  const { congregacoes: congregacoesCompletas, carregando: carregandoCongregacoes, recarregar: recarregarCongregacoes } = useCongregacoesCompletas()
  const [congregacaoId, setCongregacaoId] = useState('')
  const [config, setConfig] = useState<ConfigCong>(DEFAULTS)
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

  useEffect(() => {
    const cong = congregacoesCompletas.find((c) => c.id === congregacaoId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(cong ? paraConfig(cong) : DEFAULTS)
  }, [congregacaoId, congregacoesCompletas])

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
    if (!congregacaoId) return
    setSalvando(true)
    const { error } = await supabase.from('congregacoes').update({
      cidade: config.cidade || null,
      lat: config.lat,
      lng: config.lng,
      superintendente_id: config.superintendente_id || null,
      prazo_territorio_dias: config.prazo_territorio_dias,
      bloquear_territorio_vencido: config.bloquear_territorio_vencido,
      validacao_automatica: config.validacao_automatica,
    }).eq('id', congregacaoId)
    setSalvando(false)

    if (error) {
      alert('Erro ao salvar: ' + error.message)
      return
    }

    void recarregarCongregacoes()
    setSucesso(true)
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

      <GerenciarCongregacoes />

      {/* Escolha da congregação a configurar */}
      <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: '1rem' }}>
          Dados gerais
        </h2>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>
          Congregação a configurar
        </label>
        {carregandoCongregacoes ? (
          <p style={{ fontSize: 13, color: '#999' }}>Carregando…</p>
        ) : congregacoesCompletas.length === 0 ? (
          <p style={{ fontSize: 13, color: '#999' }}>
            Cadastre uma congregação acima primeiro.
          </p>
        ) : (
          <select
            value={congregacaoId}
            onChange={(e) => setCongregacaoId(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A', outline: 'none' }}
          >
            <option value="">— Selecione —</option>
            {congregacoesCompletas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}{c.cidade ? ` — ${c.cidade}` : ''}</option>
            ))}
          </select>
        )}
        <p style={{ fontSize: 12, color: '#AAAAAA', marginTop: 6 }}>
          Cada congregação pode ter mais de uma com o mesmo nome — por isso a cidade ajuda a diferenciar.
        </p>
      </div>

      {congregacaoId && (
      <form onSubmit={(e) => void salvar(e)}>

        {/* Cidade / coordenadas dessa congregação */}
        <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: '1rem' }}>
            Cidade
          </h2>
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

        {/* Centro do mapa */}
        <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: 4 }}>
            Centro do mapa
          </h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>
            O mapa dessa congregação abre nessas coordenadas por padrão.
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
            Responsável principal pela gestão dos territórios dessa congregação.
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

        {/* Prazo de território */}
        <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: 4 }}>
            Prazo de território
          </h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>
            Quanto tempo um Sup. de Grupo pode ficar com um território dessa congregação antes de aparecer como vencido nas telas.
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>
              Prazo (em dias)
            </label>
            <input
              type="number" min={1} value={config.prazo_territorio_dias}
              onChange={(e) => setConfig((c) => ({ ...c, prazo_territorio_dias: parseInt(e.target.value, 10) || 1 }))}
              style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A', outline: 'none', boxSizing: 'border-box' }}
            />
            <p style={{ fontSize: 12, color: '#AAAAAA', marginTop: 4 }}>120 dias ≈ 4 meses.</p>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.bloquear_territorio_vencido}
              onChange={(e) => setConfig((c) => ({ ...c, bloquear_territorio_vencido: e.target.checked }))}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>Bloquear marcações em território vencido</span>
              <br />
              <span style={{ fontSize: 13, color: '#888' }}>
                Desligado por padrão — o dirigente continua marcando normalmente, só aparece o aviso de vencido. Ligue aqui se quiser travar de verdade.
              </span>
            </span>
          </label>
        </div>

        {/* Validação de marcações */}
        <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: 4 }}>
            Validação de marcações
          </h2>
          <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>
            Por padrão, toda marcação de quadra feita por um dirigente fica pendente até um Sup. de Grupo aprovar em &ldquo;Validar marcações&rdquo;.
          </p>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.validacao_automatica}
              onChange={(e) => setConfig((c) => ({ ...c, validacao_automatica: e.target.checked }))}
              style={{ marginTop: 3 }}
            />
            <span>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#1A1A1A' }}>Permitir tudo (aprovar automaticamente)</span>
              <br />
              <span style={{ fontSize: 13, color: '#888' }}>
                Desligado por padrão. Ligue pra dispensar a validação manual nessa congregação — toda marcação já entra aprovada na hora.
              </span>
            </span>
          </label>
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
      )}

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

function GerenciarCongregacoes() {
  const { congregacoes, carregando, recarregar } = useCongregacoesExistentes()
  const [contagens, setContagens] = useState<Record<string, { usuarios: number; territorios: number }>>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [nomeNova, setNomeNova] = useState('')
  const [expandida, setExpandida] = useState<string | null>(null)
  const [membros, setMembros] = useState<{ id: string; nome: string; perfil: string }[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (congregacoes.length === 0) { setContagens({}); return }
    void Promise.all([
      supabase.from('usuarios').select('congregacao'),
      supabase.from('territorios').select('congregacao'),
    ]).then(([u, t]) => {
      const c: Record<string, { usuarios: number; territorios: number }> = {}
      for (const nome of congregacoes) c[nome] = { usuarios: 0, territorios: 0 }
      for (const row of u.data ?? []) {
        const n = (row.congregacao ?? '').trim()
        if (c[n]) c[n].usuarios++
      }
      for (const row of t.data ?? []) {
        const n = (row.congregacao ?? '').trim()
        if (c[n]) c[n].territorios++
      }
      setContagens(c)
    })
  }, [congregacoes])

  async function verMembros(nome: string) {
    if (expandida === nome) { setExpandida(null); return }
    setExpandida(nome)
    const { data } = await supabase.from('usuarios').select('id, nome, perfil').eq('congregacao', nome).order('nome')
    setMembros(data ?? [])
  }

  async function renomear(nomeAntigo: string) {
    const novo = novoNome.trim()
    if (!novo) { setEditando(null); return }
    setSalvando(true)
    setErro(null)

    // "nomeAntigo" pode só existir como texto livre em usuarios/territorios,
    // sem linha na tabela congregacoes ainda (caso de quem apareceu na lista
    // só por já estar em uso). Se o update não achar nada pra mudar, é porque
    // é esse caso — e é aqui que a congregação nasce de verdade na tabela.
    const { data: atualizadas, error: erroUpdate } = await supabase
      .from('congregacoes').update({ nome: novo }).eq('nome', nomeAntigo).select('id')
    if (erroUpdate) { setSalvando(false); setErro('Erro ao renomear: ' + erroUpdate.message); return }
    if ((atualizadas?.length ?? 0) === 0) {
      const { error: erroInsert } = await supabase.from('congregacoes').insert({ nome: novo })
      if (erroInsert && erroInsert.code !== '23505') { // 23505 = já existe (corrida rara) — segue o fluxo
        setSalvando(false)
        setErro('Erro ao cadastrar a congregação: ' + erroInsert.message)
        return
      }
    }

    if (novo !== nomeAntigo) {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from('usuarios').update({ congregacao: novo }).eq('congregacao', nomeAntigo),
        supabase.from('territorios').update({ congregacao: novo }).eq('congregacao', nomeAntigo),
      ])
      if (e1 || e2) { setSalvando(false); setErro('Erro ao renomear em alguns registros.'); return }
    }
    setSalvando(false)
    setEditando(null)
    void recarregar()
  }

  async function excluir(nome: string) {
    const c = contagens[nome] ?? { usuarios: 0, territorios: 0 }
    if (c.usuarios > 0 || c.territorios > 0) {
      setErro('Só dá pra excluir uma congregação sem pessoas nem territórios nela.')
      return
    }
    if (!confirm(`Excluir a congregação "${nome}"?`)) return
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('congregacoes').delete().eq('nome', nome)
    setSalvando(false)
    if (error) { setErro('Erro ao excluir: ' + error.message); return }
    void recarregar()
  }

  async function adicionar() {
    const nome = nomeNova.trim()
    if (!nome) return
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('congregacoes').insert({ nome })
    setSalvando(false)
    if (error) {
      setErro(
        error.message.includes('does not exist') || error.code === '42P01'
          ? 'Falta aplicar a migração da tabela de congregações no banco.'
          : error.message.includes('duplicate') || error.code === '23505'
          ? 'Essa congregação já existe.'
          : 'Erro ao adicionar: ' + error.message
      )
      return
    }
    setNomeNova('')
    setAdicionando(false)
    void recarregar()
  }

  const estiloCampo = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A',
    outline: 'none', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: 4 }}>
        Congregações
      </h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>
        Quem é de cada congregação só vê os territórios e marcações dela mesma. Renomear aqui atualiza todo mundo de uma vez.
      </p>

      {erro && (
        <div style={{ background: '#FFF0F0', border: '1px solid #E05050', borderRadius: 8, padding: '10px 12px', marginBottom: 12, color: '#501313', fontSize: 13 }}>
          ⚠️ {erro}
        </div>
      )}

      {carregando ? (
        <p style={{ fontSize: 13, color: '#999' }}>Carregando…</p>
      ) : congregacoes.length === 0 ? (
        <p style={{ fontSize: 13, color: '#999' }}>Nenhuma congregação cadastrada ainda.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {congregacoes.map((nome) => {
            const c = contagens[nome] ?? { usuarios: 0, territorios: 0 }
            const aberta = expandida === nome
            const emEdicao = editando === nome
            return (
              <div key={nome} style={{ border: '1px solid #EEEEEE', borderRadius: 10, padding: '10px 12px' }}>
                {emEdicao ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      autoFocus
                      type="text"
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      style={estiloCampo}
                    />
                    <button
                      onClick={() => void renomear(nome)}
                      disabled={salvando}
                      style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, background: '#3BAD68', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
                    >
                      ✅
                    </button>
                    <button
                      onClick={() => setEditando(null)}
                      style={{ padding: '8px 12px', fontSize: 13, background: '#F7F7F7', color: '#666', border: '1px solid #DDDDDD', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => void verMembros(nome)}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A' }}>🏛️ {nome}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {c.usuarios} pessoa{c.usuarios !== 1 ? 's' : ''} · {c.territorios} território{c.territorios !== 1 ? 's' : ''}
                        {' · '}{aberta ? 'ocultar membros' : 'ver membros'}
                      </div>
                    </div>
                    <button
                      onClick={() => { setEditando(nome); setNovoNome(nome) }}
                      style={{ padding: '6px 10px', fontSize: 12, background: '#F7F7F7', color: '#444', border: '1px solid #DDDDDD', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
                    >
                      ✏️ Renomear
                    </button>
                    <button
                      onClick={() => void excluir(nome)}
                      disabled={salvando || c.usuarios > 0 || c.territorios > 0}
                      title={c.usuarios > 0 || c.territorios > 0 ? 'Só dá pra excluir sem pessoas nem territórios' : 'Excluir congregação'}
                      style={{
                        padding: '6px 10px', fontSize: 12, background: '#FFF0F0', color: '#E05050',
                        border: '1px solid #FFCCCC', borderRadius: 8, flexShrink: 0,
                        cursor: (c.usuarios > 0 || c.territorios > 0) ? 'not-allowed' : 'pointer',
                        opacity: (c.usuarios > 0 || c.territorios > 0) ? 0.5 : 1,
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                )}
                {aberta && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F5F5F5', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {membros.length === 0 ? (
                      <span style={{ fontSize: 13, color: '#AAAAAA' }}>Ninguém nessa congregação ainda.</span>
                    ) : membros.map((m) => (
                      <div key={m.id} style={{ fontSize: 13, color: '#1A1A1A', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{m.nome}</span>
                        <span style={{ color: '#999' }}>{m.perfil}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {adicionando ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            autoFocus
            type="text"
            value={nomeNova}
            onChange={(e) => setNomeNova(e.target.value)}
            placeholder="Nome da nova congregação"
            style={estiloCampo}
          />
          <button
            onClick={() => void adicionar()}
            disabled={salvando}
            style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, background: '#3BAD68', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
          >
            Adicionar
          </button>
          <button
            onClick={() => { setAdicionando(false); setNomeNova('') }}
            style={{ padding: '10px 14px', fontSize: 13, background: '#F7F7F7', color: '#666', border: '1px solid #DDDDDD', borderRadius: 8, cursor: 'pointer', flexShrink: 0 }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdicionando(true)}
          style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 600, background: '#F0EEFF', color: '#6B3FD4', border: '1px solid #D9C6FF', borderRadius: 8, cursor: 'pointer' }}
        >
          + Nova congregação
        </button>
      )}
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
