// Verificação em 2 etapas (MFA/TOTP) — app autenticador tipo Google
// Authenticator, Authy ou o gerenciador de senhas do celular.
//
// Quem é obrigado: admin (ver PERFIS_COM_MFA_OBRIGATORIA). Quem não é obrigado
// pode ativar se quiser, e aí passa a precisar do código também.
//
// O bloqueio de verdade está no banco (migration 20260917130000): a RLS só
// libera os dados para token de nível "aal2" — o que sai depois do código.
// O que tem aqui é a parte do app: pedir o código no login e cadastrar o
// autenticador.

import { supabase, type Perfil } from './supabase'

export const PERFIS_COM_MFA_OBRIGATORIA: Perfil[] = ['admin']

export function mfaObrigatoria(perfil: Perfil | null | undefined): boolean {
  return !!perfil && PERFIS_COM_MFA_OBRIGATORIA.includes(perfil)
}

export interface SituacaoMfa {
  /** Já tem autenticador cadastrado e confirmado. */
  temFator: boolean
  /** Tem autenticador, mas esta sessão ainda não passou pelo código. */
  precisaCodigo: boolean
  /** É obrigado a usar 2 etapas e ainda não cadastrou. */
  precisaCadastrar: boolean
}

export async function situacaoMfa(perfil: Perfil | null | undefined): Promise<SituacaoMfa> {
  const [{ data: nivel }, { data: fatores }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ])

  const temFator = (fatores?.totp?.length ?? 0) > 0
  return {
    temFator,
    precisaCodigo: nivel?.nextLevel === 'aal2' && nivel?.currentLevel !== 'aal2',
    precisaCadastrar: mfaObrigatoria(perfil) && !temFator,
  }
}

export interface CadastroMfa {
  fatorId: string
  /** Imagem do QR Code (data URI) pra ler no app autenticador. */
  qrCode: string
  /** Mesmo segredo em texto, pra quem preferir digitar. */
  segredo: string
}

/** Passo 1 do cadastro: gera o QR Code. Só vale depois de confirmar o código. */
export async function iniciarCadastroMfa(apelido = 'Território de Campo'): Promise<CadastroMfa> {
  // Tentativas anteriores que ficaram pela metade travam o nome/apelido.
  const { data: fatores } = await supabase.auth.mfa.listFactors()
  for (const fator of fatores?.all ?? []) {
    if (fator.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: fator.id })
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `${apelido} ${new Date().toISOString().slice(0, 10)}`,
  })
  if (error) throw error
  return { fatorId: data.id, qrCode: data.totp.qr_code, segredo: data.totp.secret }
}

/** Passo 2 do cadastro: confirma o código do app e ativa as 2 etapas. */
export async function confirmarCadastroMfa(fatorId: string, codigo: string): Promise<void> {
  await verificarCodigo(fatorId, codigo)
}

/** Login: valida o código do autenticador e eleva a sessão para "aal2". */
export async function verificarCodigoLogin(codigo: string): Promise<void> {
  const { data: fatores, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  const fator = fatores?.totp?.[0]
  if (!fator) throw new Error('Nenhum autenticador cadastrado nesta conta.')
  await verificarCodigo(fator.id, codigo)
}

async function verificarCodigo(fatorId: string, codigo: string): Promise<void> {
  const { data: desafio, error: erroDesafio } = await supabase.auth.mfa.challenge({ factorId: fatorId })
  if (erroDesafio) throw erroDesafio

  const { error } = await supabase.auth.mfa.verify({
    factorId: fatorId,
    challengeId: desafio.id,
    code: codigo.replace(/\s/g, ''),
  })
  if (error) throw error
}

/** Remove o autenticador (exige sessão já verificada — nível "aal2"). */
export async function removerMfa(): Promise<void> {
  const { data: fatores, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  for (const fator of fatores?.all ?? []) {
    const { error: erroRemover } = await supabase.auth.mfa.unenroll({ factorId: fator.id })
    if (erroRemover) throw erroRemover
  }
}
