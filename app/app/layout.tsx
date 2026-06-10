'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase, CORES_PERFIL, type Usuario } from '@/lib/supabase'
import { logout } from '@/lib/auth'
import { AcessoNegadoToast } from '@/components/AcessoNegadoToast'
import { Suspense } from 'react'

// ── SVG Icons de linha fina ───────────────────────────────────────────────────
const ICONS: Record<string, React.ReactNode> = {
  mapa: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  ),
  territorios: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5"/>
    </svg>
  ),
  designar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  analise: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  perfil: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  historico: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  validar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  relatorio: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  usuarios: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  logs: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  configuracoes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  sair: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
}

function getNavItems(perfil: string) {
  const todos: Record<string, { href: string; icone: string; label: string }[]> = {
    dirigente: [
      { href: '/app',           icone: 'mapa',      label: 'Mapa' },
      { href: '/app/historico', icone: 'historico', label: 'Histórico' },
      { href: '/app/perfil',    icone: 'perfil',    label: 'Perfil' },
    ],
    superintendente_grupo: [
      { href: '/app',           icone: 'mapa',      label: 'Mapa' },
      { href: '/app/validar',   icone: 'validar',   label: 'Validar' },
      { href: '/app/designar',  icone: 'designar',  label: 'Designar' },
      { href: '/app/relatorio', icone: 'relatorio', label: 'Relatório' },
      { href: '/app/perfil',    icone: 'perfil',    label: 'Perfil' },
    ],
    superintendente_territorio: [
      { href: '/app',             icone: 'mapa',          label: 'Mapa' },
      { href: '/app/territorios', icone: 'territorios',   label: 'Territórios' },
      { href: '/app/designar',    icone: 'designar',      label: 'Designar' },
      { href: '/app/analise',     icone: 'analise',       label: 'Análise' },
      { href: '/app/perfil',      icone: 'perfil',        label: 'Perfil' },
    ],
    admin: [
      { href: '/app/usuarios',      icone: 'usuarios',      label: 'Usuários' },
      { href: '/app/logs',          icone: 'logs',          label: 'Logs' },
      { href: '/app/configuracoes', icone: 'configuracoes', label: 'Configurações' },
      { href: '/app/perfil',        icone: 'perfil',        label: 'Perfil' },
    ],
  }
  return todos[perfil] ?? []
}

const LABEL_PERFIL: Record<string, string> = {
  dirigente: 'Dirigente',
  superintendente_grupo: 'Sup. de Grupo',
  superintendente_territorio: 'Sup. de Território',
  admin: 'Administrador',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [congregacao, setCongregacao] = useState<string>('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('usuarios').select('*').eq('id', user.id).single()
      setUsuario(data)
    })

    // Buscar nome da congregação
    supabase.from('configuracoes').select('nome_congregacao').eq('id', 1).single()
      .then(({ data }) => { if (data?.nome_congregacao) setCongregacao(data.nome_congregacao) })
  }, [router])

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  if (!usuario) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F7F7F7', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 36 }}>🗺️</div>
      <p style={{ fontSize: 16, color: '#888' }}>Carregando…</p>
    </div>
  )

  const cores = CORES_PERFIL[usuario.perfil]
  const navItems = getNavItems(usuario.perfil)
  const iniciais = usuario.nome.split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()

  // ── Mobile ─────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F7F7F7' }}>
        <Suspense><AcessoNegadoToast /></Suspense>
        <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {children}
        </main>
        <nav style={{
          background: '#FFFFFF', borderTop: '0.5px solid #EEEEEE',
          display: 'flex', zIndex: 100,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {navItems.map((item) => {
            const ativo = pathname === item.href
            return (
              <Link key={item.href} href={item.href} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '10px 4px', textDecoration: 'none', gap: 3,
                borderTop: ativo ? `2px solid ${cores.acento}` : '2px solid transparent',
              }}>
                <span style={{ color: ativo ? cores.acento : "#AAAAAA" }}>{ICONS[item.icone]}</span>
                <span style={{ fontSize: 11, fontWeight: ativo ? 600 : 400, color: ativo ? cores.acento : '#AAAAAA' }}>
                  {item.label}
                </span>
              </Link>
            )
          })}
          <button onClick={() => void handleLogout()} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '10px 4px', gap: 3,
            background: 'none', border: 'none',
            borderTop: '2px solid transparent', cursor: 'pointer',
          }}>
            <span style={{ color: "#AAAAAA" }}>{ICONS.sair}</span>
            <span style={{ fontSize: 11, color: '#AAAAAA' }}>Sair</span>
          </button>
        </nav>
      </div>
    )
  }

  // ── Desktop ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F7F7F7' }}>
      <Suspense><AcessoNegadoToast /></Suspense>

      <aside style={{
        width: 240,
        flexShrink: 0,
        background: '#FFFFFF',
        borderRight: '0.5px solid #EEEEEE',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
      }}>

        {/* Cabeçalho */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '0.5px solid #EEEEEE' }}>
          {/* Nome da congregação */}
          {congregacao && (
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#AAAAAA',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 10,
            }}>
              {congregacao}
            </div>
          )}

          {/* Avatar + nome */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: cores.bg, border: `1.5px solid ${cores.acento}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, color: cores.texto,
            }}>
              {iniciais}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 700, color: '#1A1A1A',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {usuario.nome}
              </div>
              <div style={{ fontSize: 12, color: '#AAAAAA', marginTop: 1 }}>
                {LABEL_PERFIL[usuario.perfil] ?? usuario.perfil}
              </div>
            </div>
          </div>

          {/* Badge perfil */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 20,
            background: cores.bg, border: `1px solid ${cores.acento}`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cores.acento, display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: cores.texto }}>
              {LABEL_PERFIL[usuario.perfil] ?? usuario.perfil}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {navItems.map((item) => {
            const ativo = pathname === item.href
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 12px', borderRadius: 10, marginBottom: 2,
                fontSize: 15, fontWeight: ativo ? 600 : 400,
                color: ativo ? cores.texto : '#555',
                textDecoration: 'none',
                background: ativo ? cores.bg : 'transparent',
                borderLeft: ativo ? `3px solid ${cores.acento}` : '3px solid transparent',
                transition: 'all 0.15s',
              }}>
                <span style={{ flexShrink: 0, color: ativo ? cores.acento : '#888' }}>{ICONS[item.icone]}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Rodapé */}
        <div style={{ padding: '12px 10px 20px', borderTop: '0.5px solid #EEEEEE' }}>
          <button onClick={() => void handleLogout()} style={{
            width: '100%', padding: '11px 12px',
            display: 'flex', alignItems: 'center', gap: 12,
            fontSize: 15, color: '#888',
            background: 'transparent', border: '0.5px solid #EEEEEE',
            borderRadius: 10, cursor: 'pointer',
          }}>
            <span style={{ color: "#888" }}>{ICONS.sair}</span>
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {children}
      </main>
    </div>
  )
}
