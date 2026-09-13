// Regras de território que não dependem de tela: contorno (GeoJSON gerado pelo
// editor de territórios), rota no Google Maps e leitura do arquivo de importação.

type Posicao = number[]
type Anel = Posicao[]

interface GeometriaPoligono {
  type: 'Polygon'
  coordinates: Anel[]
}

interface GeometriaMultiPoligono {
  type: 'MultiPolygon'
  coordinates: Anel[][]
}

type Geometria = GeometriaPoligono | GeometriaMultiPoligono

export interface ContornoTerritorio {
  type: 'Feature'
  geometry: Geometria
  properties: Record<string, unknown>
}

export interface TerritorioImportado {
  numero: number
  localidade: string
  publicadores: number | null
  familias: number | null
  link_maps: string | null
  geojson: ContornoTerritorio
}

// ── Conversões de campos ──────────────────────────────────────────────────────

export function inteiroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'string' && valor.trim() === '') return null
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero < 0) return null
  return Math.round(numero)
}

export function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  if (!texto) return null
  return texto
}

export function formatarNumeroTerritorio(numero: number): string {
  return String(numero).padStart(2, '0')
}

export function escaparHtml(texto: string): string {
  const substituicoes: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }
  return texto.replace(/[&<>"']/g, (caractere) => substituicoes[caractere])
}

export function resumoPublicadoresFamilias(territorio: {
  publicadores?: number | null
  familias?: number | null
}): string | null {
  const partes: string[] = []
  if (territorio.publicadores !== null && territorio.publicadores !== undefined) {
    partes.push(`👥 ${territorio.publicadores} publicador(es)`)
  }
  if (territorio.familias !== null && territorio.familias !== undefined) {
    partes.push(`🏠 ${territorio.familias} família(s)`)
  }
  if (partes.length === 0) return null
  return partes.join(' · ')
}

// ── Geometria ─────────────────────────────────────────────────────────────────

function extrairGeometria(valor: unknown): Geometria | null {
  if (!valor || typeof valor !== 'object') return null
  const objeto = valor as { type?: string; geometry?: unknown; coordinates?: unknown }
  if (objeto.type === 'Feature') return extrairGeometria(objeto.geometry)
  if ((objeto.type === 'Polygon' || objeto.type === 'MultiPolygon') && Array.isArray(objeto.coordinates)) {
    return objeto as Geometria
  }
  return null
}

// Área com sinal pela fórmula do laço (em graus², só para comparar e achar o centroide)
function areaAssinada(anel: Anel): number {
  let soma = 0
  for (let i = 0; i < anel.length - 1; i++) {
    soma += anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1]
  }
  return soma / 2
}

// Anel externo do polígono (o maior, se for MultiPolygon)
function anelPrincipal(geometria: Geometria): Anel | null {
  if (geometria.type === 'Polygon') return geometria.coordinates[0] ?? null
  let maior: Anel | null = null
  let maiorArea = -1
  for (const poligono of geometria.coordinates) {
    const anel = poligono[0]
    if (!anel) continue
    const area = Math.abs(areaAssinada(anel))
    if (area > maiorArea) {
      maior = anel
      maiorArea = area
    }
  }
  return maior
}

/**
 * Polígonos do contorno, cada um com o anel externo primeiro e os buracos
 * depois. Um Polygon vira uma lista de um item; MultiPolygon, uma por parte.
 */
export function poligonosDoContorno(geojson: unknown): Anel[][] {
  const geometria = extrairGeometria(geojson)
  if (!geometria) return []
  const poligonos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates
  return poligonos
    .map((poligono) => poligono.filter((anel) => anel.length >= 4))
    .filter((poligono) => poligono.length > 0)
}

/** Centroide do contorno do território, em [lat, lng]. */
export function centroDoContorno(geojson: unknown): [number, number] | null {
  const geometria = extrairGeometria(geojson)
  if (!geometria) return null
  const anel = anelPrincipal(geometria)
  if (!anel || anel.length < 4) return null

  const area = areaAssinada(anel)
  if (Math.abs(area) < 1e-12) {
    const lng = anel.reduce((soma, p) => soma + p[0], 0) / anel.length
    const lat = anel.reduce((soma, p) => soma + p[1], 0) / anel.length
    return [lat, lng]
  }

  let x = 0
  let y = 0
  for (let i = 0; i < anel.length - 1; i++) {
    const fator = anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1]
    x += (anel[i][0] + anel[i + 1][0]) * fator
    y += (anel[i][1] + anel[i + 1][1]) * fator
  }
  return [y / (6 * area), x / (6 * area)]
}

/**
 * Link para abrir a rota até o território no Google Maps: usa o centro do
 * contorno e, sem contorno, o link do QR code do cartão.
 */
export function linkComoChegar(territorio: { geojson?: unknown; link_maps?: string | null }): string | null {
  const centro = centroDoContorno(territorio.geojson)
  if (centro) {
    const [lat, lng] = centro
    return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`
  }
  if (territorio.link_maps && /^https?:\/\//i.test(territorio.link_maps)) {
    return territorio.link_maps
  }
  return null
}

// ── Importação do GeoJSON do editor ──────────────────────────────────────────

export function lerTerritoriosDoGeoJSON(conteudo: unknown): { territorios: TerritorioImportado[]; ignorados: number } {
  const colecao = conteudo as { type?: string; features?: unknown[] } | null
  if (!colecao || colecao.type !== 'FeatureCollection' || !Array.isArray(colecao.features)) {
    throw new Error('O arquivo precisa ser um GeoJSON do tipo FeatureCollection, exportado pelo editor de territórios.')
  }

  const territorios: TerritorioImportado[] = []
  let ignorados = 0

  for (const feature of colecao.features) {
    const geometria = extrairGeometria(feature)
    const propriedades = (feature as { properties?: Record<string, unknown> | null }).properties ?? {}
    const numero = inteiroOuNulo(propriedades.numero)
    if (!geometria || numero === null || numero === 0) {
      ignorados++
      continue
    }
    territorios.push({
      numero,
      localidade: textoOuNulo(propriedades.localidade) ?? '',
      publicadores: inteiroOuNulo(propriedades.publicadores),
      familias: inteiroOuNulo(propriedades.familias),
      link_maps: textoOuNulo(propriedades.link_maps),
      geojson: { type: 'Feature', geometry: geometria, properties: { numero } },
    })
  }

  return { territorios, ignorados }
}
