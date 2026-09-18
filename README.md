# Território de Campo

App para gerenciar territórios de campo: desenhar quadras no mapa, marcar status de cada lado, registrar pontos de parada com GPS, designar territórios e controlar usuários por hierarquia.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Precisa de um projeto Supabase com as migrations aplicadas e do `.env.local` configurado. O passo a passo completo está em [docs/COMO_RODAR.md](docs/COMO_RODAR.md).

## Estrutura do projeto

```
app/                          Rotas (Next.js App Router)
├── login/                    Tela de login
├── api/usuarios/             API server-side de usuários (service role)
└── app/                      Área logada
    ├── layout.tsx            Cabeçalho + menu por perfil
    ├── page.tsx              Mapa
    ├── territorios/          Territórios, cartão para impressão, importação do PDF
    ├── designar/             Designações
    ├── validar/              Validação de marcações
    ├── meu-territorio/       Visão do dirigente
    ├── progresso/ analise/ relatorio/ historico/ logs/
    ├── usuarios/ hierarquia/ Gestão de pessoas (admin e ST)
    ├── configuracoes/        Configurações gerais (admin)
    └── perfil/ seguranca/    Conta do usuário logado

components/                   Componentes de tela
├── Mapa.tsx                  Mapa principal (Leaflet)
├── ImportarOSM.tsx           Gera quadras pelas ruas do OpenStreetMap
└── …                         Offline, status de conexão, estados de página

lib/                          Regras de negócio (sem dependência de tela)
├── supabase.ts               Cliente, tipos, cores e `buscarTodos` (paginação)
├── permissoes.ts auth.ts mfa.ts
├── territorio.ts quadras.ts  Contorno, rota e nomenclatura (JP01, JP02…)
├── quadrasOSM.ts calibracaoPdf.ts
└── offline/                  Cache, fila e sincronização offline

tests/                        Testes unitários (`npm test`)
supabase/
├── migrations/               Schema e RLS
└── tests/                    Testes de permissão (Postgres descartável)
scripts/                      Utilitários (ex.: migrar-banco.mjs)
public/                       Ícones, manifest, service worker, Leaflet vendorizado
docs/                         Guias, material de referência e rascunhos de design
.github/workflows/            Keep-alive do Supabase
```

## Quadras a partir das ruas

No mapa, ST e admin têm o botão **🌐 Gerar quadras pelas ruas**. Ele parte do contorno do território (importado na tela de Territórios), busca as ruas da região na [Overpass API](https://overpass-api.de/) e trata o desenho das ruas como um mapa plano: cada área cercada por ruas vira uma quadra. O contorno entra na conta como se fosse mais uma rua, então as quadras já saem recortadas na divisa do território.

Dá para rodar de duas formas: **um território por vez**, com revisão antes de gravar, ou **de uma vez em todos** os territórios que têm contorno (botão "⚡ Gerar de uma vez nos N territórios"). No modo em lote a gravação é direta, sem revisão prévia — territórios que já têm quadras são pulados, e o que sair errado se corrige depois pelo mapa ou pela tela de Territórios.

Na revisão de um território, o que sai da consulta é só uma proposta: a prévia aparece no mapa, dá para desmarcar o que veio errado (clicando na lista ou na própria quadra) e só o que ficar marcado é gravado, com os lados prontos para marcação e os nomes em sequência dentro do território (21-01, 21-02…). Importar de novo num território que já tem quadras continua a numeração em vez de repetir nomes.

Áreas pequenas demais (canteiro, rotatória), grandes demais ou finas demais (a tira que sobra entre uma rua e a divisa) são descartadas — os limites estão no começo de `lib/quadrasOSM.ts`. Onde o OpenStreetMap não tem as ruas mapeadas, o jeito continua sendo desenhar a quadra à mão.

## Testes

```bash
npm test          # regras de geração de quadras (Node, sem dependência extra)
npm run lint
supabase/tests/rls.sh   # permissões do banco, precisa de Docker
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
