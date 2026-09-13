#!/usr/bin/env bash
# Aplica as migrations num Postgres descartável (Docker) e roda os testes de RLS.
# Não precisa de conta no Supabase. Uso: bash supabase/tests/rls.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

CONTAINER="tdc-rls-test-$$"
docker run -d --rm --name "$CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:15 >/dev/null
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true' EXIT

# Espera o servidor definitivo (o temporário da inicialização não escuta em TCP)
until docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do
  sleep 1
done

psql_container() {
  docker exec -i "$CONTAINER" psql -h 127.0.0.1 -U postgres -d postgres -q -v ON_ERROR_STOP=1 "$@"
}

psql_container < supabase/tests/supabase_stub.sql

for rodada in 1 2; do
  for migration in supabase/migrations/*.sql; do
    echo "[rodada $rodada] aplicando $migration"
    psql_container < "$migration"
  done
done

saida=$(psql_container -tA < supabase/tests/rls_test.sql 2>&1) || {
  echo "$saida" | grep -E 'NOTICE|ERROR|FALHOU' | sed -E 's/^(psql:<stdin>:[0-9]+: )?(NOTICE|ERROR): +//'
  exit 1
}
echo "$saida" | grep NOTICE | sed -E 's/^(psql:<stdin>:[0-9]+: )?NOTICE: +/  /'
echo "Todos os $(echo "$saida" | grep -c 'NOTICE:  ok') testes de RLS passaram."
