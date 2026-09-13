// Gera as quadras de um território a partir das ruas do OpenStreetMap.
//
// A ideia: as ruas formam um desenho plano. Cortando as linhas em todos os
// cruzamentos, cada "buraco" fechado desse desenho é uma quadra. O contorno do
// território entra como se fosse mais uma linha, então as quadras já saem
// recortadas na divisa e basta ficar com as que caem dentro dele.
//
// Tudo aqui trabalha em [lng, lat] (ordem do GeoJSON) e só converte para metros
// na hora de medir área, com a aproximação plana — suficiente para uma cidade.

import { poligonosDoContorno } from '@/lib/territorio'

export type Ponto = [number, number]
export type Anel = Ponto[]

export interface RuaOSM {
  id: number
  nome: string | null
  pontos: Ponto[]
}

export interface QuadraGerada {
  /** Anel fechado, no sentido anti-horário, em [lng, lat]. */
  anel: Anel
  areaM2: number
  /** Centro usado para ordenar e para o rótulo no mapa. */
  centro: Ponto
  /** Nomes das ruas que cercam a quadra, para conferência na lista. */
  ruas: string[]
}

export interface Caixa {
  sul: number
  oeste: number
  norte: number
  leste: number
}

/** Vias que não delimitam quadra (calçada, trilha, ciclovia…). */
const TIPOS_IGNORADOS = [
  'footway', 'path', 'steps', 'cycleway', 'bridleway', 'track', 'corridor',
  'construction', 'proposed', 'platform', 'raceway', 'elevator', 'escape',
  'bus_guideway', 'services', 'rest_area',
].join('|')

const ESPELHOS_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

/** Quadra pequena demais costuma ser canteiro/rotatória; grande demais, mato. */
export const AREA_MINIMA_M2 = 400
export const AREA_MAXIMA_M2 = 150_000

/**
 * Largura média mínima (4 × área ÷ perímetro). Corta as tiras compridas e
 * finas que aparecem entre uma rua e o contorno e não são quadra nenhuma.
 */
const LARGURA_MINIMA_M = 10

/** Margem em volta do território, para pegar as ruas que fazem a divisa. */
const MARGEM_BUSCA_M = 80

/** ~11 cm: junta pontas que o OSM traz quase iguais. */
const PRECISAO = 1e-6

const METROS_POR_GRAU_LAT = 111_320

// ── Medidas ──────────────────────────────────────────────────────────────────

function metrosPorGrauLng(lat: number): number {
  return METROS_POR_GRAU_LAT * Math.cos((lat * Math.PI) / 180)
}

/** Área com sinal em m²: positiva no sentido anti-horário. */
function areaAssinadaM2(anel: Anel, latReferencia: number): number {
  const fatorX = metrosPorGrauLng(latReferencia)
  let soma = 0
  for (let i = 0; i < anel.length - 1; i++) {
    const [x1, y1] = anel[i]
    const [x2, y2] = anel[i + 1]
    soma += (x1 * fatorX) * (y2 * METROS_POR_GRAU_LAT) - (x2 * fatorX) * (y1 * METROS_POR_GRAU_LAT)
  }
  return soma / 2
}

function perimetroM(anel: Anel, latReferencia: number): number {
  const fatorX = metrosPorGrauLng(latReferencia)
  let soma = 0
  for (let i = 0; i < anel.length - 1; i++) {
    const dx = (anel[i + 1][0] - anel[i][0]) * fatorX
    const dy = (anel[i + 1][1] - anel[i][1]) * METROS_POR_GRAU_LAT
    soma += Math.hypot(dx, dy)
  }
  return soma
}

/** Ponto dentro do anel pelo método do raio (anel fechado). */
function pontoEmAnel(ponto: Ponto, anel: Anel): boolean {
  const [x, y] = ponto
  let dentro = false
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i]
    const [xj, yj] = anel[j]
    const cruza = yi > y !== yj > y
    if (cruza && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

/** Dentro de algum polígono do contorno e fora dos buracos dele. */
export function dentroDoContorno(ponto: Ponto, poligonos: Anel[][]): boolean {
  for (const poligono of poligonos) {
    const [externo, ...buracos] = poligono
    if (!pontoEmAnel(ponto, externo)) continue
    if (buracos.some((buraco) => pontoEmAnel(ponto, buraco))) continue
    return true
  }
  return false
}

/**
 * Um ponto garantidamente dentro do anel: o centroide serve na maioria das
 * vezes, mas em quadra em "L" ele cai fora, e aí vale o meio do maior trecho
 * interno na altura do meio do anel.
 */
export function pontoInternoDoAnel(anel: Anel): Ponto {
  const vertices = anel.slice(0, -1) // sem o ponto repetido do fechamento
  const xs = vertices.map((p) => p[0])
  const ys = vertices.map((p) => p[1])
  const centro: Ponto = [
    xs.reduce((s, v) => s + v, 0) / vertices.length,
    ys.reduce((s, v) => s + v, 0) / vertices.length,
  ]
  if (pontoEmAnel(centro, anel)) return centro

  const y = (Math.min(...ys) + Math.max(...ys)) / 2
  const cortes: number[] = []
  for (let i = 0; i < anel.length - 1; i++) {
    const [x1, y1] = anel[i]
    const [x2, y2] = anel[i + 1]
    if (y1 > y === y2 > y) continue
    cortes.push(x1 + ((x2 - x1) * (y - y1)) / (y2 - y1))
  }
  cortes.sort((a, b) => a - b)

  let melhor: Ponto = centro
  let maiorVao = -1
  for (let i = 0; i + 1 < cortes.length; i += 2) {
    const vao = cortes[i + 1] - cortes[i]
    if (vao > maiorVao) {
      maiorVao = vao
      melhor = [(cortes[i] + cortes[i + 1]) / 2, y]
    }
  }
  return melhor
}

// ── Consulta ao OpenStreetMap ────────────────────────────────────────────────

export function caixaDoContorno(poligonos: Anel[][], margemMetros = MARGEM_BUSCA_M): Caixa | null {
  let sul = Infinity, oeste = Infinity, norte = -Infinity, leste = -Infinity
  for (const poligono of poligonos) {
    for (const [x, y] of poligono[0]) {
      sul = Math.min(sul, y); norte = Math.max(norte, y)
      oeste = Math.min(oeste, x); leste = Math.max(leste, x)
    }
  }
  if (!Number.isFinite(sul) || !Number.isFinite(oeste)) return null

  const margemLat = margemMetros / METROS_POR_GRAU_LAT
  const margemLng = margemMetros / metrosPorGrauLng((sul + norte) / 2)
  return {
    sul: sul - margemLat, norte: norte + margemLat,
    oeste: oeste - margemLng, leste: leste + margemLng,
  }
}

export function consultaRuas(caixa: Caixa): string {
  const area = [caixa.sul, caixa.oeste, caixa.norte, caixa.leste]
    .map((valor) => valor.toFixed(6)).join(',')
  return `[out:json][timeout:60];
way["highway"]["highway"!~"^(${TIPOS_IGNORADOS})$"]["area"!="yes"](${area});
out geom;`
}

export function lerRuasDoOverpass(resposta: unknown): RuaOSM[] {
  const elementos = (resposta as { elements?: unknown[] } | null)?.elements
  if (!Array.isArray(elementos)) return []

  const ruas: RuaOSM[] = []
  for (const elemento of elementos) {
    const via = elemento as {
      type?: string
      id?: number
      tags?: Record<string, string>
      geometry?: { lat: number; lon: number }[]
    }
    if (via.type !== 'way' || !Array.isArray(via.geometry) || via.geometry.length < 2) continue
    const pontos = via.geometry
      .filter((g) => Number.isFinite(g?.lat) && Number.isFinite(g?.lon))
      .map((g) => [g.lon, g.lat] as Ponto)
    if (pontos.length < 2) continue
    ruas.push({ id: via.id ?? 0, nome: via.tags?.name ?? null, pontos })
  }
  return ruas
}

/** Consulta a Overpass; se o primeiro espelho falhar, tenta o seguinte. */
export async function buscarRuas(caixa: Caixa, sinal?: AbortSignal): Promise<RuaOSM[]> {
  const consulta = consultaRuas(caixa)
  let ultimoErro: unknown = null

  for (const espelho of ESPELHOS_OVERPASS) {
    try {
      const resposta = await fetch(espelho, {
        method: 'POST',
        body: consulta,
        headers: { 'Content-Type': 'text/plain' },
        signal: sinal,
      })
      if (!resposta.ok) throw new Error(`Overpass respondeu ${resposta.status}`)
      return lerRuasDoOverpass(await resposta.json())
    } catch (erro) {
      if (sinal?.aborted) throw erro
      ultimoErro = erro
    }
  }
  throw new Error(
    `Não foi possível consultar o OpenStreetMap (${ultimoErro instanceof Error ? ultimoErro.message : 'sem resposta'}). Tente de novo em alguns segundos.`
  )
}

// ── Cortar as linhas nos cruzamentos ─────────────────────────────────────────

interface Segmento {
  a: Ponto
  b: Ponto
  /** Nome da rua; `null` numa rua sem nome e `false` no contorno do território. */
  rua: string | null | false
}

function segmentosDaLinha(pontos: Ponto[], rua: string | null | false): Segmento[] {
  const segmentos: Segmento[] = []
  for (let i = 0; i + 1 < pontos.length; i++) {
    const a = pontos[i]
    const b = pontos[i + 1]
    if (a[0] === b[0] && a[1] === b[1]) continue
    segmentos.push({ a, b, rua })
  }
  return segmentos
}

const CELULA = 0.0005 // ~55 m

function celulasDoSegmento(segmento: Segmento): string[] {
  const x0 = Math.floor(Math.min(segmento.a[0], segmento.b[0]) / CELULA)
  const x1 = Math.floor(Math.max(segmento.a[0], segmento.b[0]) / CELULA)
  const y0 = Math.floor(Math.min(segmento.a[1], segmento.b[1]) / CELULA)
  const y1 = Math.floor(Math.max(segmento.a[1], segmento.b[1]) / CELULA)
  const celulas: string[] = []
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) celulas.push(`${x}:${y}`)
  }
  return celulas
}

/**
 * Quebra os segmentos em todo ponto onde dois deles se cruzam — sem isso o
 * cruzamento de duas ruas não vira um nó e nenhuma quadra fecha.
 */
function nodear(segmentos: Segmento[]): Segmento[] {
  const grade = new Map<string, number[]>()
  segmentos.forEach((segmento, i) => {
    for (const celula of celulasDoSegmento(segmento)) {
      const lista = grade.get(celula)
      if (lista) lista.push(i)
      else grade.set(celula, [i])
    }
  })

  const cortes: number[][] = segmentos.map(() => [])
  const conferidos = new Set<string>()

  for (const lista of grade.values()) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i]
        const b = lista[j]
        const chave = `${a}:${b}`
        if (conferidos.has(chave)) continue
        conferidos.add(chave)

        const [x1, y1] = segmentos[a].a
        const [x2, y2] = segmentos[a].b
        const [x3, y3] = segmentos[b].a
        const [x4, y4] = segmentos[b].b
        const denominador = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
        if (Math.abs(denominador) < 1e-14) continue // paralelos

        const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / denominador
        const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / denominador
        const margem = 1e-9
        if (t < -margem || t > 1 + margem || u < -margem || u > 1 + margem) continue

        // Só corta o segmento onde o cruzamento cai no meio dele; num encontro
        // em T, a rua que termina ali já tem ponta no lugar certo.
        if (t > margem && t < 1 - margem) cortes[a].push(t)
        if (u > margem && u < 1 - margem) cortes[b].push(u)
      }
    }
  }

  const resultado: Segmento[] = []
  segmentos.forEach((segmento, i) => {
    const posicoes = [0, ...cortes[i].sort((p, q) => p - q), 1]
    for (let k = 0; k + 1 < posicoes.length; k++) {
      const inicio = posicoes[k]
      const fim = posicoes[k + 1]
      if (fim - inicio < 1e-12) continue
      const em = (t: number): Ponto => [
        segmento.a[0] + (segmento.b[0] - segmento.a[0]) * t,
        segmento.a[1] + (segmento.b[1] - segmento.a[1]) * t,
      ]
      resultado.push({ a: em(inicio), b: em(fim), rua: segmento.rua })
    }
  })
  return resultado
}

// ── Grafo plano ──────────────────────────────────────────────────────────────

interface No {
  x: number
  y: number
  vizinhos: number[]
}

interface Grafo {
  nos: No[]
  /** Nomes de rua por aresta, para dizer que ruas cercam cada quadra. */
  ruas: Map<string, Set<string>>
  /** Arestas que vieram de rua; o resto é contorno do território. */
  arestasDeRua: Set<string>
}

function chaveAresta(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function construirGrafo(segmentos: Segmento[]): Grafo {
  const indices = new Map<string, number>()
  const nos: No[] = []
  const ruas = new Map<string, Set<string>>()
  const arestasDeRua = new Set<string>()

  const indiceDoPonto = (ponto: Ponto): number => {
    const chave = `${Math.round(ponto[0] / PRECISAO)}:${Math.round(ponto[1] / PRECISAO)}`
    const existente = indices.get(chave)
    if (existente !== undefined) return existente
    const indice = nos.length
    indices.set(chave, indice)
    nos.push({ x: ponto[0], y: ponto[1], vizinhos: [] })
    return indice
  }

  for (const segmento of segmentos) {
    const a = indiceDoPonto(segmento.a)
    const b = indiceDoPonto(segmento.b)
    if (a === b) continue
    if (!nos[a].vizinhos.includes(b)) nos[a].vizinhos.push(b)
    if (!nos[b].vizinhos.includes(a)) nos[b].vizinhos.push(a)
    const chave = chaveAresta(a, b)
    if (segmento.rua !== false) arestasDeRua.add(chave)
    if (segmento.rua) {
      const nomes = ruas.get(chave) ?? new Set<string>()
      nomes.add(segmento.rua)
      ruas.set(chave, nomes)
    }
  }
  return { nos, ruas, arestasDeRua }
}

/** Rua sem saída não fecha quadra nenhuma: sai do grafo antes da varredura. */
function podarPontas(nos: No[]): void {
  const fila: number[] = []
  nos.forEach((no, i) => { if (no.vizinhos.length === 1) fila.push(i) })

  while (fila.length > 0) {
    const i = fila.pop() as number
    const no = nos[i]
    if (no.vizinhos.length !== 1) continue
    const vizinho = no.vizinhos[0]
    no.vizinhos = []
    nos[vizinho].vizinhos = nos[vizinho].vizinhos.filter((v) => v !== i)
    if (nos[vizinho].vizinhos.length === 1) fila.push(vizinho)
  }
}

/**
 * Menores ciclos do grafo (as faces do desenho). Em cada nó as arestas ficam
 * ordenadas por ângulo; chegando por u→v, a próxima é a vizinha de v logo em
 * sentido horário a partir de u. Isso percorre cada face interna no sentido
 * anti-horário — a face de fora é a única que sai no sentido inverso.
 */
function extrairFaces(nos: No[]): number[][] {
  for (const no of nos) {
    no.vizinhos.sort((a, b) =>
      Math.atan2(nos[a].y - no.y, nos[a].x - no.x) - Math.atan2(nos[b].y - no.y, nos[b].x - no.x)
    )
  }

  const visitadas = new Set<string>()
  const faces: number[][] = []
  const limite = nos.length * 2 + 8

  for (let inicio = 0; inicio < nos.length; inicio++) {
    for (const primeiro of nos[inicio].vizinhos) {
      if (visitadas.has(`${inicio}>${primeiro}`)) continue

      const ciclo: number[] = []
      let atual = inicio
      let proximo = primeiro
      let completo = false

      while (ciclo.length <= limite) {
        visitadas.add(`${atual}>${proximo}`)
        ciclo.push(atual)
        const vizinhos = nos[proximo].vizinhos
        const posicao = vizinhos.indexOf(atual)
        if (posicao < 0) break
        const seguinte = vizinhos[(posicao - 1 + vizinhos.length) % vizinhos.length]
        atual = proximo
        proximo = seguinte
        if (atual === inicio && proximo === primeiro) { completo = true; break }
      }

      if (completo && ciclo.length >= 3) faces.push(ciclo)
    }
  }
  return faces
}

// ── Geração ──────────────────────────────────────────────────────────────────

export interface ResultadoGeracao {
  quadras: QuadraGerada[]
  /** Faces descartadas por tamanho/formato ou por ficarem fora do contorno. */
  descartadas: number
}

export function gerarQuadras(opcoes: {
  contorno: unknown
  ruas: RuaOSM[]
  areaMinimaM2?: number
  areaMaximaM2?: number
}): ResultadoGeracao {
  const areaMinima = opcoes.areaMinimaM2 ?? AREA_MINIMA_M2
  const areaMaxima = opcoes.areaMaximaM2 ?? AREA_MAXIMA_M2

  const poligonos = poligonosDoContorno(opcoes.contorno)
    .map((poligono) => poligono.map((anel) => anel.map((p) => [p[0], p[1]] as Ponto)))
  if (poligonos.length === 0) return { quadras: [], descartadas: 0 }

  const segmentos: Segmento[] = []
  for (const rua of opcoes.ruas) segmentos.push(...segmentosDaLinha(rua.pontos, rua.nome))
  // O contorno entra junto: é ele que recorta as quadras na divisa do território
  for (const poligono of poligonos) {
    for (const anel of poligono) segmentos.push(...segmentosDaLinha(anel, false))
  }
  if (segmentos.length === 0) return { quadras: [], descartadas: 0 }

  const grafo = construirGrafo(nodear(segmentos))
  podarPontas(grafo.nos)

  const latReferencia = grafo.nos.length > 0
    ? grafo.nos.reduce((soma, no) => soma + no.y, 0) / grafo.nos.length
    : 0

  const quadras: QuadraGerada[] = []
  const vistas = new Set<string>()
  let descartadas = 0

  for (const ciclo of extrairFaces(grafo.nos)) {
    const anel: Anel = ciclo.map((i) => [grafo.nos[i].x, grafo.nos[i].y] as Ponto)
    anel.push(anel[0])

    const area = areaAssinadaM2(anel, latReferencia)
    if (area <= 0) continue // face de fora, percorrida no sentido inverso
    if (area < areaMinima || area > areaMaxima) { descartadas++; continue }

    const perimetro = perimetroM(anel, latReferencia)
    if (perimetro > 0 && (4 * area) / perimetro < LARGURA_MINIMA_M) { descartadas++; continue }

    const centro = pontoInternoDoAnel(anel)
    if (!dentroDoContorno(centro, poligonos)) { descartadas++; continue }

    const chave = `${centro[0].toFixed(6)}:${centro[1].toFixed(6)}`
    if (vistas.has(chave)) continue

    const nomes = new Set<string>()
    let temRua = false
    for (let i = 0; i < ciclo.length; i++) {
      const aresta = chaveAresta(ciclo[i], ciclo[(i + 1) % ciclo.length])
      if (grafo.arestasDeRua.has(aresta)) temRua = true
      grafo.ruas.get(aresta)?.forEach((nome) => nomes.add(nome))
    }
    // Face cercada só pelo contorno é o próprio território, não uma quadra
    if (!temRua) { descartadas++; continue }
    vistas.add(chave)

    quadras.push({ anel, areaM2: Math.round(area), centro, ruas: [...nomes].sort() })
  }

  return { quadras: ordenarQuadras(quadras), descartadas }
}

export interface QuadrasDoTerritorio extends ResultadoGeracao {
  /** Quantas ruas vieram do OSM, para distinguir "região sem mapeamento" de "contorno errado". */
  ruasEncontradas: number
}

/**
 * O caminho completo de um território: contorno → ruas na Overpass → quadras.
 * `buscar` existe para os testes rodarem sem rede.
 */
export async function gerarQuadrasDoContorno(contorno: unknown, opcoes: {
  sinal?: AbortSignal
  buscar?: (caixa: Caixa, sinal?: AbortSignal) => Promise<RuaOSM[]>
} = {}): Promise<QuadrasDoTerritorio> {
  const poligonos = poligonosDoContorno(contorno).map(
    (poligono) => poligono.map((anel) => anel.map((p) => [p[0], p[1]] as Ponto))
  )
  const caixa = caixaDoContorno(poligonos)
  if (!caixa) return { quadras: [], descartadas: 0, ruasEncontradas: 0 }

  const ruas = await (opcoes.buscar ?? buscarRuas)(caixa, opcoes.sinal)
  return { ...gerarQuadras({ contorno, ruas }), ruasEncontradas: ruas.length }
}

/** Norte → sul e, dentro da mesma faixa, oeste → leste: a ordem da numeração. */
export function ordenarQuadras(quadras: QuadraGerada[]): QuadraGerada[] {
  const faixa = 120 / METROS_POR_GRAU_LAT // ~120 m: quadras vizinhas na mesma linha
  return [...quadras].sort((a, b) => {
    const linhaA = Math.round(a.centro[1] / faixa)
    const linhaB = Math.round(b.centro[1] / faixa)
    if (linhaA !== linhaB) return linhaB - linhaA
    return a.centro[0] - b.centro[0]
  })
}

/** Feature GeoJSON como o app grava em `quadras.geojson`. */
export function featureDaQuadra(quadra: QuadraGerada): Record<string, unknown> {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [quadra.anel] },
    properties: {
      origem: 'osm',
      area_m2: quadra.areaM2,
      ...(quadra.ruas.length > 0 ? { ruas: quadra.ruas } : {}),
    },
  }
}
