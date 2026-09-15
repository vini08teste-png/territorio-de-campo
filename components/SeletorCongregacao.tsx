'use client'

import { useState } from 'react'
import { useCongregacoesExistentes } from '@/lib/congregacoes'

interface Props {
  valor: string
  onChange: (valor: string) => void
  style?: React.CSSProperties
}

const NOVA = '__nova__'

export default function SeletorCongregacao({ valor, onChange, style }: Props) {
  const { congregacoes, carregando } = useCongregacoesExistentes()
  const [modoNova, setModoNova] = useState(false)

  const baseStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', fontSize: 15,
    border: '1px solid #DDDDDD', borderRadius: 8, background: '#FAFAFA', color: '#1A1A1A',
    boxSizing: 'border-box',
    ...style,
  }

  if (modoNova || (!carregando && congregacoes.length > 0 && valor && !congregacoes.includes(valor))) {
    return (
      <div>
        <input
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nome da congregação"
          style={baseStyle}
        />
        {congregacoes.length > 0 && (
          <button
            type="button"
            onClick={() => { setModoNova(false); onChange('') }}
            style={{ marginTop: 6, fontSize: 12, color: '#378ADD', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            ← Escolher entre as congregações existentes
          </button>
        )}
      </div>
    )
  }

  return (
    <select
      value={valor || ''}
      onChange={(e) => {
        if (e.target.value === NOVA) { setModoNova(true); onChange(''); return }
        onChange(e.target.value)
      }}
      style={baseStyle}
    >
      <option value="">— Selecione a congregação —</option>
      {congregacoes.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={NOVA}>+ Nova congregação…</option>
    </select>
  )
}
