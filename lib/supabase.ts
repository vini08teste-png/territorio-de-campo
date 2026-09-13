import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

export type Perfil = 'admin' | 'superintendente_territorio' | 'superintendente_grupo' | 'dirigente'

export type Usuario = {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  criado_em: string
}

export type Territorio = {
  id: string
  nome: string
  numero: string
  bairro: string
  status: string
  geojson: Record<string, unknown> | null
  publicadores: number | null
  familias: number | null
  link_maps: string | null
  criado_por: string
  criado_em: string
}

export type Quadra = {
  id: string
  territorio_id: string
  nome: string
  status: 'nao_iniciado' | 'em_andamento' | 'parcial' | 'concluido' | 'pendente'
  geojson: Record<string, unknown>
  lados: Lado[]
  criado_em: string
}

export type Lado = {
  id: string
  quadra_id: string
  indice: number
  status: 'nao_iniciado' | 'em_andamento' | 'parcial' | 'concluido'
  inicio: [number, number]
  fim: [number, number]
}

export type Marcacao = {
  id: string
  quadra_id: string
  lado_id?: string
  usuario_id: string
  status: string
  validado_por?: string
  observacao?: string
  criado_em: string
}

export type PontoParada = {
  id: string
  quadra_id: string
  lado_id?: string
  usuario_id: string
  lat: number
  lng: number
  endereco?: string
  observacao?: string
  criado_em: string
}

export type Designacao = {
  id: string
  usuario_id: string
  territorio_id: string
  quadra_id?: string
  data_inicio: string
  data_fim?: string
}

export const CORES_STATUS = {
  nao_iniciado: { fill: '#E0E0E0', stroke: '#9E9E9E', label: 'Não iniciado' },
  em_andamento: { fill: '#B3D9FF', stroke: '#378ADD', label: 'Em andamento' },
  parcial:      { fill: '#FFE0A0', stroke: '#F0A030', label: 'Parcial' },
  concluido:    { fill: '#B8EAC8', stroke: '#3BAD68', label: 'Concluído' },
  pendente:     { fill: '#FFB3B3', stroke: '#E05050', label: 'Pendente' },
}

export const CORES_PERFIL = {
  dirigente:                  { bg: '#FFF8E7', acento: '#F0C060', texto: '#412402', label: 'Dirigente' },
  superintendente_grupo:      { bg: '#E8F4FB', acento: '#70B8E0', texto: '#042C53', label: 'Sup. de Grupo' },
  superintendente_territorio: { bg: '#E8F7F0', acento: '#60C898', texto: '#04342C', label: 'Sup. de Território' },
  admin:                      { bg: '#F0EEFF', acento: '#A090E0', texto: '#26215C', label: 'Administrador' },
}