'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

// Painel que gera quadras a partir das ruas do OpenStreetMap: escolhe o
// território (precisa ter contorno) — ou desenha o perímetro da cidade na
// hora, pra catalogar quadras sem território, pra agrupar depois — monta a
// prévia no mapa e só grava depois que o ST ou admin desmarca o que saiu errado.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { nomeDaQuadra, proximaSequencia } from '@/lib/quadras'
import { featureDaQuadra, gerarQuadrasDoContorno, type QuadraGerada } from '@/lib/quadrasOSM'
import { poligonosDoContorno } from '@/lib/territorio'

interface TerritorioOpcao {
  id: string
  nome: string
  numero: string
  geojson: unknown
}

interface Props {
  mapInstance: any // instância do Leaflet já inicializada
  territorios: TerritorioOpcao[]
  onConcluir: () => void // callback para recarregar quadras
  onFechar: () => void
}

type Etapa = 'selecao' | 'desenhandoCidade' | 'buscando' | 'revisao' | 'gravando' | 'erro'
  | 'confirmarTodos' | 'gerandoTodos' | 'resumo'

type Situacao = 'gravadas' | 'ja_tinha' | 'sem_quadras' | 'erro'

interface LinhaResumo {
  territorio: string
  situacao: Situacao
  quadras: number
  detalhe?: string
}

const ICONE: Record<Situacao, string> = {
  gravadas: '✅', ja_tinha: '⏭️', sem_quadras: '➖', erro: '⚠️',
}

/** Um respiro entre as consultas para não martelar a Overpass. */
const PAUSA_ENTRE_TERRITORIOS_MS = 1000

function espera(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const VERDE = '#3BAD68'
const CINZA = '#9E9E9E'

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message
  return 'Não foi possível gerar as quadras.'
}

export default function ImportarOSM({ mapInstance: map, territorios, onConcluir, onFechar }: Props) {
  const [etapa, setEtapa] = useState<Etapa>('selecao')
  const [territorioId, setTerritorioId] = useState('')
  const [quadras, setQuadras] = useState<QuadraGerada[]>([])
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set())
  const [descartadas, setDescartadas] = useState(0)
  const [quadrasExistentes, setQuadrasExistentes] = useState<string[]>([])
  const [erroMsg, setErroMsg] = useState('')
  const [progresso, setProgresso] = useState<{ atual: number; total: number; nome: string } | null>(null)
  const [resumo, setResumo] = useState<LinhaResumo[]>([])
  const [modoCidade, setModoCidade] = useState(false)
  const previewRef = useRef<any[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const desenhoCidadeRef = useRef<{ control: any; drawer: any } | null>(null)

  const comContorno = useMemo(
    () => territorios.filter((t) => poligonosDoContorno(t.geojson).length > 0),
    [territorios]
  )
  const semContorno = territorios.length - comContorno.length
  const territorio = comContorno.find((t) => t.id === territorioId) ?? null

  const limparPreview = useCallback(() => {
    previewRef.current.forEach((camada) => { try { map.removeLayer(camada) } catch {} })
    previewRef.current = []
  }, [map])

  useEffect(() => () => {
    abortRef.current?.abort()
    previewRef.current.forEach((camada) => { try { map.removeLayer(camada) } catch {} })
    previewRef.current = []
    if (desenhoCidadeRef.current) {
      try { desenhoCidadeRef.current.drawer.disable() } catch {}
      try { map.removeControl(desenhoCidadeRef.current.control) } catch {}
      desenhoCidadeRef.current = null
    }
  }, [map])

  // Nome provisório de cada quadra, na ordem em que serão gravadas. Fora de um
  // território, entra o prefixo "NC" (não classificada) em vez do número dele.
  const nomes = useMemo(() => {
    if (!modoCidade && !territorio) return new Map<number, string>()
    const prefixo = modoCidade ? 'NC' : territorio!.numero
    let sequencia = proximaSequencia(quadrasExistentes, prefixo)
    const mapa = new Map<number, string>()
    quadras.forEach((_, i) => {
      if (!selecionadas.has(i)) return
      mapa.set(i, nomeDaQuadra(prefixo, sequencia))
      sequencia++
    })
    return mapa
  }, [quadras, selecionadas, quadrasExistentes, territorio, modoCidade])

  // Rótulo com o nome que cada quadra vai receber ao gravar
  useEffect(() => {
    previewRef.current.forEach((camada, i) => {
      const nome = nomes.get(i)
      if (nome) camada.bindTooltip(nome, { permanent: true, direction: 'center', className: 'rotulo-quadra' })
      else camada.unbindTooltip()
    })
  }, [nomes])

  const estiloDaPrevia = useCallback((selecionada: boolean) => ({
    color: selecionada ? VERDE : CINZA,
    weight: selecionada ? 2 : 1,
    dashArray: selecionada ? undefined : '4 4',
    fillColor: selecionada ? '#B8EAC8' : '#EEEEEE',
    fillOpacity: selecionada ? 0.45 : 0.15,
  }), [])

  const alternar = useCallback((indice: number) => {
    setSelecionadas((anterior) => {
      const proxima = new Set(anterior)
      if (proxima.has(indice)) proxima.delete(indice)
      else proxima.add(indice)
      previewRef.current[indice]?.setStyle(estiloDaPrevia(proxima.has(indice)))
      return proxima
    })
  }, [estiloDaPrevia])

  // ── Gerar a prévia ─────────────────────────────────────────────────────────
  // Núcleo comum: busca as ruas dentro do contorno dado e monta a prévia no
  // mapa. `territorioId` ausente = catálogo sem território (quadras "soltas").
  const executarGeracao = useCallback(async (contorno: unknown, territorioId?: string) => {
    const L = (window as any).L
    abortRef.current?.abort()
    const controle = new AbortController()
    abortRef.current = controle

    setEtapa('buscando')
    limparPreview()
    try {
      const consultaExistentes = territorioId
        ? supabase.from('quadras').select('nome').eq('territorio_id', territorioId)
        : supabase.from('quadras').select('nome').is('territorio_id', null)

      const [resultado, { data: jaGravadas }] = await Promise.all([
        gerarQuadrasDoContorno(contorno, { sinal: controle.signal }),
        consultaExistentes,
      ])
      if (controle.signal.aborted) return

      if (resultado.quadras.length === 0) {
        throw new Error(
          resultado.ruasEncontradas === 0
            ? 'O OpenStreetMap não tem ruas mapeadas nesta região. Desenhe as quadras à mão ou cadastre as ruas no OSM.'
            : 'As ruas encontradas não fecham nenhuma quadra dentro do contorno. Confira o contorno desenhado.'
        )
      }

      setQuadrasExistentes((jaGravadas ?? []).map((q: { nome: string }) => q.nome))
      setQuadras(resultado.quadras)
      setDescartadas(resultado.descartadas)
      setSelecionadas(new Set(resultado.quadras.map((_, i) => i)))

      const camadas = resultado.quadras.map((quadra, i) => {
        const pontos = quadra.anel.map(([lng, lat]) => [lat, lng] as [number, number])
        const camada = L.polygon(pontos, estiloDaPrevia(true)).addTo(map)
        camada.on('click', (evento: any) => {
          L.DomEvent.stopPropagation(evento)
          alternar(i)
        })
        return camada
      })
      previewRef.current = camadas
      const grupo = L.featureGroup(camadas)
      map.fitBounds(grupo.getBounds(), { padding: [32, 32] })
      setEtapa('revisao')
    } catch (erro) {
      if (controle.signal.aborted) return
      setErroMsg(mensagemDeErro(erro))
      setEtapa('erro')
    }
  }, [map, limparPreview, estiloDaPrevia, alternar])

  const gerar = useCallback(async () => {
    if (!territorio) return
    setModoCidade(false)
    await executarGeracao(territorio.geojson, territorio.id)
  }, [territorio, executarGeracao])

  // ── Desenhar o perímetro da cidade (sem território) ─────────────────────────
  const iniciarDesenhoCidade = useCallback(() => {
    const L = (window as any).L
    if (!map || !L || !L.Draw) return
    limparPreview()
    setEtapa('desenhandoCidade')

    const drawControl = new L.Control.Draw({
      draw: { polygon: { allowIntersection: false, showArea: true }, polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false },
      edit: false,
    })
    map.addControl(drawControl)
    const drawer = new L.Draw.Polygon(map, drawControl.options.draw.polygon)
    drawer.enable()
    desenhoCidadeRef.current = { control: drawControl, drawer }

    let criado = false
    map.once(L.Draw.Event.CREATED, (e: any) => {
      criado = true
      try { map.removeControl(drawControl) } catch {}
      desenhoCidadeRef.current = null
      const geojson = e.layer.toGeoJSON()
      setModoCidade(true)
      void executarGeracao(geojson)
    })
    map.once(L.Draw.Event.DRAWSTOP, () => {
      if (criado) return
      try { map.removeControl(drawControl) } catch {}
      desenhoCidadeRef.current = null
      setEtapa('selecao')
    })
  }, [map, limparPreview, executarGeracao])

  function cancelarDesenhoCidade() {
    desenhoCidadeRef.current?.drawer.disable()
  }

  // ── Gerar em todos os territórios de uma vez ───────────────────────────────
  const gerarTodos = useCallback(async () => {
    abortRef.current?.abort()
    const controle = new AbortController()
    abortRef.current = controle

    limparPreview()
    setResumo([])
    setEtapa('gerandoTodos')

    // Quem já tem quadra fica de fora, para não duplicar o que foi feito à mão
    // (quadras sem território, geradas pelo catálogo da cidade, não contam aqui)
    const { data: jaGravadas } = await supabase.from('quadras').select('territorio_id')
    const comQuadras = new Map<string, number>()
    for (const q of (jaGravadas ?? []) as { territorio_id: string | null }[]) {
      if (!q.territorio_id) continue
      comQuadras.set(q.territorio_id, (comQuadras.get(q.territorio_id) ?? 0) + 1)
    }

    const linhas: LinhaResumo[] = []
    for (let i = 0; i < comContorno.length; i++) {
      if (controle.signal.aborted) return
      const alvo = comContorno[i]
      const rotulo = `#${alvo.numero} — ${alvo.nome}`
      setProgresso({ atual: i + 1, total: comContorno.length, nome: rotulo })

      const quantasJaTem = comQuadras.get(alvo.id) ?? 0
      if (quantasJaTem > 0) {
        linhas.push({ territorio: rotulo, situacao: 'ja_tinha', quadras: quantasJaTem })
        setResumo([...linhas])
        continue
      }

      try {
        const { quadras: geradas } = await gerarQuadrasDoContorno(alvo.geojson, { sinal: controle.signal })
        if (controle.signal.aborted) return

        if (geradas.length === 0) {
          linhas.push({ territorio: rotulo, situacao: 'sem_quadras', quadras: 0 })
        } else {
          const registros = geradas.map((quadra, k) => ({
            territorio_id: alvo.id,
            nome: nomeDaQuadra(alvo.numero, k + 1),
            status: 'nao_iniciado',
            geojson: featureDaQuadra(quadra),
          }))
          const { error } = await supabase.from('quadras').insert(registros)
          if (error) linhas.push({ territorio: rotulo, situacao: 'erro', quadras: 0, detalhe: error.message })
          else linhas.push({ territorio: rotulo, situacao: 'gravadas', quadras: geradas.length })
        }
      } catch (erro) {
        if (controle.signal.aborted) return
        linhas.push({ territorio: rotulo, situacao: 'erro', quadras: 0, detalhe: mensagemDeErro(erro) })
      }

      setResumo([...linhas])
      if (i + 1 < comContorno.length) await espera(PAUSA_ENTRE_TERRITORIOS_MS)
    }

    setProgresso(null)
    setEtapa('resumo')
    onConcluir() // o mapa recarrega já com as quadras gravadas
  }, [comContorno, limparPreview, onConcluir])

  function marcarTodas(marcar: boolean) {
    setSelecionadas(marcar ? new Set(quadras.map((_, i) => i)) : new Set())
    previewRef.current.forEach((camada) => camada.setStyle(estiloDaPrevia(marcar)))
  }

  function focar(indice: number) {
    const camada = previewRef.current[indice]
    if (camada) map.fitBounds(camada.getBounds(), { maxZoom: 18, padding: [40, 40] })
  }

  // ── Gravar ─────────────────────────────────────────────────────────────────
  async function gravar() {
    if ((!modoCidade && !territorio) || selecionadas.size === 0) return
    setEtapa('gravando')

    const linhas = quadras
      .map((quadra, i) => ({ quadra, nome: nomes.get(i) }))
      .filter((item): item is { quadra: QuadraGerada; nome: string } => !!item.nome)
      .map(({ quadra, nome }) => ({
        territorio_id: modoCidade ? null : territorio!.id,
        nome,
        status: 'nao_iniciado',
        geojson: featureDaQuadra(quadra),
      }))

    const { error } = await supabase.from('quadras').insert(linhas)
    if (error) {
      setErroMsg(`Não foi possível gravar as quadras: ${error.message}`)
      setEtapa('erro')
      return
    }
    limparPreview()
    onConcluir()
    onFechar()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const total = quadras.length
  const marcadas = selecionadas.size
  const totalGravadas = resumo.reduce((soma, l) => soma + (l.situacao === 'gravadas' ? l.quadras : 0), 0)
  const territoriosGravados = resumo.filter((l) => l.situacao === 'gravadas').length

  // Enquanto desenha o perímetro da cidade, o mapa inteiro fica livre — só uma
  // barra de instrução flutuante, sem o painel lateral de 380px no caminho.
  if (etapa === 'desenhandoCidade') {
    return (
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1100, background: '#FFFFFF', borderRadius: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12, maxWidth: 'calc(100% - 32px)',
      }}>
        <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>
          ✏️ Desenhe o perímetro urbano da cidade. Clique pra marcar cada ponto e feche no primeiro ponto.
          <br /><span style={{ color: '#888' }}>Área grande demora mais — se travar, desenhe por partes.</span>
        </span>
        <button onClick={cancelarDesenhoCidade} style={{
          flexShrink: 0, padding: '8px 14px', fontSize: 13, fontWeight: 600,
          background: '#F7F7F7', color: '#555', border: '0.5px solid #DDD', borderRadius: 8, cursor: 'pointer',
        }}>
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: '100%', maxWidth: 380,
      background: '#FFFFFF',
      borderLeft: '0.5px solid #EEEEEE',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
      zIndex: 1100,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '0.5px solid #EEEEEE', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A1A', margin: 0 }}>Gerar quadras pelas ruas</h2>
          <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
            {etapa === 'selecao' && 'Escolha o território'}
            {etapa === 'buscando' && '⏳ Consultando o OpenStreetMap…'}
            {etapa === 'revisao' && `${total} quadra(s) encontradas`}
            {etapa === 'gravando' && 'Gravando…'}
            {etapa === 'confirmarTodos' && 'Confirmar a geração em lote'}
            {etapa === 'gerandoTodos' && `⏳ ${progresso?.atual ?? 0} de ${progresso?.total ?? 0} territórios`}
            {etapa === 'resumo' && 'Terminou'}
            {etapa === 'erro' && '⚠️ Deu problema'}
          </p>
        </div>
        <button onClick={onFechar} style={{ background: '#F7F7F7', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 16, cursor: 'pointer', color: '#666' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {etapa === 'selecao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F0F9FF', border: '1px solid #B3D9FF', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#042C53', lineHeight: 1.6 }}>
              <strong>Como funciona:</strong><br />
              1. Escolha um território que já tenha contorno<br />
              2. O sistema busca as ruas do OpenStreetMap<br />
              3. Cada área cercada por ruas vira uma quadra<br />
              4. Você confere no mapa e confirma
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#444', marginBottom: 6 }}>
                Território
              </label>
              {comContorno.length === 0 ? (
                <p style={{ color: '#E05050', fontSize: 13, lineHeight: 1.5 }}>
                  Nenhum território tem contorno. Importe o GeoJSON dos territórios na tela &ldquo;Territórios&rdquo; antes de gerar as quadras.
                </p>
              ) : (
                <select value={territorioId} onChange={(e) => setTerritorioId(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', fontSize: 14, border: '1px solid #DDD', borderRadius: 8, background: '#FAFAFA', outline: 'none' }}>
                  <option value="">— Selecione —</option>
                  {comContorno.map((t) => (
                    <option key={t.id} value={t.id}>#{t.numero} — {t.nome}</option>
                  ))}
                </select>
              )}
              {semContorno > 0 && comContorno.length > 0 && (
                <p style={{ fontSize: 12, color: '#AAAAAA', marginTop: 6 }}>
                  {semContorno} território(s) ficaram de fora por não ter contorno desenhado.
                </p>
              )}
            </div>

            <button onClick={() => void gerar()} disabled={!territorio} style={{
              padding: '14px', fontSize: 15, fontWeight: 600,
              background: territorio ? '#378ADD' : '#CCCCCC', color: '#fff',
              border: 'none', borderRadius: 10, cursor: territorio ? 'pointer' : 'not-allowed',
            }}>
              🌐 Buscar ruas e gerar quadras
            </button>

            {comContorno.length > 1 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#CCCCCC', fontSize: 12 }}>
                  <span style={{ flex: 1, height: 1, background: '#EEEEEE' }} /> ou <span style={{ flex: 1, height: 1, background: '#EEEEEE' }} />
                </div>
                <button onClick={() => setEtapa('confirmarTodos')} style={{
                  padding: '13px', fontSize: 14, fontWeight: 600,
                  background: '#FFFFFF', color: '#378ADD',
                  border: '1.5px solid #378ADD', borderRadius: 10, cursor: 'pointer',
                }}>
                  ⚡ Gerar de uma vez nos {comContorno.length} territórios
                </button>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#CCCCCC', fontSize: 12 }}>
              <span style={{ flex: 1, height: 1, background: '#EEEEEE' }} /> ou <span style={{ flex: 1, height: 1, background: '#EEEEEE' }} />
            </div>
            <button onClick={iniciarDesenhoCidade} style={{
              padding: '13px', fontSize: 14, fontWeight: 600,
              background: '#FFFFFF', color: '#3BAD68',
              border: '1.5px solid #3BAD68', borderRadius: 10, cursor: 'pointer',
            }}>
              🏙️ Catalogar toda a cidade (desenhar perímetro)
            </button>
            <p style={{ fontSize: 12, color: '#AAAAAA', margin: 0 }}>
              Gera as quadras de uma área desenhada na hora, sem depender de território — pra depois agrupar cada uma no território certo.
            </p>
          </div>
        )}

        {etapa === 'confirmarTodos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#FFF8E7', border: '1px solid #F0C060', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#412402', lineHeight: 1.6 }}>
              As quadras dos {comContorno.length} territórios com contorno vão ser geradas e <strong>gravadas direto</strong>, sem a revisão de cada uma.
              <br /><br />
              • Territórios que já têm quadras são pulados<br />
              • Leva alguns minutos (uma consulta por território)<br />
              • Depois dá para apagar ou corrigir quadra por quadra, pelo mapa ou pela tela de Territórios
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEtapa('selecao')} style={{ flex: 1, padding: '13px', fontSize: 14, fontWeight: 500, background: '#F7F7F7', color: '#555', border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => void gerarTodos()} style={{ flex: 2, padding: '13px', fontSize: 14, fontWeight: 600, background: '#378ADD', color: '#FFF', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
                ⚡ Pode gerar
              </button>
            </div>
          </div>
        )}

        {(etapa === 'gerandoTodos' || etapa === 'resumo') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {etapa === 'gerandoTodos' && progresso && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666', marginBottom: 6 }}>
                  <span>{progresso.nome}</span>
                  <span>{progresso.atual}/{progresso.total}</span>
                </div>
                <div style={{ height: 8, background: '#EEEEEE', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((progresso.atual / progresso.total) * 100)}%`, background: '#378ADD', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
                <p style={{ fontSize: 12, color: '#AAAAAA', marginTop: 8 }}>
                  Não feche esta janela enquanto estiver rodando.
                </p>
              </div>
            )}

            {etapa === 'resumo' && (
              <div style={{ background: '#EAF7EF', border: '1px solid #3BAD68', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#04342C', lineHeight: 1.5 }}>
                <strong>{totalGravadas} quadra(s)</strong> gravadas em {territoriosGravados} território(s).
                {' '}Confira no mapa e ajuste o que precisar.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {resumo.map((linha, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, color: '#444', padding: '4px 0', borderBottom: '0.5px solid #F3F3F3' }}>
                  <span style={{ flexShrink: 0 }}>{ICONE[linha.situacao]}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linha.territorio}</span>
                  <span style={{ fontSize: 12, color: '#888', flexShrink: 0 }}>
                    {linha.situacao === 'gravadas' && `${linha.quadras} quadras`}
                    {linha.situacao === 'ja_tinha' && `já tinha ${linha.quadras}`}
                    {linha.situacao === 'sem_quadras' && 'sem ruas no OSM'}
                    {linha.situacao === 'erro' && 'erro'}
                  </span>
                </div>
              ))}
            </div>

            {resumo.some((l) => l.situacao === 'erro') && (
              <div style={{ background: '#FFF0F0', border: '1px solid #E05050', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#501313', lineHeight: 1.5 }}>
                {resumo.filter((l) => l.situacao === 'erro').map((l, i) => (
                  <div key={i}>{l.territorio}: {l.detalhe}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {etapa === 'buscando' && (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#666' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌐</div>
            <p style={{ fontSize: 15 }}>Consultando o OpenStreetMap…</p>
            <p style={{ fontSize: 13, color: '#AAAAAA', marginTop: 8 }}>Costuma levar alguns segundos. Área grande demora mais; se o servidor não responder, o app tenta um espelho seguinte sozinho antes de avisar que deu erro.</p>
          </div>
        )}

        {etapa === 'gravando' && (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#666' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💾</div>
            <p style={{ fontSize: 15 }}>Gravando {marcadas} quadra(s)…</p>
          </div>
        )}

        {etapa === 'erro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#FFF0F0', border: '1px solid #E05050', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#501313', lineHeight: 1.5 }}>
              {erroMsg}
            </div>
            <button onClick={() => setEtapa(quadras.length > 0 ? 'revisao' : 'selecao')} style={{
              padding: '13px', fontSize: 14, fontWeight: 600,
              background: '#F7F7F7', color: '#555',
              border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer',
            }}>
              ← Voltar
            </button>
          </div>
        )}

        {etapa === 'revisao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {quadrasExistentes.length > 0 && (
              <div style={{ background: '#FFF8E7', border: '1px solid #F0C060', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#412402', lineHeight: 1.5 }}>
                {modoCidade ? 'Já existem' : 'Este território já tem'} {quadrasExistentes.length} quadra(s){modoCidade ? ' sem território' : ''}. As novas entram numerando a partir daí, sem apagar nada.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#666' }}>{marcadas} de {total} marcadas</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => marcarTodas(true)} style={{ fontSize: 12, padding: '4px 10px', background: '#F7F7F7', border: '0.5px solid #DDD', borderRadius: 6, cursor: 'pointer', color: '#444' }}>Todas</button>
                <button onClick={() => marcarTodas(false)} style={{ fontSize: 12, padding: '4px 10px', background: '#F7F7F7', border: '0.5px solid #DDD', borderRadius: 6, cursor: 'pointer', color: '#444' }}>Nenhuma</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {quadras.map((quadra, i) => {
                const marcada = selecionadas.has(i)
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 10,
                    border: marcada ? '1.5px solid #3BAD68' : '1px solid #EEEEEE',
                    background: marcada ? '#EAF7EF' : '#FFFFFF',
                  }}>
                    <button onClick={() => alternar(i)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{marcada ? '✅' : '⬜'}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: marcada ? '#1A1A1A' : '#999' }}>
                          {nomes.get(i) ?? 'não será gravada'}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {quadra.areaM2.toLocaleString('pt-BR')} m² · {quadra.anel.length - 1} lados
                          {quadra.ruas.length > 0 ? ` · ${quadra.ruas.join(', ')}` : ''}
                        </span>
                      </span>
                    </button>
                    <button onClick={() => focar(i)} title="Ver no mapa" style={{ background: '#F7F7F7', border: '0.5px solid #DDD', borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer' }}>🔍</button>
                  </div>
                )
              })}
            </div>

            {descartadas > 0 && (
              <p style={{ fontSize: 12, color: '#AAAAAA' }}>
                {descartadas} área(s) foram ignoradas por ficarem fora do contorno ou por terem tamanho fora do que se espera de uma quadra.
              </p>
            )}
          </div>
        )}
      </div>

      {etapa === 'resumo' && (
        <div style={{ padding: '14px 20px', borderTop: '0.5px solid #EEEEEE' }}>
          <button onClick={onFechar} style={{
            width: '100%', padding: '14px', fontSize: 15, fontWeight: 600,
            background: VERDE, color: '#FFFFFF', border: 'none', borderRadius: 10, cursor: 'pointer',
          }}>
            Ver no mapa
          </button>
        </div>
      )}

      {etapa === 'revisao' && (
        <div style={{ padding: '14px 20px', borderTop: '0.5px solid #EEEEEE', display: 'flex', gap: 10 }}>
          <button onClick={() => { limparPreview(); setQuadras([]); setSelecionadas(new Set()); setEtapa('selecao') }}
            style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500, background: '#F7F7F7', color: '#555', border: '0.5px solid #DDD', borderRadius: 10, cursor: 'pointer' }}>
            ←
          </button>
          <button onClick={() => void gravar()} disabled={marcadas === 0}
            style={{
              flex: 1, padding: '14px', fontSize: 15, fontWeight: 600,
              background: marcadas === 0 ? '#CCCCCC' : VERDE,
              color: '#FFFFFF', border: 'none', borderRadius: 10,
              cursor: marcadas === 0 ? 'not-allowed' : 'pointer',
            }}>
            ✅ Gravar {marcadas} quadra{marcadas !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
