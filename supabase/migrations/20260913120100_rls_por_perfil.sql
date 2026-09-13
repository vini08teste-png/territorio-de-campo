-- =============================================================================
-- Território de Campo — permissões por perfil (RLS)
--
-- Antes, qualquer usuário autenticado podia escrever em todas as tabelas
-- (inclusive trocar o próprio perfil para admin). Aqui as regras de cada tela
-- passam a valer também no banco.
--
-- Hierarquia: dirigente → superintendente_grupo (SG) → superintendente_territorio (ST) → admin
-- Usuário com ativo = false não lê nem escreve nada.
-- =============================================================================

-- Remove todas as políticas existentes dessas tabelas (inclusive as permissivas antigas)
do $$
declare
  politica record;
begin
  for politica in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('usuarios', 'configuracoes', 'territorios', 'quadras', 'designacoes', 'marcacoes', 'pontos_parada')
  loop
    execute format('drop policy %I on %I.%I', politica.policyname, politica.schemaname, politica.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Funções auxiliares (security definer: leem usuarios/designacoes sem esbarrar
-- nas próprias políticas e sem recursão)
-- -----------------------------------------------------------------------------

create or replace function public.perfil_atual()
returns text
language sql stable security definer
set search_path = public
as $$
  select perfil from public.usuarios where id = auth.uid() and ativo
$$;

create or replace function public.usuario_ativo()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and ativo)
$$;

create or replace function public.tem_perfil(variadic perfis text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.perfil_atual() = any (perfis), false)
$$;

-- Sup. de Território ou admin
create or replace function public.gestor_de_territorio()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.tem_perfil('superintendente_territorio', 'admin')
$$;

-- SG com designação ativa para o território
create or replace function public.sg_do_territorio(territorio uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.tem_perfil('superintendente_grupo') and exists (
    select 1
    from public.designacoes d
    where d.usuario_id = auth.uid()
      and d.territorio_id = territorio
      and d.quadra_id is null
      and d.data_fim is null
  )
$$;

create or replace function public.sg_da_quadra(quadra uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.sg_do_territorio((select q.territorio_id from public.quadras q where q.id = quadra)), false)
$$;

-- SG só designa dirigentes a quadras dos territórios dele
create or replace function public.sg_pode_designar(alvo uuid, territorio uuid, quadra uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select quadra is not null
    and public.sg_do_territorio(territorio)
    and exists (select 1 from public.quadras q where q.id = quadra and q.territorio_id = territorio)
    and exists (select 1 from public.usuarios u where u.id = alvo and u.perfil = 'dirigente')
$$;

-- -----------------------------------------------------------------------------
-- usuarios: leitura para ativos; escrita só admin (a criação passa pela API
-- /api/usuarios com service role)
-- -----------------------------------------------------------------------------

create policy usuarios_select on public.usuarios
  for select to authenticated
  using (id = auth.uid() or public.usuario_ativo());

create policy usuarios_insert on public.usuarios
  for insert to authenticated
  with check (public.tem_perfil('admin'));

create policy usuarios_update on public.usuarios
  for update to authenticated
  using (public.tem_perfil('admin'))
  with check (public.tem_perfil('admin'));

create policy usuarios_delete on public.usuarios
  for delete to authenticated
  using (public.tem_perfil('admin'));

-- -----------------------------------------------------------------------------
-- configuracoes: leitura para ativos; escrita só admin
-- -----------------------------------------------------------------------------

create policy configuracoes_select on public.configuracoes
  for select to authenticated
  using (public.usuario_ativo());

create policy configuracoes_insert on public.configuracoes
  for insert to authenticated
  with check (public.tem_perfil('admin'));

create policy configuracoes_update on public.configuracoes
  for update to authenticated
  using (public.tem_perfil('admin'))
  with check (public.tem_perfil('admin'));

-- -----------------------------------------------------------------------------
-- territorios: leitura para ativos; escrita ST/admin
-- -----------------------------------------------------------------------------

create policy territorios_select on public.territorios
  for select to authenticated
  using (public.usuario_ativo());

create policy territorios_insert on public.territorios
  for insert to authenticated
  with check (public.gestor_de_territorio());

create policy territorios_update on public.territorios
  for update to authenticated
  using (public.gestor_de_territorio())
  with check (public.gestor_de_territorio());

create policy territorios_delete on public.territorios
  for delete to authenticated
  using (public.gestor_de_territorio());

-- -----------------------------------------------------------------------------
-- quadras: leitura para ativos; criar/excluir ST/admin; qualquer ativo marca
-- status e lados, mas nome, contorno e território só ST/admin (trigger abaixo)
-- -----------------------------------------------------------------------------

create policy quadras_select on public.quadras
  for select to authenticated
  using (public.usuario_ativo());

create policy quadras_insert on public.quadras
  for insert to authenticated
  with check (public.gestor_de_territorio());

create policy quadras_update on public.quadras
  for update to authenticated
  using (public.usuario_ativo())
  with check (public.usuario_ativo());

create policy quadras_delete on public.quadras
  for delete to authenticated
  using (public.gestor_de_territorio());

create or replace function public.quadras_protege_campos()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- service role, postgres e migrations não passam por essa regra
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.gestor_de_territorio() then
    return new;
  end if;
  if new.nome is distinct from old.nome
    or new.geojson is distinct from old.geojson
    or new.territorio_id is distinct from old.territorio_id then
    raise exception 'Só Sup. de Território ou admin podem alterar nome, contorno ou território da quadra'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists quadras_protege_campos on public.quadras;
create trigger quadras_protege_campos
  before update on public.quadras
  for each row execute function public.quadras_protege_campos();

-- -----------------------------------------------------------------------------
-- designacoes: leitura para ativos; ST/admin gerenciam todas; SG designa
-- dirigentes às quadras dos territórios dele
-- -----------------------------------------------------------------------------

create policy designacoes_select on public.designacoes
  for select to authenticated
  using (public.usuario_ativo());

create policy designacoes_insert on public.designacoes
  for insert to authenticated
  with check (public.gestor_de_territorio() or public.sg_pode_designar(usuario_id, territorio_id, quadra_id));

create policy designacoes_update on public.designacoes
  for update to authenticated
  using (public.gestor_de_territorio() or public.sg_pode_designar(usuario_id, territorio_id, quadra_id))
  with check (public.gestor_de_territorio() or public.sg_pode_designar(usuario_id, territorio_id, quadra_id));

create policy designacoes_delete on public.designacoes
  for delete to authenticated
  using (public.gestor_de_territorio());

-- -----------------------------------------------------------------------------
-- marcacoes: cada um registra em nome próprio; SG (no território dele), ST e
-- admin validam ou rejeitam
-- -----------------------------------------------------------------------------

create policy marcacoes_select on public.marcacoes
  for select to authenticated
  using (public.usuario_ativo());

create policy marcacoes_insert on public.marcacoes
  for insert to authenticated
  with check (public.usuario_ativo() and usuario_id = auth.uid() and validado_por is null);

create policy marcacoes_update on public.marcacoes
  for update to authenticated
  using (public.gestor_de_territorio() or public.sg_da_quadra(quadra_id))
  with check (
    public.gestor_de_territorio()
    or (public.sg_da_quadra(quadra_id) and (validado_por is null or validado_por = auth.uid()))
  );

create policy marcacoes_delete on public.marcacoes
  for delete to authenticated
  using (public.gestor_de_territorio() or public.sg_da_quadra(quadra_id));

-- -----------------------------------------------------------------------------
-- pontos_parada: cada um registra em nome próprio; autor, ST e admin editam
-- e apagam
-- -----------------------------------------------------------------------------

create policy pontos_parada_select on public.pontos_parada
  for select to authenticated
  using (public.usuario_ativo());

create policy pontos_parada_insert on public.pontos_parada
  for insert to authenticated
  with check (public.usuario_ativo() and usuario_id = auth.uid());

create policy pontos_parada_update on public.pontos_parada
  for update to authenticated
  using (public.gestor_de_territorio() or (public.usuario_ativo() and usuario_id = auth.uid()))
  with check (public.gestor_de_territorio() or (public.usuario_ativo() and usuario_id = auth.uid()));

create policy pontos_parada_delete on public.pontos_parada
  for delete to authenticated
  using (public.gestor_de_territorio() or (public.usuario_ativo() and usuario_id = auth.uid()));
