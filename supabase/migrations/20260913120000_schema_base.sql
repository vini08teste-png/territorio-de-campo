-- =============================================================================
-- Território de Campo — schema base
--
-- Idempotente: funciona num projeto Supabase vazio e também num banco criado
-- com o antigo BANCO_DE_DADOS.sql (só adiciona o que estiver faltando).
-- =============================================================================

-- Usuários do sistema (1:1 com auth.users)
create table if not exists public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  perfil text not null check (perfil in ('admin', 'superintendente_territorio', 'superintendente_grupo', 'dirigente')),
  ativo boolean not null default true,
  congregacao text,
  criado_em timestamptz not null default now()
);
alter table public.usuarios add column if not exists congregacao text;

-- Territórios (cartões S-12-T)
create table if not exists public.territorios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  numero text not null,
  bairro text,
  status text default 'nao_iniciado',
  geojson jsonb,
  publicadores integer check (publicadores >= 0),
  familias integer check (familias >= 0),
  link_maps text,
  criado_por uuid references public.usuarios (id),
  criado_em timestamptz not null default now()
);
alter table public.territorios add column if not exists publicadores integer check (publicadores >= 0);
alter table public.territorios add column if not exists familias integer check (familias >= 0);
alter table public.territorios add column if not exists link_maps text;

-- Quadras de cada território; "lados" guarda o status de cada lado da quadra
create table if not exists public.quadras (
  id uuid primary key default gen_random_uuid(),
  territorio_id uuid references public.territorios (id) on delete cascade,
  nome text not null,
  status text default 'nao_iniciado' check (status in ('nao_iniciado', 'em_andamento', 'parcial', 'concluido', 'pendente')),
  geojson jsonb,
  lados jsonb default '[]',
  criado_em timestamptz not null default now()
);

-- Designações: SG ↔ território (quadra_id nulo) e dirigente ↔ quadra
create table if not exists public.designacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios (id) on delete cascade,
  territorio_id uuid references public.territorios (id) on delete cascade,
  quadra_id uuid references public.quadras (id) on delete set null,
  data_inicio date default current_date,
  data_fim date,
  criado_em timestamptz not null default now()
);

-- Marcações de trabalho em campo (validadas por SG/ST/admin)
create table if not exists public.marcacoes (
  id uuid primary key default gen_random_uuid(),
  quadra_id uuid references public.quadras (id) on delete cascade,
  lado_id uuid,
  usuario_id uuid references public.usuarios (id),
  status text not null,
  validado_por uuid references public.usuarios (id),
  observacao text,
  criado_em timestamptz not null default now()
);

-- Pontos de parada registrados por GPS
create table if not exists public.pontos_parada (
  id uuid primary key default gen_random_uuid(),
  quadra_id uuid references public.quadras (id) on delete cascade,
  lado_id uuid,
  usuario_id uuid references public.usuarios (id),
  lat double precision not null,
  lng double precision not null,
  endereco text,
  observacao text,
  criado_em timestamptz not null default now()
);

-- Configurações gerais (linha única, id = 1)
create table if not exists public.configuracoes (
  id integer primary key default 1 check (id = 1),
  nome_congregacao text,
  cidade text,
  lat double precision,
  lng double precision,
  superintendente_id uuid references public.usuarios (id) on delete set null,
  prazo_territorio_dias integer not null default 120 check (prazo_territorio_dias > 0),
  bloquear_territorio_vencido boolean not null default false
);

insert into public.configuracoes (id, cidade, lat, lng)
values (1, 'Canaã dos Carajás', -6.52695, -49.85265)
on conflict (id) do nothing;

-- Índices para as consultas mais comuns do app
create index if not exists quadras_territorio_id_idx on public.quadras (territorio_id);
create index if not exists designacoes_usuario_id_idx on public.designacoes (usuario_id);
create index if not exists designacoes_territorio_id_idx on public.designacoes (territorio_id);
create index if not exists designacoes_quadra_id_idx on public.designacoes (quadra_id);
create index if not exists marcacoes_quadra_id_idx on public.marcacoes (quadra_id);
create index if not exists marcacoes_usuario_id_idx on public.marcacoes (usuario_id);
create index if not exists pontos_parada_quadra_id_idx on public.pontos_parada (quadra_id);

alter table public.usuarios enable row level security;
alter table public.territorios enable row level security;
alter table public.quadras enable row level security;
alter table public.designacoes enable row level security;
alter table public.marcacoes enable row level security;
alter table public.pontos_parada enable row level security;
alter table public.configuracoes enable row level security;
