// Aplica as migrations de supabase/migrations no banco antes do build.
//
// Roda só quando SUPABASE_DB_URL está definida e, na Vercel, só no deploy de
// produção (preview não mexe no banco). A CLI registra o que já foi aplicado
// em supabase_migrations.schema_migrations, então rodar de novo não repete nada.
// Se uma migration falhar, o build falha e o código novo não vai ao ar com o
// banco desatualizado.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PREFIXO = '[migrar-banco]'
const urlBanco = process.env.SUPABASE_DB_URL
const ambienteVercel = process.env.VERCEL_ENV

if (!urlBanco) {
  console.log(`${PREFIXO} SUPABASE_DB_URL não definida; migrations não aplicadas.`)
  process.exit(0)
}

if (ambienteVercel && ambienteVercel !== 'production') {
  console.log(`${PREFIXO} deploy "${ambienteVercel}"; migrations só rodam em produção.`)
  process.exit(0)
}

const cliSupabase = fileURLToPath(new URL('../node_modules/.bin/supabase', import.meta.url))
const raizProjeto = fileURLToPath(new URL('..', import.meta.url))

console.log(`${PREFIXO} aplicando migrations pendentes...`)
const resultado = spawnSync(
  cliSupabase,
  ['db', 'push', '--db-url', urlBanco, '--include-all', '--yes'],
  { stdio: 'inherit', cwd: raizProjeto },
)

if (resultado.error) {
  console.error(`${PREFIXO} não foi possível executar a CLI do Supabase: ${resultado.error.message}`)
  process.exit(1)
}

process.exit(resultado.status ?? 1)
