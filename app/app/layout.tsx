'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase, CORES_PERFIL, type Usuario } from '@/lib/supabase'
import { logout } from '@/lib/auth'
import React from 'react'
// ─── Ícones SVG minimalistas (stroke only) ────────────────────────────────────

function IconMapa({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  )
}

function IconHistorico({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="12" y2="16" />
    </svg>
  )
}

function IconPerfil({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

function IconProgresso({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="20" x2="4" y2="14" />
      <line x1="9" y1="20" x2="9" y2="10" />
      <line x1="14" y1="20" x2="14" y2="13" />
      <line x1="19" y1="20" x2="19" y2="6" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  )
}

function IconValidar({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function IconTerritorios({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  )
}

function IconAnalise({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="22" y2="22" />
      <line x1="8" y1="11" x2="14" y2="11" />
      <line x1="11" y1="8" x2="11" y2="14" />
    </svg>
  )
}

function IconUsuarios({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
      <path d="M16 3.5a3.5 3.5 0 0 1 0 7" />
      <path d="M22 20c0-3.5-2.5-5.5-6-6" />
    </svg>
  )
}

function IconNovoUsuario({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="8" r="4" />
      <path d="M2 20c0-4 3.6-7 8-7" />
      <line x1="18" y1="13" x2="18" y2="21" />
      <line x1="14" y1="17" x2="22" y2="17" />
    </svg>
  )
}

function IconLogs({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="7" y1="8" x2="17" y2="8" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="7" y1="16" x2="13" y2="16" />
    </svg>
  )
}

function IconConfig({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconSair({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// ─── Mapa de ícones por chave ─────────────────────────────────────────────────

const ICONES: Record<string, (props: { size?: number; color?: string }) => React.ReactElement > = {
  mapa: IconMapa,
  historico: IconHistorico,
  perfil: IconPerfil,
  progresso: IconProgresso,
  validar: IconValidar,
  territorios: IconTerritorios,
  analise: IconAnalise,
  usuarios: IconUsuarios,
  novo_usuario: IconNovoUsuario,
  logs: IconLogs,
  config: IconConfig,
  sair: IconSair,
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
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
        <IconMapa size={40} color="#3BAD68" />
        <p style={{ fontSize: 16, color: '#3BAD68', marginTop: 12, fontWeight: 600 }}>Carregando...</p>
      </div>
    </div>
  )

  const cores = CORES_PERFIL[usuario.perfil]
  const navItems = getNavItems(usuario.perfil)

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
            <IconMapa size={22} color="#3BAD68" />
            <span style={{ fontSize: 17, fontWeight: 800, color: '#1A1A1A' }}>Território de Campo</span>
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: 17,
            background: cores.acento,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: cores.texto,
          }}>
            {usuario.nome.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Conteúdo */}
        <main style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {children}
        </main>

        {/* Barra inferior */}
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
            const Icone = ICONES[item.iconeKey]
            return (
              <Link key={item.href} href={item.href} style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '10px 4px',
                textDecoration: 'none',
                color: ativo ? cores.acento : '#AAAAAA',
                gap: 4,
                borderTop: ativo ? `2px solid ${cores.acento}` : '2px solid transparent',
                transition: 'color 0.15s',
              }}>
                {Icone && <Icone size={22} color={ativo ? cores.acento : '#AAAAAA'} />}
                <span style={{ fontSize: 11, fontWeight: ativo ? 700 : 400, whiteSpace: 'nowrap', color: ativo ? cores.acento : '#AAAAAA' }}>
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
            padding: '10px 4px', gap: 4,
            border: 'none', background: 'none', cursor: 'pointer',
            borderTop: '2px solid transparent',
          }}>
            <IconSair size={22} color="#AAAAAA" />
            <span style={{ fontSize: 11, fontWeight: 400, color: '#AAAAAA' }}>Sair</span>
          </button>
        </div>
      </div>
    )
  }

  // === DESKTOP ===
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <IconMapa size={24} color="#3BAD68" />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A', lineHeight: 1.2 }}>Território<br/>de Campo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 17,
              background: cores.acento, color: cores.texto,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 14, flexShrink: 0,
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
            const Icone = ICONES[item.iconeKey]
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px',
                fontSize: 14, fontWeight: ativo ? 700 : 500,
                color: ativo ? cores.texto : '#555',
                background: ativo ? cores.bg : 'transparent',
                borderLeft: ativo ? `3px solid ${cores.acento}` : '3px solid transparent',
                textDecoration: 'none',
                transition: 'background 0.12s',
              }}>
                {Icone && <Icone size={18} color={ativo ? cores.acento : '#888'} />}
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Sair */}
        <div style={{ padding: 16, borderTop: '1px solid #EEEEEE' }}>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '11px 16px',
            background: 'none', border: '1px solid #EEEEEE',
            borderRadius: 8, cursor: 'pointer',
            fontSize: 14, fontWeight: 600, color: '#666',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <IconSair size={16} color="#888" />
            Sair
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

// ─── Nav items por perfil ──────────────────────────────────────────────────────

function getNavItems(perfil: string) {
  const todos = {
    dirigente: [
      { href: '/app', iconeKey: 'mapa', label: 'Meu mapa', labelCurto: 'Mapa' },
      { href: '/app/historico', iconeKey: 'historico', label: 'Histórico', labelCurto: 'Histórico' },
      { href: '/app/perfil', iconeKey: 'perfil', label: 'Meu perfil', labelCurto: 'Perfil' },
    ],
    superintendente_grupo: [
      { href: '/app', iconeKey: 'mapa', label: 'Mapa', labelCurto: 'Mapa' },
      { href: '/app/progresso', iconeKey: 'progresso', label: 'Progresso', labelCurto: 'Progresso' },
      { href: '/app/validar', iconeKey: 'validar', label: 'Validar', labelCurto: 'Validar' },
      { href: '/app/perfil', iconeKey: 'perfil', label: 'Perfil', labelCurto: 'Perfil' },
    ],
    superintendente_territorio: [
      { href: '/app', iconeKey: 'mapa', label: 'Mapa geral', labelCurto: 'Mapa' },
      { href: '/app/territorios', iconeKey: 'territorios', label: 'Territórios', labelCurto: 'Territórios' },
      { href: '/app/validar', iconeKey: 'validar', label: 'Validar', labelCurto: 'Validar' },
      { href: '/app/analise', iconeKey: 'analise', label: 'Análise', labelCurto: 'Análise' },
      { href: '/app/perfil', iconeKey: 'perfil', label: 'Perfil', labelCurto: 'Perfil' },
    ],
    admin: [
      { href: '/app/usuarios', iconeKey: 'usuarios', label: 'Usuários', labelCurto: 'Usuários' },
      { href: '/app/usuarios/novo', iconeKey: 'novo_usuario', label: 'Novo usuário', labelCurto: 'Novo' },
      { href: '/app/logs', iconeKey: 'logs', label: 'Logs', labelCurto: 'Logs' },
      { href: '/app/configuracoes', iconeKey: 'config', label: 'Configurações', labelCurto: 'Config' },
      { href: '/app/perfil', iconeKey: 'perfil', label: 'Perfil', labelCurto: 'Perfil' },
    ],
  }
  return todos[perfil as keyof typeof todos] || []
}
