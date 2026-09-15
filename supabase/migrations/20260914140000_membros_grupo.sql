-- =============================================================================
-- Território de Campo — membros do grupo
--
-- Dirigente vira membro fixo do grupo de um SG, em vez de precisar de uma
-- designação quadra a quadra: ao entrar no grupo, passa a enxergar (em "Meu
-- Território") todas as quadras dos territórios já designados a esse SG.
-- Um dirigente só pode estar em um grupo ativo por vez.
-- =============================================================================

create table if not exists public.membros_grupo (
  id uuid primary key default gen_random_uuid(),
  dirigente_id uuid references public.usuarios (id) on delete cascade,
  sg_id uuid references public.usuarios (id) on delete cascade,
  data_inicio date default current_date,
  data_fim date,
  criado_em timestamptz not null default now()
);

create unique index if not exists membros_grupo_dirigente_ativo_idx
  on public.membros_grupo (dirigente_id) where data_fim is null;

create index if not exists membros_grupo_sg_id_idx on public.membros_grupo (sg_id);

alter table public.membros_grupo enable row level security;

drop policy if exists membros_grupo_select on public.membros_grupo;
create policy membros_grupo_select on public.membros_grupo
  for select to authenticated
  using (public.usuario_ativo());

-- ST/admin gerenciam qualquer grupo; SG só gerencia o próprio grupo (o dele
-- mesmo como sg_id).
drop policy if exists membros_grupo_insert on public.membros_grupo;
create policy membros_grupo_insert on public.membros_grupo
  for insert to authenticated
  with check (
    public.gestor_de_territorio()
    or (public.tem_perfil('superintendente_grupo') and sg_id = auth.uid())
  );

drop policy if exists membros_grupo_update on public.membros_grupo;
create policy membros_grupo_update on public.membros_grupo
  for update to authenticated
  using (
    public.gestor_de_territorio()
    or (public.tem_perfil('superintendente_grupo') and sg_id = auth.uid())
  )
  with check (
    public.gestor_de_territorio()
    or (public.tem_perfil('superintendente_grupo') and sg_id = auth.uid())
  );

drop policy if exists membros_grupo_delete on public.membros_grupo;
create policy membros_grupo_delete on public.membros_grupo
  for delete to authenticated
  using (
    public.gestor_de_territorio()
    or (public.tem_perfil('superintendente_grupo') and sg_id = auth.uid())
  );
