// Armazenamento dos dados de leitura pra uso offline (IndexedDB). Diferente do
// cache automático do service worker (que só guarda o que foi visitado e casa
// por URL exata), aqui o usuário aperta "Salvar para uso offline" e a gente
// baixa tudo que o campo precisa de uma vez. O mapa lê daqui quando sem sinal.

import { supabase } from '@/lib/supabase'

const DB_NOME = 'territorio-dados'
const DB_VERSAO = 1
const STORE = 'dados'
const CHAVE = 'tudo'

export interface DadosOffline {
  usuario: unknown | null
  territorios: unknown[]
  quadras: unknown[]
  pontos: unknown[]
  congregacoes: unknown[]
  quando: number
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function salvarTudo(dados: DadosOffline): Promise<void> {
  const db = await abrir()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(dados, CHAVE)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => reject(tx.error)
  })
}

async function lerTudo(): Promise<DadosOffline | null> {
  try {
    const db = await abrir()
    return await new Promise<DadosOffline | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(CHAVE)
      req.onsuccess = () => { db.close(); resolve((req.result as DadosOffline) ?? null) }
      req.onerror = () => reject(req.error)
    })
  } catch { return null }
}

// Atualiza uma fatia do pacote offline (usado pelo mapa: online busca e já
// deixa salvo pro offline seguinte).
async function atualizarFatia(fatia: Partial<DadosOffline>): Promise<void> {
  const atual = (await lerTudo()) ?? { usuario: null, territorios: [], quadras: [], pontos: [], congregacoes: [], quando: 0 }
  await salvarTudo({ ...atual, ...fatia })
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

// ── Baixar tudo (botão "Salvar para uso offline") ────────────────────────────
export interface ResultadoDownload {
  ok: boolean
  quando: number
  contagem: { territorios: number; quadras: number; pontos: number }
  erro?: string
}

export async function baixarTudoParaOffline(): Promise<ResultadoDownload> {
  const vazio = { territorios: 0, quadras: 0, pontos: 0 }
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return { ok: false, quando: 0, contagem: vazio, erro: 'Sessão não encontrada.' }

  const [usuarioRes, terr, quad, pontos, cong] = await Promise.all([
    supabase.from('usuarios').select('*').eq('id', user.id).single(),
    supabase.from('territorios').select('id, nome, numero, geojson, link_maps, cor, congregacao').order('numero'),
    supabase.from('quadras').select('*'),
    supabase.from('pontos_parada').select('*, usuario:usuario_id(nome)').order('criado_em', { ascending: false }),
    supabase.from('congregacoes').select('*'),
  ])

  if (terr.error || quad.error) {
    return { ok: false, quando: 0, contagem: vazio, erro: (terr.error || quad.error)!.message }
  }

  const quando = Date.now()
  await salvarTudo({
    usuario: usuarioRes.data ?? null,
    territorios: terr.data ?? [],
    quadras: quad.data ?? [],
    pontos: pontos.data ?? [],
    congregacoes: cong.data ?? [],
    quando,
  })

  return {
    ok: true,
    quando,
    contagem: {
      territorios: (terr.data ?? []).length,
      quadras: (quad.data ?? []).length,
      pontos: (pontos.data ?? []).length,
    },
  }
}

export async function statusOffline(): Promise<{ quando: number; contagem: { territorios: number; quadras: number; pontos: number } } | null> {
  const d = await lerTudo()
  if (!d || !d.quando) return null
  return { quando: d.quando, contagem: { territorios: d.territorios.length, quadras: d.quadras.length, pontos: d.pontos.length } }
}

// ── Leitura usada pelo mapa: online busca+salva, offline lê do que foi salvo ──
export async function obterUsuario(userId: string): Promise<any> {
  if (online()) {
    const { data } = await supabase.from('usuarios').select('*').eq('id', userId).single()
    if (data) { await atualizarFatia({ usuario: data }); return data }
  }
  const d = await lerTudo()
  return d?.usuario ?? null
}

export async function obterTerritorios(): Promise<any[]> {
  if (online()) {
    const { data } = await supabase.from('territorios')
      .select('id, nome, numero, geojson, link_maps, cor, congregacao').order('numero')
    if (data) { await atualizarFatia({ territorios: data }); return data }
  }
  return (await lerTudo())?.territorios as any[] ?? []
}

/** O PostgREST corta a resposta em 1000 linhas. Com mais quadras que isso, as
    excedentes simplesmente não vinham — e sumiam do mapa. Busca por páginas. */
const PAGINA = 1000

export async function obterQuadras(): Promise<any[]> {
  if (online()) {
    const todas: any[] = []
    for (let inicio = 0; ; inicio += PAGINA) {
      const { data, error } = await supabase.from('quadras').select('*').range(inicio, inicio + PAGINA - 1)
      if (error) break
      todas.push(...(data ?? []))
      if (!data || data.length < PAGINA) {
        await atualizarFatia({ quadras: todas })
        return todas
      }
    }
  }
  return (await lerTudo())?.quadras as any[] ?? []
}

export async function obterPontos(): Promise<any[]> {
  if (online()) {
    const { data } = await supabase.from('pontos_parada')
      .select('*, usuario:usuario_id(nome)').order('criado_em', { ascending: false })
    if (data) { await atualizarFatia({ pontos: data }); return data }
  }
  return (await lerTudo())?.pontos as any[] ?? []
}
