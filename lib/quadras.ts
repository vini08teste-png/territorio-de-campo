// Regras de quadra que não dependem de tela: nome a partir do território
// (JP01, JP02…) e a ordem horária usada pra numerar. Status é sempre da
// quadra inteira — sem subdivisão em lados (removido: cada quadra tem um
// único status, marcado direto, e o progresso granular fica por conta dos
// pontos de parada).

export type StatusQuadra = 'nao_iniciado' | 'em_andamento' | 'parcial' | 'concluido' | 'pendente'

/**
 * Prefixo de 2 letras a partir do nome do território: inicial das duas
 * primeiras palavras ("Jardim Palmeiras" → "JP"), ou as 2 primeiras letras
 * quando o nome é uma palavra só ("Centro" → "CE", "Alvorada" → "AL").
 */
export function prefixoDoTerritorio(nomeTerritorio: string): string {
  const palavras = String(nomeTerritorio ?? '').trim().split(/\s+/).filter(Boolean)
  if (palavras.length >= 2) {
    return (palavras[0][0] + palavras[1][0]).toUpperCase()
  }
  return (palavras[0] ?? '').slice(0, 2).toUpperCase().padEnd(2, 'X')
}

/**
 * Prefixo sem colisão pra cada território: quando dois territórios dariam o
 * mesmo prefixo (ex: "Bela Vista I" e "Bela Vista II" → "BV"), os próximos
 * na lista ganham um número extra ("BV2", "BV3"…). A ordem da lista decide
 * quem fica com o prefixo "limpo" — normalmente vem ordenada por número.
 */
export function prefixosSemColisao(territorios: { id: string; nome: string }[]): Map<string, string> {
  const usados = new Set<string>()
  const mapa = new Map<string, string>()
  for (const t of territorios) {
    const base = prefixoDoTerritorio(t.nome)
    let prefixo = base
    let contador = 2
    while (usados.has(prefixo)) {
      prefixo = `${base}${contador}`
      contador++
    }
    usados.add(prefixo)
    mapa.set(t.id, prefixo)
  }
  return mapa
}

/** Nome da quadra dentro do território: JP01, JP02… */
export function nomeDaQuadra(prefixo: string, sequencia: number): string {
  return `${prefixo}${String(sequencia).padStart(2, '0')}`
}

/**
 * Primeira sequência livre pro prefixo: importar de novo (ou atribuir mais
 * quadras) num território que já tem quadras continua a contagem em vez de
 * repetir nomes.
 */
export function proximaSequencia(nomesExistentes: string[], prefixo: string): number {
  let maior = 0
  for (const nome of nomesExistentes) {
    const casamento = new RegExp(`^${prefixo}(\\d+)$`).exec(String(nome ?? '').trim())
    if (!casamento) continue
    maior = Math.max(maior, Number(casamento[1]))
  }
  return maior + 1
}

// ── Ordem horária (numeração dentro do território) ─────────────────────────

/** Centro de um anel de coordenadas [lng, lat] — média simples dos vértices (sem o de fechamento). */
export function centroDoAnel(anel: [number, number][]): [number, number] | null {
  const pontos = anel.length > 1 && anel[0][0] === anel[anel.length - 1][0] && anel[0][1] === anel[anel.length - 1][1]
    ? anel.slice(0, -1)
    : anel
  if (pontos.length === 0) return null
  const soma = pontos.reduce((s, p) => [s[0] + p[0], s[1] + p[1]] as [number, number], [0, 0] as [number, number])
  return [soma[0] / pontos.length, soma[1] / pontos.length]
}

/** Centro de uma quadra a partir do Feature GeoJSON gravado em `quadras.geojson`. */
export function centroDaQuadra(geojson: unknown): [number, number] | null {
  const anel = (geojson as { geometry?: { coordinates?: unknown } } | null)?.geometry?.coordinates as
    [number, number][][] | undefined
  if (!anel?.[0]) return null
  return centroDoAnel(anel[0])
}

function centroide(pontos: [number, number][]): [number, number] {
  const soma = pontos.reduce((s, p) => [s[0] + p[0], s[1] + p[1]] as [number, number], [0, 0] as [number, number])
  return [soma[0] / pontos.length, soma[1] / pontos.length]
}

/** Ângulo em graus a partir do norte, sentido horário (como um relógio). */
function anguloHorario(centro: [number, number], ponto: [number, number]): number {
  const dx = ponto[0] - centro[0]
  const dy = ponto[1] - centro[1]
  const graus = (Math.atan2(dx, dy) * 180) / Math.PI
  return (graus + 360) % 360
}

/** Ordena por varredura horária a partir do norte, em volta do centro dado. */
export function ordenarEmSentidoHorario<T extends { centro: [number, number] }>(
  itens: T[], centro: [number, number]
): T[] {
  return [...itens].sort((a, b) => anguloHorario(centro, a.centro) - anguloHorario(centro, b.centro))
}

export interface QuadraParaRenomear {
  id: string
  geojson: unknown
}

/**
 * Novo nome pra cada quadra de um território: ordena em sentido horário a
 * partir do norte (relativo ao centro do próprio grupo) e numera 01, 02…
 * com o prefixo do território. Quadra sem geometria válida fica de fora
 * (não dá pra saber a posição dela).
 */
export function renomearQuadrasDoTerritorio(
  quadras: QuadraParaRenomear[], prefixo: string
): { id: string; nome: string }[] {
  const comCentro = quadras
    .map((q) => ({ id: q.id, centro: centroDaQuadra(q.geojson) }))
    .filter((q): q is { id: string; centro: [number, number] } => q.centro !== null)
  if (comCentro.length === 0) return []
  const centroGeral = centroide(comCentro.map((q) => q.centro))
  const ordenadas = ordenarEmSentidoHorario(comCentro, centroGeral)
  return ordenadas.map((q, i) => ({ id: q.id, nome: nomeDaQuadra(prefixo, i + 1) }))
}
