// Fila de escrita offline, guardada em IndexedDB. Quando o usuário marca uma
// quadra ou anota um ponto sem sinal, a operação entra aqui e é reenviada
// quando a internet volta (ver sincronizar.ts). IndexedDB cru (sem Dexie) pra
// não adicionar dependência num repo editado por várias pessoas.

export type OpTipo = 'marcar_quadra' | 'ponto_parada'

export interface OpFila {
  id: string
  tipo: OpTipo
  payload: Record<string, unknown>
  fotoBlob?: Blob | null
  criadoEm: number
  tentativas: number
}

const DB_NOME = 'territorio-offline'
const DB_VERSAO = 1
const STORE = 'fila'

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function comStore<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, modo)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  }))
}

function novoId(): string {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

export async function enfileirar(item: { tipo: OpTipo; payload: Record<string, unknown>; fotoBlob?: Blob | null }): Promise<void> {
  const op: OpFila = {
    id: novoId(),
    tipo: item.tipo,
    payload: item.payload,
    fotoBlob: item.fotoBlob ?? null,
    criadoEm: Date.now(),
    tentativas: 0,
  }
  await comStore('readwrite', (s) => s.add(op))
  emitirMudanca()
}

export async function listarFila(): Promise<OpFila[]> {
  const todas = await comStore<OpFila[]>('readonly', (s) => s.getAll() as IDBRequest<OpFila[]>)
  return (todas ?? []).sort((a, b) => a.criadoEm - b.criadoEm)
}

export async function removerDaFila(id: string): Promise<void> {
  await comStore('readwrite', (s) => s.delete(id))
  emitirMudanca()
}

export async function atualizarTentativas(id: string, tentativas: number): Promise<void> {
  const atual = await comStore<OpFila | undefined>('readonly', (s) => s.get(id) as IDBRequest<OpFila | undefined>)
  if (!atual) return
  await comStore('readwrite', (s) => s.put({ ...atual, tentativas }))
}

export async function contarFila(): Promise<number> {
  try {
    return await comStore<number>('readonly', (s) => s.count())
  } catch {
    return 0
  }
}

// ── Notificação de mudança (pra badge de "N pendentes" atualizar) ────────────
type Ouvinte = () => void
const ouvintes = new Set<Ouvinte>()

export function aoMudarFila(cb: Ouvinte): () => void {
  ouvintes.add(cb)
  return () => ouvintes.delete(cb)
}

export function emitirMudanca(): void {
  ouvintes.forEach((cb) => { try { cb() } catch { /* ignora ouvinte quebrado */ } })
}
