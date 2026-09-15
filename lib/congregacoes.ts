import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Congregação tem uma tabela própria (ver migração congregacoes), mas o
// isolamento por congregação ainda funciona via texto livre em
// territorios.congregacao / usuarios.congregacao. Este hook junta os nomes
// cadastrados com os que já estão em uso, pra nunca esconder uma congregação
// que alguém já tem mas ainda não foi cadastrada na tabela.
export function useCongregacoesExistentes() {
  const [congregacoes, setCongregacoes] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [cong, t, u] = await Promise.all([
      supabase.from('congregacoes').select('nome'),
      supabase.from('territorios').select('congregacao'),
      supabase.from('usuarios').select('congregacao'),
    ])
    const valores = new Set<string>()
    for (const row of [...(cong.data ?? []), ...(t.data ?? []), ...(u.data ?? [])]) {
      const v = (('nome' in row ? row.nome : row.congregacao) ?? '').trim()
      if (v) valores.add(v)
    }
    setCongregacoes(Array.from(valores).sort((a, b) => a.localeCompare(b)))
    setCarregando(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  return { congregacoes, carregando, recarregar: carregar }
}

export interface CongregacaoCompleta {
  id: string
  nome: string
  cidade: string | null
  lat: number | null
  lng: number | null
  superintendente_id: string | null
  prazo_territorio_dias: number | null
  bloquear_territorio_vencido: boolean
  validacao_automatica: boolean
}

// Traz as linhas completas da tabela congregacoes (com id de verdade —
// nome sozinho não é único, pode ter mais de uma congregação com o mesmo
// nome em cidades diferentes). Usado no painel de administração e em
// qualquer tela que precise do prazo de território por congregação.
export function useCongregacoesCompletas() {
  const [congregacoes, setCongregacoes] = useState<CongregacaoCompleta[]>([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data } = await supabase.from('congregacoes').select('*').order('nome')
    setCongregacoes((data as CongregacaoCompleta[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  return { congregacoes, carregando, recarregar: carregar }
}

// Mapa nome-da-congregação → prazo em dias, pra telas que agrupam
// territórios por congregação e precisam do prazo de cada uma
// (territorios/usuarios ainda guardam a congregação como texto, não id).
export function useMapaPrazoPorCongregacao(prazoPadrao = 120) {
  const { congregacoes, carregando } = useCongregacoesCompletas()
  const mapa = new Map<string, number>()
  for (const c of congregacoes) {
    mapa.set(c.nome.trim().toLowerCase(), c.prazo_territorio_dias ?? prazoPadrao)
  }
  function prazoDe(nomeCongregacao: string | null | undefined) {
    const chave = (nomeCongregacao ?? '').trim().toLowerCase()
    return mapa.get(chave) ?? prazoPadrao
  }
  return { prazoDe, carregando }
}

// Mapa nome-da-congregação → se marcação de quadra já entra aprovada
// (sem passar pela fila de "Validar marcações").
export function useValidacaoAutomaticaPorCongregacao() {
  const { congregacoes, carregando } = useCongregacoesCompletas()
  const mapa = new Map<string, boolean>()
  for (const c of congregacoes) {
    mapa.set(c.nome.trim().toLowerCase(), c.validacao_automatica)
  }
  function validacaoAutomaticaDe(nomeCongregacao: string | null | undefined) {
    const chave = (nomeCongregacao ?? '').trim().toLowerCase()
    return mapa.get(chave) ?? false
  }
  return { validacaoAutomaticaDe, carregando }
}
