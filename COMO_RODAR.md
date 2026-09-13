# Território de Campo — Como rodar

## 1. Banco de dados (Supabase)

O schema e as permissões ficam versionados em `supabase/migrations/`:

| Migration | O que faz |
|---|---|
| `20260913120000_schema_base.sql` | Tabelas, índices e a linha padrão de `configuracoes` |
| `20260913120100_rls_por_perfil.sql` | Permissões por perfil (RLS) aplicadas no próprio banco |

As duas são idempotentes: rodam num projeto vazio e também num banco criado com o antigo `BANCO_DE_DADOS.sql`.

Com o projeto já criado no Supabase (região South America – São Paulo):

```bash
npx supabase login
npx supabase link --project-ref <REF_DO_PROJETO>   # o ref aparece na URL do painel
npx supabase db push
```

### Testar as permissões sem conta no Supabase

Precisa só de Docker. O script sobe um Postgres descartável, aplica as migrations duas vezes (para checar a idempotência) e simula cada perfil:

```bash
bash supabase/tests/rls.sh
```

## 2. Criar o primeiro usuário admin

1. No Supabase, abra **Authentication → Users → Add user → Create new user**
2. Preencha email e senha e copie o UUID gerado
3. No **SQL Editor**, rode:

```sql
insert into usuarios (id, nome, email, perfil)
values ('COLE_O_UUID_AQUI', 'Seu Nome', 'seu@email.com', 'admin');
```

Os demais usuários são criados pelo próprio app, na tela de usuários do admin.

## 3. Rodar o projeto localmente

Crie `.env.local` na raiz, com os valores de **Project Settings → API** do Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://<REF_DO_PROJETO>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave anon>
SUPABASE_SERVICE_ROLE_KEY=<chave service_role>
```

A `service_role` ignora todas as permissões. Ela só é usada no servidor (`app/api/usuarios`) e nunca deve ser commitada nem exposta no navegador.

```bash
npm install
npm run dev
```

Acesse http://localhost:3000

## 4. Publicar na Vercel

1. Na Vercel, clique em **Add New → Project** e importe o repositório do GitHub
2. Em **Environment Variables**, adicione as 3 variáveis do `.env.local`
3. Clique em **Deploy**
4. No Supabase, em **Authentication → URL Configuration**, coloque a URL da Vercel em **Site URL**

A cada push na `main`, a Vercel publica de novo.

## 5. Manter o Supabase ativo

O plano gratuito pausa o projeto depois de 1 semana sem uso. O workflow `.github/workflows/supabase-keepalive.yml` faz uma consulta leve a cada 3 dias. Para ativá-lo, cadastre no GitHub (**Settings → Secrets and variables → Actions**):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Sem esses secrets, o workflow roda e termina sem fazer nada.
