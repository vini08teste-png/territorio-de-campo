// Reenvia a fila offline (fila.ts) contra o Supabase, em ordem de criação.
// Roda quando a internet volta e ao abrir o app. Diferencia falha de rede
// (para e tenta depois) de rejeição do servidor (RLS/validação — não adianta
// insistir pra sempre, então descarta depois de algumas tentativas).

import { listarFila, removerDaFila, atualizarTentativas } from './fila'
import { aplicarOp } from './aplicadores'

const MAX_TENTATIVAS = 5
let rodando = false

export interface ResultadoSync {
  enviadas: number
  rejeitadas: number
  pendentes: number
}

export async function sincronizar(): Promise<ResultadoSync> {
  const resultado: ResultadoSync = { enviadas: 0, rejeitadas: 0, pendentes: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    resultado.pendentes = (await listarFila()).length
    return resultado
  }
  if (rodando) return resultado
  rodando = true
  try {
    const itens = await listarFila()
    for (const item of itens) {
      let erroServidor: string | null
      try {
        erroServidor = await aplicarOp(item)
      } catch {
        // Falha de rede: para aqui, o resto continua na fila pra próxima vez.
        break
      }
      if (erroServidor === null) {
        await removerDaFila(item.id)
        resultado.enviadas++
      } else {
        const tentativas = item.tentativas + 1
        if (tentativas >= MAX_TENTATIVAS) {
          await removerDaFila(item.id)
          resultado.rejeitadas++
        } else {
          await atualizarTentativas(item.id, tentativas)
        }
      }
    }
    resultado.pendentes = (await listarFila()).length
  } finally {
    rodando = false
  }
  return resultado
}
