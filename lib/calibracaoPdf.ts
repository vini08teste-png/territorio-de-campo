// Calibração do cadastro extraído do PDF da prefeitura (ver public/cadastro-2015):
// o desenho não tem coordenada real embutida, então o usuário marca pares de
// pontos iguais (um no recorte do PDF, outro no mapa de verdade) e aqui a
// gente ajusta uma transformação afim por mínimos quadrados entre os dois
// espaços. Com 3+ pontos dá pra calcular; quanto mais espalhados, melhor.

export interface PontoControle {
  /** Ponto clicado no recorte do PDF, em pixel da imagem (ver imagem-info.json). */
  pdf: [number, number]
  /** Ponto correspondente no mapa de verdade, em [lat, lng]. */
  real: [number, number]
}

/** lat = a*x + b*y + c; lng = d*x + e*y + f (x,y = ponto no espaço do PDF). */
export interface Transformacao {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

function determinante3x3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  )
}

function substituirColuna(m: number[][], coluna: number, v: number[]): number[][] {
  return m.map((linha, i) => linha.map((valor, j) => (j === coluna ? v[i] : valor)))
}

/** Resolve o sistema 3x3 `m·x = v` pela regra de Cramer. */
function resolver3x3(m: number[][], v: number[]): [number, number, number] {
  const det = determinante3x3(m)
  if (Math.abs(det) < 1e-9) {
    throw new Error('Pontos de controle mal distribuídos — escolha pontos que não fiquem em linha reta.')
  }
  return [
    determinante3x3(substituirColuna(m, 0, v)) / det,
    determinante3x3(substituirColuna(m, 1, v)) / det,
    determinante3x3(substituirColuna(m, 2, v)) / det,
  ]
}

/**
 * Ajuste afim por mínimos quadrados: acha a transformação que mais se
 * aproxima de levar cada `pdf` no `real` correspondente. Com exatamente 3
 * pontos (não colineares) o ajuste é exato; com mais, sobra erro residual
 * (ver `erroMedioMetros`) que serve pra avaliar a qualidade da calibração.
 */
export function ajustarTransformacao(pontos: PontoControle[]): Transformacao {
  if (pontos.length < 3) {
    throw new Error('Precisa de pelo menos 3 pontos de controle pra calibrar.')
  }

  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, sn = 0
  let sxLat = 0, syLat = 0, sLat = 0
  let sxLng = 0, syLng = 0, sLng = 0

  for (const p of pontos) {
    const [x, y] = p.pdf
    const [lat, lng] = p.real
    sxx += x * x; sxy += x * y; sx += x
    syy += y * y; sy += y
    sn += 1
    sxLat += x * lat; syLat += y * lat; sLat += lat
    sxLng += x * lng; syLng += y * lng; sLng += lng
  }

  const matrizNormal = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, sn],
  ]

  const [a, b, c] = resolver3x3(matrizNormal, [sxLat, syLat, sLat])
  const [d, e, f] = resolver3x3(matrizNormal, [sxLng, syLng, sLng])
  return { a, b, c, d, e, f }
}

/** Aplica a transformação a um ponto do PDF, devolvendo `[lat, lng]`. */
export function aplicarTransformacao(t: Transformacao, ponto: [number, number]): [number, number] {
  const [x, y] = ponto
  return [t.a * x + t.b * y + t.c, t.d * x + t.e * y + t.f]
}

/** Anel do PDF transformado pra `[lng, lat]` (ordem do GeoJSON, igual `lib/quadrasOSM.ts`). */
export function transformarAnel(t: Transformacao, anelPdf: [number, number][]): [number, number][] {
  return anelPdf.map((ponto) => {
    const [lat, lng] = aplicarTransformacao(t, ponto)
    return [lng, lat] as [number, number]
  })
}

/** Desloca a transformação por um offset em metros (ajuste fino manual, depois do ajuste automático). */
export function deslocarTransformacao(t: Transformacao, dLatMetros: number, dLngMetros: number, latReferencia: number): Transformacao {
  const dLat = dLatMetros / METROS_POR_GRAU_LAT
  const dLng = dLngMetros / metrosPorGrauLng(latReferencia)
  return { ...t, c: t.c + dLat, f: t.f + dLng }
}

/**
 * Gira a transformação por um ângulo (graus) ao redor de um pivô real
 * (lat, lng) — ajuste fino manual. Reconstrói a,b,c,d,e,f girando 3 pontos
 * de referência (origem e os dois eixos do espaço do PDF) em torno do
 * pivô, num espaço local em metros (senão a rotação sairia distorcida,
 * já que 1° de latitude e 1° de longitude não valem a mesma distância).
 */
export function girarTransformacao(t: Transformacao, anguloGraus: number, pivot: [number, number]): Transformacao {
  const [pivLat, pivLng] = pivot
  const mLng = metrosPorGrauLng(pivLat)
  const rad = (anguloGraus * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  function girarPonto([lat, lng]: [number, number]): [number, number] {
    const xm = (lng - pivLng) * mLng
    const ym = (lat - pivLat) * METROS_POR_GRAU_LAT
    const xm2 = xm * cos - ym * sin
    const ym2 = xm * sin + ym * cos
    return [pivLat + ym2 / METROS_POR_GRAU_LAT, pivLng + xm2 / mLng]
  }

  const p0 = girarPonto(aplicarTransformacao(t, [0, 0]))
  const px = girarPonto(aplicarTransformacao(t, [1, 0]))
  const py = girarPonto(aplicarTransformacao(t, [0, 1]))
  return {
    a: px[0] - p0[0], d: px[1] - p0[1],
    b: py[0] - p0[0], e: py[1] - p0[1],
    c: p0[0], f: p0[1],
  }
}

const METROS_POR_GRAU_LAT = 111_320

function metrosPorGrauLng(latReferencia: number): number {
  return METROS_POR_GRAU_LAT * Math.cos((latReferencia * Math.PI) / 180)
}

/**
 * Erro médio (em metros) entre onde a transformação manda cada ponto de
 * controle e onde ele devia cair de verdade — mostra na tela se a calibração
 * ficou boa (poucos metros) ou ruim (dezenas/centenas de metros).
 */
export function erroMedioMetros(t: Transformacao, pontos: PontoControle[]): number {
  if (pontos.length === 0) return 0
  const fatorLng = metrosPorGrauLng(pontos[0].real[0])
  let soma = 0
  for (const p of pontos) {
    const [lat, lng] = aplicarTransformacao(t, p.pdf)
    const dLat = (lat - p.real[0]) * METROS_POR_GRAU_LAT
    const dLng = (lng - p.real[1]) * fatorLng
    soma += Math.hypot(dLat, dLng)
  }
  return soma / pontos.length
}
