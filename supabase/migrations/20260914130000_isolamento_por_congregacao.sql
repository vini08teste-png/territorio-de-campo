-- =============================================================================
-- Território de Campo — isolamento por congregação
--
-- Até aqui qualquer usuário ativo via território, quadra, designação,
-- marcação e ponto de parada de QUALQUER congregação. Agora cada território
-- tem uma congregação dona, e só quem é dela (ou admin, que continua vendo
-- tudo) enxerga e mexe no que é dela — quadra, designação, marcação e ponto
-- de parada herdam isso pelo território_id.
--
-- Usuário sem congregação preenchida não vê nenhum território até alguém
-- (admin) preencher o cadastro dele.
-- =============================================================================

alter table public.territorios add column if not exists congregacao text;

-- -----------------------------------------------------------------------------
-- Funções auxiliares
-- -----------------------------------------------------------------------------

create or replace function public.congregacao_atual()
returns text
language sql stable security definer
set search_path = public
as $$
  select congregacao from public.usuarios where id = auth.uid() and ativo
$$;

-- Admin vê tudo; qualquer outro perfil só vê territórios da própria congregação
-- (e só se a própria congregação estiver preenchida).
create or replace function public.pode_ver_territorio(territorio uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.tem_perfil('admin') or (
    public.congregacao_atual() is not null
    and exists (
      select 1 from public.territorios t
      where t.id = territorio and t.congregacao = public.congregacao_atual()
    )
  )
$$;

-- Admin gerencia qualquer território; ST só gerencia os da própria congregação.
create or replace function public.gestor_do_territorio(territorio uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.tem_perfil('admin') or (
    public.tem_perfil('superintendente_territorio')
    and public.congregacao_atual() is not null
    and exists (
      select 1 from public.territorios t
      where t.id = territorio and t.congregacao = public.congregacao_atual()
    )
  )
$$;

-- -----------------------------------------------------------------------------
-- territorios
-- -----------------------------------------------------------------------------

drop policy if exists territorios_select on public.territorios;
create policy territorios_select on public.territorios
  for select to authenticated
  using (public.usuario_ativo() and public.pode_ver_territorio(id));

drop policy if exists territorios_insert on public.territorios;
create policy territorios_insert on public.territorios
  for insert to authenticated
  with check (
    public.tem_perfil('admin')
    or (
      public.tem_perfil('superintendente_territorio')
      and congregacao is not null
      and congregacao = public.congregacao_atual()
    )
  );

drop policy if exists territorios_update on public.territorios;
create policy territorios_update on public.territorios
  for update to authenticated
  using (public.gestor_do_territorio(id))
  with check (
    public.tem_perfil('admin')
    or (
      public.tem_perfil('superintendente_territorio')
      and congregacao is not null
      and congregacao = public.congregacao_atual()
    )
  );

drop policy if exists territorios_delete on public.territorios;
create policy territorios_delete on public.territorios
  for delete to authenticated
  using (public.gestor_do_territorio(id));

-- -----------------------------------------------------------------------------
-- quadras
-- -----------------------------------------------------------------------------

drop policy if exists quadras_select on public.quadras;
create policy quadras_select on public.quadras
  for select to authenticated
  using (public.usuario_ativo() and public.pode_ver_territorio(territorio_id));

drop policy if exists quadras_insert on public.quadras;
create policy quadras_insert on public.quadras
  for insert to authenticated
  with check (public.gestor_do_territorio(territorio_id));

drop policy if exists quadras_update on public.quadras;
create policy quadras_update on public.quadras
  for update to authenticated
  using (public.usuario_ativo() and public.pode_ver_territorio(territorio_id))
  with check (public.usuario_ativo() and public.pode_ver_territorio(territorio_id));

drop policy if exists quadras_delete on public.quadras;
create policy quadras_delete on public.quadras
  for delete to authenticated
  using (public.gestor_do_territorio(territorio_id));

-- -----------------------------------------------------------------------------
-- designacoes
-- -----------------------------------------------------------------------------

drop policy if exists designacoes_select on public.designacoes;
create policy designacoes_select on public.designacoes
  for select to authenticated
  using (
    public.usuario_ativo()
    and (
      (territorio_id is not null and public.pode_ver_territorio(territorio_id))
      or (quadra_id is not null and public.pode_ver_territorio(
        (select q.territorio_id from public.quadras q where q.id = quadra_id)
      ))
    )
  );

drop policy if exists designacoes_insert on public.designacoes;
create policy designacoes_insert on public.designacoes
  for insert to authenticated
  with check (
    public.gestor_do_territorio(territorio_id)
    or public.sg_pode_designar(usuario_id, territorio_id, quadra_id)
  );

drop policy if exists designacoes_update on public.designacoes;
create policy designacoes_update on public.designacoes
  for update to authenticated
  using (
    public.gestor_do_territorio(territorio_id)
    or public.sg_pode_designar(usuario_id, territorio_id, quadra_id)
  )
  with check (
    public.gestor_do_territorio(territorio_id)
    or public.sg_pode_designar(usuario_id, territorio_id, quadra_id)
  );

drop policy if exists designacoes_delete on public.designacoes;
create policy designacoes_delete on public.designacoes
  for delete to authenticated
  using (public.gestor_do_territorio(territorio_id));

-- -----------------------------------------------------------------------------
-- marcacoes (a leitura/escrita gira em torno da quadra -> território)
-- -----------------------------------------------------------------------------

create or replace function public.pode_ver_quadra(quadra uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.pode_ver_territorio((select q.territorio_id from public.quadras q where q.id = quadra))
$$;

create or replace function public.gestor_da_quadra(quadra uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.gestor_do_territorio((select q.territorio_id from public.quadras q where q.id = quadra))
$$;

drop policy if exists marcacoes_select on public.marcacoes;
create policy marcacoes_select on public.marcacoes
  for select to authenticated
  using (public.usuario_ativo() and public.pode_ver_quadra(quadra_id));

drop policy if exists marcacoes_insert on public.marcacoes;
create policy marcacoes_insert on public.marcacoes
  for insert to authenticated
  with check (
    public.usuario_ativo() and usuario_id = auth.uid() and validado_por is null
    and public.pode_ver_quadra(quadra_id)
  );

drop policy if exists marcacoes_update on public.marcacoes;
create policy marcacoes_update on public.marcacoes
  for update to authenticated
  using (public.gestor_da_quadra(quadra_id) or public.sg_da_quadra(quadra_id))
  with check (
    public.gestor_da_quadra(quadra_id)
    or (public.sg_da_quadra(quadra_id) and (validado_por is null or validado_por = auth.uid()))
  );

drop policy if exists marcacoes_delete on public.marcacoes;
create policy marcacoes_delete on public.marcacoes
  for delete to authenticated
  using (public.gestor_da_quadra(quadra_id) or public.sg_da_quadra(quadra_id));

-- -----------------------------------------------------------------------------
-- pontos_parada (mesma lógica de marcacoes)
-- -----------------------------------------------------------------------------

drop policy if exists pontos_parada_select on public.pontos_parada;
create policy pontos_parada_select on public.pontos_parada
  for select to authenticated
  using (public.usuario_ativo() and public.pode_ver_quadra(quadra_id));

drop policy if exists pontos_parada_insert on public.pontos_parada;
create policy pontos_parada_insert on public.pontos_parada
  for insert to authenticated
  with check (public.usuario_ativo() and usuario_id = auth.uid() and public.pode_ver_quadra(quadra_id));

drop policy if exists pontos_parada_update on public.pontos_parada;
create policy pontos_parada_update on public.pontos_parada
  for update to authenticated
  using (public.gestor_da_quadra(quadra_id) or (public.usuario_ativo() and usuario_id = auth.uid()))
  with check (public.gestor_da_quadra(quadra_id) or (public.usuario_ativo() and usuario_id = auth.uid()));

drop policy if exists pontos_parada_delete on public.pontos_parada;
create policy pontos_parada_delete on public.pontos_parada
  for delete to authenticated
  using (public.gestor_da_quadra(quadra_id) or (public.usuario_ativo() and usuario_id = auth.uid()));
