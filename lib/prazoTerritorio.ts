export interface StatusPrazo {
  dataLimite: Date
  diasRestantes: number
  vencido: boolean
}

/**
 * Calcula o prazo de um território designado a partir de quando a
 * designação começou. Não guardamos "data limite" no banco — calculamos
 * na hora, assim o prazo configurado (padrão 120 dias) pode mudar sem
 * precisar migrar designações antigas.
 */
export function calcularPrazoTerritorio(dataInicio: string, prazoDias: number): StatusPrazo {
  const inicio = new Date(dataInicio)
  const dataLimite = new Date(inicio)
  dataLimite.setDate(dataLimite.getDate() + prazoDias)

  const hoje = new Date()
  const diasRestantes = Math.ceil((dataLimite.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

  return { dataLimite, diasRestantes, vencido: diasRestantes < 0 }
}

export function formatarPrazo(status: StatusPrazo): string {
  if (status.vencido) {
    return `🔴 Vencido há ${Math.abs(status.diasRestantes)} dia${Math.abs(status.diasRestantes) === 1 ? '' : 's'}`
  }
  if (status.diasRestantes <= 14) {
    return `🟡 Vence em ${status.diasRestantes} dia${status.diasRestantes === 1 ? '' : 's'}`
  }
  return `Vence em ${status.diasRestantes} dias`
}
