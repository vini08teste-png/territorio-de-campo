'use client'

import { useEffect, useState } from 'react'
import { baixarTudoParaOffline, statusOffline } from '@/lib/offline/dadosOffline'

// Baixa territórios/quadras/pontos pro aparelho, pra o mapa funcionar sem sinal.
// Fica em Configurações; o usuário aperta antes de ir pra campo sem internet.
export default function BotaoSalvarOffline() {
  const [baixando, setBaixando] = useState(false)
  const [status, setStatus] = useState<{ quando: number; contagem: { territorios: number; quadras: number; pontos: number } } | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const m = () => setOnline(navigator.onLine)
    window.addEventListener('online', m); window.addEventListener('offline', m)
    void statusOffline().then(setStatus)
    return () => { window.removeEventListener('online', m); window.removeEventListener('offline', m) }
  }, [])

  async function salvar() {
    setBaixando(true); setMsg(null)
    try {
      const r = await baixarTudoParaOffline()
      if (!r.ok) { setMsg({ tipo: 'erro', texto: r.erro || 'Não foi possível baixar os dados.' }); return }
      setStatus({ quando: r.quando, contagem: r.contagem })
      setMsg({ tipo: 'ok', texto: `Salvo! ${r.contagem.territorios} territórios, ${r.contagem.quadras} quadras, ${r.contagem.pontos} pontos.` })
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Erro ao salvar.' })
    } finally {
      setBaixando(false)
    }
  }

  const quandoTexto = status
    ? new Date(status.quando).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ background: '#FFFFFF', border: '0.5px solid #EEEEEE', borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginTop: 0, marginBottom: 4 }}>
        Uso offline
      </h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: '1rem' }}>
        Baixa os territórios, quadras e pontos pro aparelho, pra o mapa funcionar sem internet no campo. Aperte antes de ir pra uma área sem sinal.
      </p>

      {status && (
        <p style={{ fontSize: 13, color: '#3BAD68', margin: '0 0 12px' }}>
          ✅ Dados salvos em {quandoTexto} — {status.contagem.territorios} territórios, {status.contagem.quadras} quadras.
        </p>
      )}

      {msg && (
        <div style={{
          fontSize: 13, borderRadius: 8, padding: '8px 12px', marginBottom: 12,
          background: msg.tipo === 'ok' ? '#EAF7EF' : '#FFF0F0',
          color: msg.tipo === 'ok' ? '#04342C' : '#501313',
          border: `1px solid ${msg.tipo === 'ok' ? '#60C898' : '#E05050'}`,
        }}>
          {msg.tipo === 'ok' ? '✅ ' : '⚠️ '}{msg.texto}
        </div>
      )}

      <button
        onClick={() => void salvar()}
        disabled={baixando || !online}
        title={!online ? 'Precisa de internet pra baixar os dados' : ''}
        style={{
          width: '100%', padding: '13px', fontSize: 15, fontWeight: 600,
          background: (baixando || !online) ? '#CCCCCC' : '#378ADD', color: '#fff',
          border: 'none', borderRadius: 10, cursor: (baixando || !online) ? 'not-allowed' : 'pointer',
        }}
      >
        {baixando ? '⏳ Baixando…' : !online ? '📴 Sem internet pra baixar' : '💾 Salvar para uso offline'}
      </button>
    </div>
  )
}
