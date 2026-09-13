'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Perfil, type Usuario } from './supabase'

interface ResultadoPermissao {
  usuario: Usuario | null
  carregando: boolean
  autorizado: boolean
}

/**
 * Garante que a página só renderize dados para quem está logado, ativo
 * e com um dos perfis permitidos. Substitui as verificações copiadas
 * manualmente em cada página por uma única fonte de verdade.
 */
export function usePaginaRestrita(perfisPermitidos: Perfil[]): ResultadoPermissao {
  const router = useRouter()
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const chavePerfis = perfisPermitidos.join(',')

  useEffect(() => {
    let ativo = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }

      const { data } = await supabase.from('usuarios').select('*').eq('id', session.user.id).single()
      if (!ativo) return

      if (!data || !data.ativo) {
        await supabase.auth.signOut()
        router.push('/login?desativado=1')
        return
      }

      setUsuario(data)
      setAutorizado(chavePerfis.split(',').includes(data.perfil))
      setCarregando(false)
    })

    return () => { ativo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, chavePerfis])

  return { usuario, carregando, autorizado }
}
