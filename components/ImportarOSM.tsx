'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

// Painel que gera as quadras de um território a partir das ruas do
// OpenStreetMap: escolhe o território (precisa ter contorno), monta a prévia no
// mapa e só grava depois que o ST ou admin desmarca o que saiu errado.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { gerarLados, nomeDaQuadra, proximaSequencia } from '@/lib/quadras'
import {
  buscarRuas, caixaDoContorno, featureDaQuadra, gerarQuadras, type QuadraGerada,
} from '@/lib/quadrasOSM'
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

type Etapa = 'selecao' | 'buscando' | 'revisao' | 'gravando' | 'erro'

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
  const previewRef = useRef<any[]>([])
  const abortRef = useRef<AbortController | null>(null)

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
  }, [map])

  // Nome provisório de cada quadra, na ordem em que serão gravadas
  const nomes = useMemo(() => {
    if (!territorio) return new Map<number, string>()
    let sequencia = proximaSequencia(quadrasExistentes, territorio.numero)
    const mapa = new Map<number, string>()
    quadras.forEach((_, i) => {
      if (!selecionadas.has(i)) return
      mapa.set(i, nomeDaQuadra(territorio.numero, sequencia))
      sequencia++
    })
    return mapa
  }, [quadras, selecionadas, quadrasExistentes, territorio])

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
  const gerar = useCallback(async () => {
    if (!territorio) return
    const L = (window as any).L
    abortRef.current?.abort()
    const controle = new AbortController()
    abortRef.current = controle

    setEtapa('buscando')
    limparPreview()
    try {
      const poligonos = poligonosDoContorno(territorio.geojson) as [number, number][][][]
      const caixa = caixaDoContorno(poligonos)
      if (!caixa) throw new Error('O contorno deste território está vazio.')

      const [ruas, { data: jaGravadas }] = await Promise.all([
        buscarRuas(caixa, controle.signal),
        supabase.from('quadras').select('nome').eq('territorio_id', territorio.id),
      ])
      if (controle.signal.aborted) return

      const resultado = gerarQuadras({ contorno: territorio.geojson, ruas })
      if (resultado.quadras.length === 0) {
        throw new Error(
          ruas.length === 0
            ? 'O OpenStreetMap não tem ruas mapeadas nesta região. Desenhe as quadras à mão ou cadastre as ruas no OSM.'
            : 'As ruas encontradas não fecham nenhuma quadra dentro do contorno. Confira o contorno do território.'
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
  }, [territorio, map, limparPreview, estiloDaPrevia, alternar])

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
    if (!territorio || selecionadas.size === 0) return
    setEtapa('gravando')

    const linhas = quadras
      .map((quadra, i) => ({ quadra, nome: nomes.get(i) }))
      .filter((item): item is { quadra: QuadraGerada; nome: string } => !!item.nome)
      .map(({ quadra, nome }) => ({
        territorio_id: territorio.id,
        nome,
        status: 'nao_iniciado',
        geojson: featureDaQuadra(quadra),
        lados: gerarLados(quadra.anel),
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
          </div>
        )}

        {etapa === 'buscando' && (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#666' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌐</div>
            <p style={{ fontSize: 15 }}>Consultando o OpenStreetMap…</p>
            <p style={{ fontSize: 13, color: '#AAAAAA', marginTop: 8 }}>Costuma levar alguns segundos.</p>
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
                Este território já tem {quadrasExistentes.length} quadra(s). As novas entram numerando a partir daí, sem apagar nada.
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
