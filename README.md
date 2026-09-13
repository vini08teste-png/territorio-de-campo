# Território de Campo

App para gerenciar territórios de campo: desenhar quadras no mapa, marcar status de cada lado, registrar pontos de parada com GPS, designar territórios e controlar usuários por hierarquia.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Precisa de um projeto Supabase com as migrations aplicadas e do `.env.local` configurado. O passo a passo completo está em [COMO_RODAR.md](COMO_RODAR.md).

## Estrutura do projeto

```
app/
  layout.tsx            → layout raiz (carrega Leaflet/CSS globais)
  page.tsx               → redirecionamento inicial
  login/page.tsx          → tela de login
  api/usuarios/route.ts    → API para criar/gerenciar usuários (server-side)

  app/                    → tudo que fica DENTRO do sistema logado
    layout.tsx             → header + menu (mobile e desktop) por perfil
    page.tsx                → tela do Mapa (usa components/Mapa.tsx)
    territorios/page.tsx      → lista de territórios
    designar/page.tsx          → designar território a um publicador
    validar/page.tsx            → validar territórios devolvidos
    progresso/page.tsx           → acompanhamento de progresso
    analise/page.tsx              → relatórios/análise
    historico/page.tsx             → histórico de marcações
    relatorio/page.tsx              → relatório de saída
    usuarios/page.tsx                → lista de usuários (admin)
    usuarios/novo/page.tsx            → criar usuário (admin)
    hierarquia/page.tsx                → hierarquia de perfis (admin)
    configuracoes/page.tsx              → config gerais (admin)
    logs/page.tsx                        → logs do sistema
    perfil/page.tsx                       → perfil do usuário logado

components/
  Mapa.tsx                → componente principal do mapa (Leaflet): quadras, lados, pontos de parada
  ImportarOSM.tsx           → importar quadras do OpenStreetMap
  EstadoPagina.tsx            → estados de loading/vazio/erro reutilizáveis
  AcessoNegadoToast.tsx         → aviso de acesso negado

lib/
  supabase.ts              → cliente Supabase + cores/labels de status e perfil
  auth.ts                   → login/logout
  permissoes.ts               → regras de permissão por hierarquia de perfil
  prazoTerritorio.ts            → cálculo de prazo/atraso de território

supabase/
  migrations/             → schema e permissões (RLS) do banco, aplicados com `supabase db push`
  tests/rls.sh              → testes das permissões num Postgres descartável (Docker)

.github/workflows/
  supabase-keepalive.yml  → consulta periódica para o Supabase gratuito não pausar

vercel.json                  → config de deploy na Vercel
```

## Perfis de usuário

Hierarquia (cada nível herda o que o de baixo pode fazer): `dirigente` → `superintendente_grupo` → `superintendente_territorio` → `admin`. As permissões e as rotas visíveis no menu mudam conforme o perfil (ver `app/app/layout.tsx` e `lib/permissoes.ts`).

As mesmas regras valem no banco, por RLS (`supabase/migrations/20260913120100_rls_por_perfil.sql`). Mesmo chamando o Supabase direto do navegador, ninguém faz o que o perfil não permite:
- dirigente marca quadras e registra marcações e pontos de parada em nome próprio
- SG designa dirigentes e valida marcações só nos territórios dele
- ST e admin gerenciam territórios e quadras
- só admin mexe em usuários e configurações
- usuário desativado não lê nem escreve nada

## Deploy

Deploy automático na Vercel a cada push na branch `main`.
