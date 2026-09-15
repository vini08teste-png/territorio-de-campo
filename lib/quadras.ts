// Regras de quadra que não dependem de tela: os nomes em sequência dentro do
// território (21-01, 21-02…). Status é sempre da quadra inteira — sem
// subdivisão em lados (removido: cada quadra tem um único status, marcado
// direto, e o progresso granular fica por conta dos pontos de parada).

export type StatusQuadra = 'nao_iniciado' | 'em_andamento' | 'parcial' | 'concluido' | 'pendente'

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
