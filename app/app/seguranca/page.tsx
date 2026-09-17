'use client'

// Tela de cadastro da verificação em 2 etapas. Admin é obrigado a passar por
// aqui antes de usar o resto do app (o layout redireciona pra cá); os outros
// perfis podem ativar se quiserem.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase, type Usuario } from '@/lib/supabase'
import {
  confirmarCadastroMfa, iniciarCadastroMfa, mfaObrigatoria, removerMfa,
  situacaoMfa, verificarCodigoLogin, type CadastroMfa, type SituacaoMfa,
} from '@/lib/mfa'

export default function SegurancaPage() {
  const router = useRouter()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [situacao, setSituacao] = useState<SituacaoMfa | null>(null)
  const [cadastro, setCadastro] = useState<CadastroMfa | null>(null)
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const recarregar = useCallback(async (perfil?: Usuario['perfil']) => {
    setSituacao(await situacaoMfa(perfil ?? usuario?.perfil))
  }, [usuario?.perfil])

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      // A própria linha em usuarios segue legível mesmo antes das 2 etapas.
      const { data } = await supabase.from('usuarios').select('*').eq('id', session.user.id).single()
      setUsuario(data)
      await recarregar(data?.perfil)
    })()
  }, [router, recarregar])

  async function comecar() {
    setErro(''); setAviso(''); setOcupado(true)
    try {
      setCadastro(await iniciarCadastroMfa())
    } catch (e) {
      setErro(mensagem(e))
    }
    setOcupado(false)
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setOcupado(true)
    try {
      if (cadastro) {
        await confirmarCadastroMfa(cadastro.fatorId, codigo)
        setCadastro(null)
        setAviso('✅ Verificação em 2 etapas ativada.')
      } else {
        await verificarCodigoLogin(codigo)
        setAviso('✅ Código confirmado.')
      }
      setCodigo('')
      await recarregar()
    } catch {
      setErro('Código inválido ou expirado. Confira o app autenticador e tente de novo.')
    }
    setOcupado(false)
  }

  async function desativar() {
    if (!confirm('Desativar a verificação em 2 etapas desta conta?')) return
    setErro(''); setAviso(''); setOcupado(true)
    try {
      await removerMfa()
      setAviso('Verificação em 2 etapas desativada.')
      await recarregar()
    } catch (e) {
      setErro(mensagem(e))
    }
    setOcupado(false)
  }

  if (!usuario || !situacao) return <p style={{ padding: 24, color: '#888' }}>Carregando...</p>

  const obrigatoria = mfaObrigatoria(usuario.perfil)
  const pedindoCodigo = situacao.precisaCodigo || !!cadastro

  return (
    <div style={{ padding: 24, maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>🔐 Verificação em 2 etapas</h1>
      <p style={{ color: '#666', fontSize: 15, marginBottom: 24 }}>
        Além da senha, entrar passa a pedir um código de 6 dígitos que muda a cada 30 segundos
        no seu app autenticador. Assim, só a senha não basta pra alguém entrar na sua conta.
      </p>

      {obrigatoria && !situacao.temFator && (
        <Faixa cor="aviso">
          Sua conta é de administrador: o cadastro é obrigatório. Até concluir, o app não mostra
          territórios, usuários nem relatórios.
        </Faixa>
      )}

      {erro && <Faixa cor="erro">{erro}</Faixa>}
      {aviso && <Faixa cor="ok">{aviso}</Faixa>}

      {/* Situação atual */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          {situacao.temFator ? '✅ Ativada nesta conta' : '⚠️ Não ativada'}
        </div>
        <div style={{ fontSize: 14, color: '#666' }}>
          {situacao.temFator
            ? situacao.precisaCodigo
              ? 'Falta digitar o código nesta sessão.'
              : 'Esta sessão já foi verificada.'
            : obrigatoria
              ? 'Cadastre o app autenticador para continuar usando o app.'
              : 'Opcional para o seu perfil, mas recomendado.'}
        </div>
      </div>

      {/* Passo 1: QR Code */}
      {cadastro && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>1. Leia o QR Code</h2>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>
            Abra o app autenticador (Google Authenticator, Authy, ou o próprio gerenciador de
            senhas do celular), escolha “adicionar conta” e aponte a câmera:
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Image src={cadastro.qrCode} alt="QR Code da verificação em 2 etapas" width={200} height={200} unoptimized />
          </div>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>
            Sem câmera? Cadastre este código manualmente:
          </p>
          <code style={{
            display: 'block', wordBreak: 'break-all', background: '#F5F5F5',
            padding: '10px 12px', borderRadius: 8, fontSize: 13,
          }}>
            {cadastro.segredo}
          </code>
        </div>
      )}

      {/* Passo 2: confirmar o código */}
      {pedindoCodigo ? (
        <form onSubmit={confirmar} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            {cadastro ? '2. Confirme o código' : 'Digite o código'}
          </h2>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            required
            style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: 700 }}
          />
          <button type="submit" className="btn-grande btn-azul" disabled={ocupado || codigo.length < 6}>
            {ocupado ? 'Verificando…' : '🔐 Confirmar'}
          </button>
        </form>
      ) : situacao.temFator ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn-grande btn-azul" onClick={() => router.push('/app')}>Ir para o mapa</button>
          {!obrigatoria && (
            <button className="btn-grande" onClick={() => void desativar()} disabled={ocupado}
              style={{ background: '#FFF0F0', color: '#E05050', border: '1px solid #FFCCCC' }}>
              Desativar verificação em 2 etapas
            </button>
          )}
        </div>
      ) : (
        <button className="btn-grande btn-azul" onClick={() => void comecar()} disabled={ocupado}>
          {ocupado ? 'Gerando…' : '🔐 Cadastrar app autenticador'}
        </button>
      )}

      <p style={{ marginTop: 20, fontSize: 13, color: '#999' }}>
        Perdeu o celular? Um administrador precisa remover o autenticador da sua conta no painel
        do Supabase (Authentication → Users) para você cadastrar outro.
      </p>
    </div>
  )
}

function Faixa({ cor, children }: { cor: 'ok' | 'erro' | 'aviso'; children: React.ReactNode }) {
  const estilos = {
    ok: { background: '#B8EAC8', color: '#04342C' },
    erro: { background: '#FFB3B3', color: '#501313' },
    aviso: { background: '#FFE0A0', color: '#412402' },
  }[cor]
  return (
    <div style={{ ...estilos, padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
      {children}
    </div>
  )
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : 'Não foi possível concluir. Tente de novo.'
}
