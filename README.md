# Território de Campo

App para gerenciar territórios de campo: desenhar quadras no mapa, marcar status de cada lado, registrar pontos de parada com GPS, designar territórios e controlar usuários por hierarquia.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Precisa de um projeto Supabase configurado (ver `BANCO_DE_DADOS.sql` e variáveis de ambiente `.env.local`).

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

BANCO_DE_DADOS.sql        → schema completo do banco (Supabase/Postgres)
vercel.json                  → config de deploy na Vercel
```

## Perfis de usuário

Hierarquia (cada nível herda o que o de baixo pode fazer): `dirigente` → `superintendente_grupo` → `superintendente_territorio` → `admin`. As permissões e as rotas visíveis no menu mudam conforme o perfil (ver `app/app/layout.tsx` e `lib/permissoes.ts`).

## Deploy

Deploy automático na Vercel a cada push na branch `main`.
