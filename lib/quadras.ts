// Regras de quadra que não dependem de tela: os lados gerados a partir do
// contorno e os nomes em sequência dentro do território (21-01, 21-02…).

export type StatusQuadra = 'nao_iniciado' | 'em_andamento' | 'parcial' | 'concluido' | 'pendente'

export interface Lado {
  id: string
  indice: number
  inicio: [number, number] // [lng, lat], igual ao GeoJSON
  fim: [number, number]
  status: StatusQuadra
}

/** Um lado para cada aresta do contorno da quadra (o anel vem fechado). */
export function gerarLados(coordenadas: [number, number][]): Lado[] {
  const pontos = coordenadas.slice(0, -1)
  return pontos.map((ponto, i) => ({
    id: crypto.randomUUID(),
    indice: i,
    inicio: ponto,
    fim: pontos[(i + 1) % pontos.length],
    status: 'nao_iniciado' as StatusQuadra,
  }))
}

/** "2" → "02"; números fora do padrão ficam como estão. */
export function normalizarNumeroTerritorio(numero: string): string {
  const texto = String(numero ?? '').trim()
  if (/^\d+$/.test(texto)) return texto.padStart(2, '0')
  return texto
}

/** Nome da quadra dentro do território: 21-01, 21-02… */
export function nomeDaQuadra(numeroTerritorio: string, sequencia: number): string {
  return `${normalizarNumeroTerritorio(numeroTerritorio)}-${String(sequencia).padStart(2, '0')}`
}

/**
 * Primeira sequência livre: importar de novo num território que já tem quadras
 * continua a contagem em vez de repetir nomes.
 */
export function proximaSequencia(nomesExistentes: string[], numeroTerritorio: string): number {
  const prefixo = normalizarNumeroTerritorio(numeroTerritorio)
  let maior = 0
  for (const nome of nomesExistentes) {
    const casamento = new RegExp(`^${prefixo}-(\\d+)$`).exec(String(nome ?? '').trim())
    if (!casamento) continue
    maior = Math.max(maior, Number(casamento[1]))
  }
  return maior + 1
}
