// Testes das regras de geração de quadras. Rode com `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  caixaDoContorno, consultaRuas, featureDaQuadra, gerarQuadras, lerRuasDoOverpass,
  type Ponto, type RuaOSM,
} from '@/lib/quadrasOSM'
import { gerarLados, nomeDaQuadra, proximaSequencia } from '@/lib/quadras'

const LAT = -6.52
const LNG = -49.85
const P = 0.001 // ~111 m

function ponto(coluna: number, linha: number): Ponto {
  return [LNG + coluna * P, LAT + linha * P]
}

// Grade 3x3 de ruas → 4 quadras
function ruasGrade(): RuaOSM[] {
  const ruas: RuaOSM[] = []
  for (let linha = 0; linha <= 2; linha++) {
    ruas.push({ id: 100 + linha, nome: `Rua ${linha}`, pontos: [ponto(0, linha), ponto(2, linha)] })
  }
  for (let col = 0; col <= 2; col++) {
    ruas.push({ id: 200 + col, nome: `Avenida ${col}`, pontos: [ponto(col, 0), ponto(col, 2)] })
  }
  return ruas
}

function contorno(coords: Ponto[]) {
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] }, properties: {} }
}

const contornoTudo = contorno([ponto(-0.2, -0.2), ponto(2.2, -0.2), ponto(2.2, 2.2), ponto(-0.2, 2.2)])

test('grade de ruas vira quatro quadras', () => {
  const { quadras } = gerarQuadras({ contorno: contornoTudo, ruas: ruasGrade() })
  assert.equal(quadras.length, 4)
  for (const q of quadras) {
    assert.ok(Math.abs(q.areaM2 - 111 * 111) < 3000, `área inesperada: ${q.areaM2}`)
    assert.equal(q.anel[0][0], q.anel[q.anel.length - 1][0])
    assert.equal(q.anel.length, 5)
  }
})

test('ordem é norte→sul, oeste→leste', () => {
  const { quadras } = gerarQuadras({ contorno: contornoTudo, ruas: ruasGrade() })
  const centros = quadras.map((q) => [Number(((q.centro[0] - LNG) / P).toFixed(2)), Number(((q.centro[1] - LAT) / P).toFixed(2))])
  assert.deepEqual(centros, [[0.5, 1.5], [1.5, 1.5], [0.5, 0.5], [1.5, 0.5]])
})

test('ruas que se cruzam no meio do segmento também fecham quadra', () => {
  const ruas: RuaOSM[] = [
    { id: 1, nome: 'Horizontal baixo', pontos: [ponto(-0.5, 0), ponto(2.5, 0)] },
    { id: 2, nome: 'Horizontal alto', pontos: [ponto(-0.5, 1), ponto(2.5, 1)] },
    { id: 3, nome: 'Vertical esquerda', pontos: [ponto(0, -0.5), ponto(0, 1.5)] },
    { id: 4, nome: 'Vertical direita', pontos: [ponto(1, -0.5), ponto(1, 1.5)] },
  ]
  const { quadras } = gerarQuadras({ contorno: contornoTudo, ruas })
  const central = quadras.find((q) => Math.abs(q.areaM2 - 111 * 111) < 3000)
  assert.ok(central, 'quadra fechada pelas quatro ruas não apareceu')
  assert.deepEqual(central.ruas, ['Horizontal alto', 'Horizontal baixo', 'Vertical direita', 'Vertical esquerda'])
})

test('contorno recorta a quadra na divisa', () => {
  const meia = contorno([ponto(-0.05, -0.05), ponto(2.05, -0.05), ponto(2.05, 0.5), ponto(-0.05, 0.5)])
  // área mínima alta: interessa só a meia quadra, não a franja da divisa
  const { quadras } = gerarQuadras({ contorno: meia, ruas: ruasGrade(), areaMinimaM2: 3000 })
  assert.equal(quadras.length, 2)
  for (const q of quadras) {
    assert.ok(q.areaM2 < 111 * 111 * 0.7, `deveria ser meia quadra: ${q.areaM2}`)
    assert.ok(q.areaM2 > 111 * 55 * 0.7)
  }
})

test('rua sem saída não atrapalha', () => {
  const ruas = [...ruasGrade(), { id: 999, nome: 'Sem saída', pontos: [ponto(0.5, 0), ponto(0.5, 0.5)] as Ponto[] }]
  const { quadras } = gerarQuadras({ contorno: contornoTudo, ruas })
  assert.equal(quadras.length, 4)
})

test('área fora dos limites é descartada', () => {
  const r = gerarQuadras({ contorno: contornoTudo, ruas: ruasGrade(), areaMinimaM2: 20000 })
  assert.equal(r.quadras.length, 0)
  assert.ok(r.descartadas >= 4)
})

test('território sem contorno não gera nada', () => {
  const { quadras } = gerarQuadras({ contorno: null, ruas: ruasGrade() })
  assert.equal(quadras.length, 0)
})

test('lê a resposta da Overpass', () => {
  const ruas = lerRuasDoOverpass({ elements: [
    { type: 'way', id: 7, tags: { name: 'Rua A', highway: 'residential' }, geometry: [{ lat: -6.52, lon: -49.85 }, { lat: -6.521, lon: -49.85 }] },
    { type: 'node', id: 8, lat: 1, lon: 2 },
    { type: 'way', id: 9, geometry: [{ lat: -6.52, lon: -49.85 }] },
  ] })
  assert.equal(ruas.length, 1)
  assert.equal(ruas[0].nome, 'Rua A')
  assert.deepEqual(ruas[0].pontos, [[-49.85, -6.52], [-49.85, -6.521]])
})

test('consulta cobre o contorno com margem', () => {
  const caixa = caixaDoContorno([[[ponto(0, 0), ponto(1, 0), ponto(1, 1), ponto(0, 1), ponto(0, 0)]]])!
  assert.ok(caixa.sul < LAT && caixa.norte > LAT + P)
  assert.ok(caixa.oeste < LNG && caixa.leste > LNG + P)
  assert.match(consultaRuas(caixa), /way\["highway"\]/)
})

test('nomes em sequência dentro do território', () => {
  assert.equal(nomeDaQuadra('21', 1), '21-01')
  assert.equal(nomeDaQuadra('2', 12), '02-12')
  assert.equal(proximaSequencia(['21-01', '21-07', 'Quadra A'], '21'), 8)
  assert.equal(proximaSequencia([], '06'), 1)
})

test('lados saem um por aresta', () => {
  const lados = gerarLados([[0, 0], [1, 0], [1, 1], [0, 0]])
  assert.equal(lados.length, 3)
  assert.deepEqual(lados[2].fim, [0, 0])
})

test('bairro irregular: diagonal, curva e rua sem saída', () => {
  const ruas: RuaOSM[] = [
    { id: 1, nome: 'Avenida', pontos: [ponto(0, 0), ponto(3, 0)] },
    { id: 2, nome: 'Rua de cima', pontos: [ponto(0, 2), ponto(3, 2)] },
    { id: 3, nome: 'Travessa oeste', pontos: [ponto(0, 0), ponto(0, 2)] },
    { id: 4, nome: 'Travessa leste', pontos: [ponto(3, 0), ponto(3, 2)] },
    { id: 5, nome: 'Diagonal', pontos: [ponto(0, 0), ponto(3, 2)] },
    { id: 6, nome: 'Curva', pontos: [ponto(1, 0), ponto(1.2, 0.8), ponto(2, 1.1), ponto(3, 1.2)] },
    { id: 7, nome: 'Sem saída', pontos: [ponto(2, 2), ponto(2, 1.6)] },
  ]
  const contornoBairro = contorno([ponto(-0.3, -0.3), ponto(3.3, -0.3), ponto(3.3, 2.3), ponto(-0.3, 2.3)])
  const { quadras } = gerarQuadras({ contorno: contornoBairro, ruas })

  assert.ok(quadras.length >= 3, `esperava ao menos 3 quadras, veio ${quadras.length}`)
  const areaTotal = quadras.reduce((soma, q) => soma + q.areaM2, 0)
  // O quarteirão inteiro tem ~333 m × ~222 m; as partes não podem passar disso
  assert.ok(areaTotal <= 333 * 222 * 1.05, `soma das áreas alta demais: ${areaTotal}`)
  for (const q of quadras) {
    assert.deepEqual(q.anel[0], q.anel[q.anel.length - 1], 'anel precisa vir fechado')
    assert.ok(q.areaM2 > 0)
    assert.ok(q.ruas.length > 0, 'quadra sem nenhuma rua em volta')
  }
})

test('quadra gravada vira Feature com um lado por aresta', () => {
  const { quadras } = gerarQuadras({ contorno: contornoTudo, ruas: ruasGrade() })
  const feature = featureDaQuadra(quadras[0]) as {
    type: string
    geometry: { type: string; coordinates: Ponto[][] }
    properties: Record<string, unknown>
  }
  assert.equal(feature.type, 'Feature')
  assert.equal(feature.geometry.type, 'Polygon')
  assert.equal(feature.geometry.coordinates[0].length, 5)
  assert.equal(feature.properties.origem, 'osm')

  const lados = gerarLados(quadras[0].anel)
  assert.equal(lados.length, 4)
  assert.deepEqual(lados[0].inicio, quadras[0].anel[0])
  assert.deepEqual(lados[3].fim, quadras[0].anel[0])
  assert.ok(lados.every((l) => l.status === 'nao_iniciado'))
})

test('tira fina entre a rua e a divisa não vira quadra', () => {
  // Contorno 5 m acima da rua de baixo: a faixa que sobra é comprida e fina
  const faixa = 5 / 111320 / 0.001 // em unidades de P
  const ruas: RuaOSM[] = [
    { id: 1, nome: 'Rua de baixo', pontos: [ponto(0, 0), ponto(2, 0)] },
    { id: 2, nome: 'Rua de cima', pontos: [ponto(0, 1), ponto(2, 1)] },
    { id: 3, nome: 'Travessa oeste', pontos: [ponto(0, 0), ponto(0, 1)] },
    { id: 4, nome: 'Travessa leste', pontos: [ponto(2, 0), ponto(2, 1)] },
  ]
  const contornoBaixo = contorno([
    ponto(-0.001, -faixa), ponto(2.001, -faixa), ponto(2.001, 1.001), ponto(-0.001, 1.001),
  ])
  const { quadras } = gerarQuadras({ contorno: contornoBaixo, ruas })
  assert.equal(quadras.length, 1)
  assert.ok(quadras[0].areaM2 > 20000, `deveria ser o quarteirão inteiro: ${quadras[0].areaM2}`)
})
