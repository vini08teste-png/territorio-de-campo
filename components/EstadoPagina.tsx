export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
      <p style={{ color: '#666', fontSize: 16 }}>{texto}</p>
    </div>
  )
}

export function SemPermissao() {
  return (
    <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <p style={{ fontSize: 17, color: '#1A1A1A', fontWeight: 600, margin: 0 }}>Acesso restrito</p>
      <p style={{ fontSize: 15, color: '#888', marginTop: 6 }}>
        Você não tem permissão para ver esta página.
      </p>
    </div>
  )
}
