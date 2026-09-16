// Fachada das ações de campo pro Mapa. Cada função tenta enviar na hora se tem
// sinal; se está offline (ou a rede falha no meio), guarda na fila pra
// sincronizar depois. A UI otimista (mostrar a marcação/ponto na hora) fica por
// conta de quem chama — aqui só cuida do "grava agora ou guarda".

import { enfileirar } from './fila'
import {
  aplicarMarcarQuadra, aplicarPontoParada,
  type PayloadMarcarQuadra, type PayloadPontoParada,
} from './aplicadores'

export type ResultadoAcao =
  | { modo: 'online' }
  | { modo: 'offline' }
  | { modo: 'erro'; erro: string }

function semSinal(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export async function marcarQuadra(p: PayloadMarcarQuadra): Promise<ResultadoAcao> {
  if (semSinal()) {
    await enfileirar({ tipo: 'marcar_quadra', payload: p as unknown as Record<string, unknown> })
    return { modo: 'offline' }
  }
  try {
    const erro = await aplicarMarcarQuadra(p)
    if (erro) return { modo: 'erro', erro }
    return { modo: 'online' }
  } catch {
    // Estava "online" mas a rede caiu no meio: guarda em vez de perder.
    await enfileirar({ tipo: 'marcar_quadra', payload: p as unknown as Record<string, unknown> })
    return { modo: 'offline' }
  }
}

export async function salvarPontoParada(p: PayloadPontoParada, fotoBlob?: Blob | null): Promise<ResultadoAcao> {
  if (semSinal()) {
    await enfileirar({ tipo: 'ponto_parada', payload: p as unknown as Record<string, unknown>, fotoBlob })
    return { modo: 'offline' }
  }
  try {
    const erro = await aplicarPontoParada(p, fotoBlob)
    if (erro) return { modo: 'erro', erro }
    return { modo: 'online' }
  } catch {
    await enfileirar({ tipo: 'ponto_parada', payload: p as unknown as Record<string, unknown>, fotoBlob })
    return { modo: 'offline' }
  }
}
