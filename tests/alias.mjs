// Resolve o atalho "@/..." (o mesmo do tsconfig) quando os testes rodam direto
// no Node, que lê os .ts sem os tipos. Sem isso, só o Next saberia esse caminho.
import { registerHooks } from 'node:module'

const raiz = new URL('../', import.meta.url)

registerHooks({
  resolve(especificador, contexto, seguinte) {
    if (especificador.startsWith('@/')) {
      return { url: new URL(`${especificador.slice(2)}.ts`, raiz).href, shortCircuit: true }
    }
    return seguinte(especificador, contexto)
  },
})
