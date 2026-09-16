// Executa uma operação de campo contra o Supabase. Usado nos dois caminhos:
// envio imediato (online) e reenvio da fila (quando o sinal volta). Convenção:
// retorna a mensagem de erro do Supabase (rejeição de verdade, ex.: RLS/validação)
// ou null se deu certo; e PROPAGA (throw) se foi falha de rede — assim o
// sincronizador sabe diferenciar "servidor recusou" de "sem sinal, tenta depois".

import { supabase } from '@/lib/supabase'
import type { OpFila } from './fila'

export interface PayloadMarcarQuadra {
  quadraId: string
  usuarioId: string
  status: string
  validadoPor?: string | null
}

export interface PayloadPontoParada {
  quadraId: string
  usuarioId: string
  lat: number
  lng: number
  observacao: string
  idioma: string | null
  qtdPessoas: number | null
  fotoUrl?: string | null
}

export async function aplicarMarcarQuadra(p: PayloadMarcarQuadra): Promise<string | null> {
  const up = await supabase.from('quadras').update({ status: p.status }).eq('id', p.quadraId)
  if (up.error) return up.error.message
  const ins = await supabase.from('marcacoes').insert({
    quadra_id: p.quadraId,
    usuario_id: p.usuarioId,
    status: p.status,
    ...(p.validadoPor ? { validado_por: p.validadoPor } : {}),
  })
  if (ins.error) return ins.error.message
  return null
}

async function subirFoto(usuarioId: string, blob: Blob): Promise<string | null> {
  const ext = blob.type.split('/')[1] || 'jpg'
  const caminho = `pontos/${usuarioId}-${Date.now()}.${ext}`
  const up = await supabase.storage.from('territorios').upload(caminho, blob, { cacheControl: '3600', upsert: false })
  if (up.error) return null // sem foto é melhor que travar o ponto inteiro
  return supabase.storage.from('territorios').getPublicUrl(caminho).data.publicUrl
}

export async function aplicarPontoParada(p: PayloadPontoParada, fotoBlob?: Blob | null): Promise<string | null> {
  let fotoUrl = p.fotoUrl ?? null
  if (!fotoUrl && fotoBlob) fotoUrl = await subirFoto(p.usuarioId, fotoBlob)
  const ins = await supabase.from('pontos_parada').insert({
    quadra_id: p.quadraId,
    usuario_id: p.usuarioId,
    lat: p.lat,
    lng: p.lng,
    observacao: p.observacao,
    idioma: p.idioma,
    qtd_pessoas: p.qtdPessoas,
    foto: fotoUrl,
  })
  if (ins.error) return ins.error.message
  return null
}

// Aplica uma op vinda da fila (reenvio). Retorna erro do Supabase (null se ok);
// propaga em falha de rede.
export async function aplicarOp(op: OpFila): Promise<string | null> {
  if (op.tipo === 'marcar_quadra') {
    return aplicarMarcarQuadra(op.payload as unknown as PayloadMarcarQuadra)
  }
  return aplicarPontoParada(op.payload as unknown as PayloadPontoParada, op.fotoBlob)
}
