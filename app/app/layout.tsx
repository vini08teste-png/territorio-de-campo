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

function IconHierarquia({ size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4.5" r="2.2" />
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
      <circle cx="5" cy="19.5" r="2.2" />
      <circle cx="19" cy="19.5" r="2.2" />
      <path d="M12 6.7v3M5 14.2v3.1M19 14.2v3.1M9.2 10.5 7.3 9.8M14.8 10.5l1.9-.7" />
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
  hierarquia: IconHierarquia,
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
    // Identidade salva localmente pra o app não travar no "Carregando…" offline.
    const lerUsuarioSalvo = (): Usuario | null => {
      try { return JSON.parse(localStorage.getItem('tc_usuario') || 'null') } catch { return null }
    }

    async function carregar() {
      // Sem sinal: usa a identidade salva direto, sem depender da rede.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const salvo = lerUsuarioSalvo()
        if (salvo) { setUsuario(salvo); return }
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Sessão pode ter expirado offline — se tem identidade salva, segue.
        const salvo = lerUsuarioSalvo()
        if (salvo) { setUsuario(salvo); return }
        router.push('/login'); return
      }

      let data: Usuario | null = null
      try {
        const res = await supabase.from('usuarios').select('*').eq('id', session.user.id).single()
        data = res.data
      } catch { /* rede falhou — cai no fallback abaixo */ }

      if (!data) {
        const salvo = lerUsuarioSalvo()
        if (salvo) { setUsuario(salvo); return }
        router.push('/login'); return
      }

      if (!data.ativo) {
        await logout()
        router.push('/login?desativado=1')
        return
      }

      const ROTAS_RESTRITAS: { prefixo: string; perfis: string[] }[] = [
        { prefixo: '/app/usuarios', perfis: ['admin', 'superintendente_territorio'] },
        { prefixo: '/app/configuracoes', perfis: ['admin'] },
        { prefixo: '/app/hierarquia', perfis: ['admin', 'superintendente_territorio'] },
        { prefixo: '/app/logs', perfis: ['admin', 'superintendente_territorio'] },
      ]
      const rotaRestrita = ROTAS_RESTRITAS.find((r) => pathname.startsWith(r.prefixo))
      if (rotaRestrita && !rotaRestrita.perfis.includes(data.perfil)) {
        router.push('/app')
        return
      }

      try { localStorage.setItem('tc_usuario', JSON.stringify(data)) } catch { /* cota cheia, ignora */ }
      setUsuario(data)
    }

    void carregar()
  }, [router, pathname])

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  if (!usuario) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#fff' }}>
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

        {/* Barra inferior — rolável quando o perfil tem mais itens do que cabe na tela */}
        <div style={{
          display: 'flex',
          borderTop: '1px solid #EEEEEE',
          background: '#fff',
          flexShrink: 0,
          zIndex: 100,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          <div style={{ display: 'flex', overflowX: 'auto', flex: 1, minWidth: 0 }}>
            {navItems.map(item => {
              const ativo = pathname === item.href
              const Icone = ICONES[item.iconeKey]
              return (
                <Link key={item.href} href={item.href} style={{
                  flexShrink: 0,
                  minWidth: 64,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: '10px 8px',
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
          </div>
          {/* Botão sair — fica fixo fora da rolagem, sempre acessível */}
          <button onClick={handleLogout} style={{
            flexShrink: 0,
            minWidth: 64,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '10px 8px', gap: 4,
            border: 'none', borderLeft: '1px solid #EEEEEE', background: 'none', cursor: 'pointer',
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
      <main style={{ flex: 1, overflow: 'auto', minHeight: 0, background: '#F7F7F7' }}>
        {children}
      </main>
    </div>
  )
}

// ─── Nav items por perfil ──────────────────────────────────────────────────────

interface NavItem {
  href: string
  iconeKey: string
  label: string
  labelCurto: string
}

// Cada nível da hierarquia herda os itens de quem está abaixo — quem pode
// fazer o que o dirigente faz também vê "Mapa", quem faz o que o SG faz
// também vê "Progresso"/"Validar", e assim por diante.
const ITEM_MAPA: NavItem = { href: '/app', iconeKey: 'mapa', label: 'Mapa', labelCurto: 'Mapa' }
const ITEM_HISTORICO: NavItem = { href: '/app/historico', iconeKey: 'historico', label: 'Histórico', labelCurto: 'Histórico' }
const ITEM_PROGRESSO: NavItem = { href: '/app/progresso', iconeKey: 'progresso', label: 'Progresso', labelCurto: 'Progresso' }
const ITEM_VALIDAR: NavItem = { href: '/app/validar', iconeKey: 'validar', label: 'Validar', labelCurto: 'Validar' }
const ITEM_DESIGNAR: NavItem = { href: '/app/designar', iconeKey: 'novo_usuario', label: 'Designar', labelCurto: 'Designar' }
const ITEM_TERRITORIOS: NavItem = { href: '/app/territorios', iconeKey: 'territorios', label: 'Territórios', labelCurto: 'Territórios' }
const ITEM_ANALISE: NavItem = { href: '/app/analise', iconeKey: 'analise', label: 'Análise', labelCurto: 'Análise' }
const ITEM_LOGS: NavItem = { href: '/app/logs', iconeKey: 'logs', label: 'Logs', labelCurto: 'Logs' }
const ITEM_USUARIOS: NavItem = { href: '/app/usuarios', iconeKey: 'usuarios', label: 'Usuários', labelCurto: 'Usuários' }
const ITEM_NOVO_USUARIO: NavItem = { href: '/app/usuarios/novo', iconeKey: 'novo_usuario', label: 'Novo usuário', labelCurto: 'Novo' }
const ITEM_HIERARQUIA: NavItem = { href: '/app/hierarquia', iconeKey: 'hierarquia', label: 'Hierarquia', labelCurto: 'Hierarquia' }
const ITEM_CONFIG: NavItem = { href: '/app/configuracoes', iconeKey: 'config', label: 'Configurações', labelCurto: 'Config' }
const ITEM_PERFIL: NavItem = { href: '/app/perfil', iconeKey: 'perfil', label: 'Perfil', labelCurto: 'Perfil' }

const NAV_DIRIGENTE: NavItem[] = [ITEM_MAPA, ITEM_HISTORICO, ITEM_PERFIL]
const NAV_SG: NavItem[] = [ITEM_MAPA, ITEM_PROGRESSO, ITEM_DESIGNAR, ITEM_VALIDAR, ITEM_HISTORICO, ITEM_PERFIL]
const NAV_ST: NavItem[] = [ITEM_USUARIOS, ITEM_NOVO_USUARIO, ITEM_HIERARQUIA, ITEM_MAPA, ITEM_TERRITORIOS, ITEM_DESIGNAR, ITEM_VALIDAR, ITEM_ANALISE, ITEM_PROGRESSO, ITEM_LOGS, ITEM_HISTORICO, ITEM_PERFIL]
const NAV_ADMIN: NavItem[] = [
  ITEM_USUARIOS, ITEM_NOVO_USUARIO, ITEM_HIERARQUIA, ITEM_CONFIG,
  ITEM_MAPA, ITEM_TERRITORIOS, ITEM_DESIGNAR, ITEM_VALIDAR, ITEM_ANALISE, ITEM_PROGRESSO, ITEM_LOGS, ITEM_HISTORICO, ITEM_PERFIL,
]

function getNavItems(perfil: string): NavItem[] {
  const todos: Record<string, NavItem[]> = {
    dirigente: NAV_DIRIGENTE,
    superintendente_grupo: NAV_SG,
    superintendente_territorio: NAV_ST,
    admin: NAV_ADMIN,
  }
  return todos[perfil] || []
}
