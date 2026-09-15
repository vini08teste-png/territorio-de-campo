// Testes do ajuste de calibração do cadastro em PDF. Rode com `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ajustarTransformacao, aplicarTransformacao, erroMedioMetros, transformarAnel, type PontoControle,
} from '@/lib/calibracaoPdf'

const LAT0 = -6.52695
const LNG0 = -49.85265

/** Transformação "de verdade" usada pra gerar os pontos de controle nos testes: gira, escala e desloca. */
function transformacaoConhecida(ponto: [number, number]): [number, number] {
  const [x, y] = ponto
  const angulo = 0.05 // leve rotação, como um desenho não perfeitamente alinhado ao norte
  const escala = 1 / 2500 // graus por "ponto" do PDF, só pra ter uma escala plausível
  const xr = x * Math.cos(angulo) - y * Math.sin(angulo)
  const yr = x * Math.sin(angulo) + y * Math.cos(angulo)
  return [LAT0 + yr * escala, LNG0 + xr * escala]
}

function pontosControle(pdfs: [number, number][]): PontoControle[] {
  return pdfs.map((pdf) => ({ pdf, real: transformacaoConhecida(pdf) }))
}

test('com 3 pontos não colineares, o ajuste é exato', () => {
  const pontos = pontosControle([[100, 100], [500, 120], [220, 480]])
  const t = ajustarTransformacao(pontos)
  for (const p of pontos) {
    const [lat, lng] = aplicarTransformacao(t, p.pdf)
    assert.ok(Math.abs(lat - p.real[0]) < 1e-9)
    assert.ok(Math.abs(lng - p.real[1]) < 1e-9)
  }
  assert.ok(erroMedioMetros(t, pontos) < 1e-6)
})

test('com mais pontos (sobredeterminado), o erro médio continua muito pequeno', () => {
  const pontos = pontosControle([
    [100, 100], [500, 120], [220, 480], [50, 700], [650, 650], [380, 300],
  ])
  const t = ajustarTransformacao(pontos)
  assert.ok(erroMedioMetros(t, pontos) < 0.5) // menos de meio metro de resíduo
})

test('pontos em linha reta não dão pra calibrar', () => {
  const pontos: PontoControle[] = [
    { pdf: [0, 0], real: [LAT0, LNG0] },
    { pdf: [100, 100], real: [LAT0 + 0.001, LNG0 + 0.001] },
    { pdf: [200, 200], real: [LAT0 + 0.002, LNG0 + 0.002] },
  ]
  assert.throws(() => ajustarTransformacao(pontos))
})

test('menos de 3 pontos não dá pra calibrar', () => {
  const pontos = pontosControle([[0, 0], [100, 100]])
  assert.throws(() => ajustarTransformacao(pontos))
})

test('transformarAnel devolve [lng, lat], igual ao GeoJSON', () => {
  const pontos = pontosControle([[100, 100], [500, 120], [220, 480]])
  const t = ajustarTransformacao(pontos)
  const anel: [number, number][] = [[100, 100], [200, 100], [200, 200], [100, 200], [100, 100]]
  const transformado = transformarAnel(t, anel)
  assert.equal(transformado.length, anel.length)
  const [lat0, lng0] = aplicarTransformacao(t, anel[0])
  assert.equal(transformado[0][0], lng0)
  assert.equal(transformado[0][1], lat0)
})

test('erro médio cresce quando um ponto de controle está errado', () => {
  const pontos = pontosControle([[100, 100], [500, 120], [220, 480], [380, 300]])
  const t = ajustarTransformacao(pontos)
  const errado: PontoControle = { pdf: [900, 900], real: [LAT0 + 5, LNG0 + 5] }
  assert.ok(erroMedioMetros(t, [...pontos, errado]) > 1000)
})
