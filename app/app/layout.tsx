'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase, CORES_PERFIL, type Usuario } from '@/lib/supabase'
import { logout } from '@/lib/auth'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [menuAberto, setMenuAberto] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const { data } = await supabase.from('usuarios').select('*').eq('id', session.user.id).single()
      setUsuario(data)
    })
  }, [router])

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  if (!usuario) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🗺️</div>
        <p style={{ fontSize: 18, color: '#3BAD68', marginTop: 12, fontWeight: 600 }}>Carregando...</p>
      </div>
    </div>
  )

  const cores = CORES_PERFIL[usuario.perfil]
  const navItems = getNavItems(usuario.perfil)
  const isDesktop = !isMobile

  // === MOBILE ===
  if (isMobile) {
    const navMobile = navItems.slice(0, 4)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#fff', overflow: 'hidden' }}>

        {/* Header mobile */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          background: '#fff',
          borderBottom: '1px solid #EEEEEE',
          flexShrink: 0,
          zIndex: 100,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🗺️</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: '#1A1A1A' }}>Território de Campo</span>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 18,
            background: cores.acento,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 15, color: cores.texto,
          }}>
            {usuario.nome.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Conteúdo — ocupa todo o espaço disponível */}
        <main style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {children}
        </main>

        {/* Barra de navegação inferior */}
        <div style={{
          display: 'flex',
          borderTop: '1px solid #EEEEEE',
          background: '#fff',
          flexShrink: 0,
          zIndex: 100,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {navMobile.map(item => {
            const ativo = pathname === item.href
            return (
              <Link key={item.href} href={item.href} style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '10px 4px',
                textDecoration: 'none',
                color: ativo ? cores.acento : '#999999',
                gap: 3,
                borderTop: ativo ? `2px solid ${cores.acento}` : '2px solid transparent',
                transition: 'color 0.15s',
              }}>
                <span style={{ fontSize: 22 }}>{item.icone}</span>
                <span style={{ fontSize: 11, fontWeight: ativo ? 700 : 500, whiteSpace: 'nowrap' }}>
                  {item.labelCurto || item.label}
                </span>
              </Link>
            )
          })}
          {/* Botão sair */}
          <button onClick={handleLogout} style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '10px 4px', gap: 3,
            border: 'none', background: 'none', cursor: 'pointer',
            color: '#999', borderTop: '2px solid transparent',
          }}>
            <span style={{ fontSize: 22 }}>🚪</span>
            <span style={{ fontSize: 11, fontWeight: 500 }}>Sair</span>
          </button>
        </div>
      </div>
    )
  }

  // === DESKTOP ===
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar desktop */}
      <div style={{
        width: 260,
        height: '100vh',
        background: '#fff',
        borderRight: '1px solid #EEEEEE',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #EEEEEE' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 28 }}>🗺️</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', lineHeight: 1.2 }}>Território<br/>de Campo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 18,
              background: cores.acento, color: cores.texto,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 15, flexShrink: 0,
            }}>
              {usuario.nome.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{usuario.nome}</div>
              <div style={{ fontSize: 12, color: '#888' }}>{cores.label}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {navItems.map(item => {
            const ativo = pathname === item.href
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 20px',
                fontSize: 15, fontWeight: ativo ? 700 : 500,
                color: ativo ? cores.texto : '#444',
                background: ativo ? cores.bg : 'transparent',
                borderLeft: ativo ? `3px solid ${cores.acento}` : '3px solid transparent',
                textDecoration: 'none',
                transition: 'background 0.12s',
              }}>
                <span style={{ fontSize: 18 }}>{item.icone}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Sair */}
        <div style={{ padding: 16, borderTop: '1px solid #EEEEEE' }}>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '12px 16px',
            background: 'none', border: '1px solid #EEEEEE',
            borderRadius: 8, cursor: 'pointer',
            fontSize: 15, fontWeight: 600, color: '#666',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            🚪 Sair
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <main style={{ flex: 1, overflow: 'auto', background: '#F7F7F7' }}>
        {children}
      </main>
    </div>
  )
}

function getNavItems(perfil: string) {
  const todos = {
    dirigente: [
      { href: '/app', icone: '🗺️', label: 'Meu mapa', labelCurto: 'Mapa' },
      { href: '/app/historico', icone: '📋', label: 'Histórico', labelCurto: 'Histórico' },
      { href: '/app/perfil', icone: '👤', label: 'Meu perfil', labelCurto: 'Perfil' },
    ],
    superintendente_grupo: [
      { href: '/app', icone: '🗺️', label: 'Mapa', labelCurto: 'Mapa' },
      { href: '/app/progresso', icone: '📊', label: 'Progresso', labelCurto: 'Progresso' },
      { href: '/app/validar', icone: '✅', label: 'Validar', labelCurto: 'Validar' },
      { href: '/app/perfil', icone: '👤', label: 'Perfil', labelCurto: 'Perfil' },
    ],
    superintendente_territorio: [
      { href: '/app', icone: '🗺️', label: 'Mapa geral', labelCurto: 'Mapa' },
      { href: '/app/territorios', icone: '📍', label: 'Territórios', labelCurto: 'Territórios' },
      { href: '/app/validar', icone: '✅', label: 'Validar', labelCurto: 'Validar' },
      { href: '/app/analise', icone: '📊', label: 'Análise', labelCurto: 'Análise' },
      { href: '/app/perfil', icone: '👤', label: 'Perfil', labelCurto: 'Perfil' },
    ],
    admin: [
      { href: '/app/usuarios', icone: '👥', label: 'Usuários', labelCurto: 'Usuários' },
      { href: '/app/usuarios/novo', icone: '➕', label: 'Novo usuário', labelCurto: 'Novo' },
      { href: '/app/logs', icone: '📋', label: 'Logs', labelCurto: 'Logs' },
      { href: '/app/configuracoes', icone: '⚙️', label: 'Configurações', labelCurto: 'Config' },
      { href: '/app/perfil', icone: '👤', label: 'Perfil', labelCurto: 'Perfil' },
    ],
  }
  return todos[perfil as keyof typeof todos] || []
}
