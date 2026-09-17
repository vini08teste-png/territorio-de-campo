-- =============================================================================
-- Território de Campo — endurece o isolamento por congregação
--
-- Revisão de segurança. Brechas fechadas aqui:
--
-- 1. usuarios: qualquer usuário ativo lia nome/email/perfil de TODAS as
--    congregações. Agora cada um vê a si mesmo e quem é da própria
--    congregação; admin continua vendo todos.
-- 2. membros_grupo: ST de uma congregação mexia nos grupos de outra, e SG
--    podia colocar no próprio grupo gente de outra congregação. Leitura
--    também era aberta a todos.
-- 3. designacoes: SG podia designar dirigente de outra congregação.
-- 4. pontos_parada: o autor podia mover o próprio ponto para uma quadra de
--    outra congregação (o UPDATE não conferia a quadra nova).
-- 5. storage (bucket territorios): qualquer usuário ativo sobrescrevia ou
--    apagava a foto de ponto de qualquer outra pessoa, e ST de qualquer
--    congregação trocava/apagava foto de marco de território alheio.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Função auxiliar: o usuário alvo é da mesma congregação de quem está logado?
-- Admin sempre passa. Compara sem diferenciar maiúsculas/espaços, igual à tela.
-- -----------------------------------------------------------------------------

create or replace function public.mesma_congregacao(alvo uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.tem_perfil('admin') or (
    nullif(trim(coalesce(public.congregacao_atual(), '')), '') is not null
    and exists (
      select 1 from public.usuarios u
      where u.id = alvo
        and lower(trim(u.congregacao)) = lower(trim(public.congregacao_atual()))
    )
  )
$$;

-- -----------------------------------------------------------------------------
-- 1. usuarios
-- -----------------------------------------------------------------------------

drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (id = auth.uid() or (public.usuario_ativo() and public.mesma_congregacao(id)));

-- -----------------------------------------------------------------------------
-- 2. membros_grupo
-- -----------------------------------------------------------------------------

drop policy if exists membros_grupo_select on public.membros_grupo;
create policy membros_grupo_select on public.membros_grupo
  for select to authenticated
  using (public.usuario_ativo() and public.mesma_congregacao(sg_id));

drop policy if exists membros_grupo_insert on public.membros_grupo;
create policy membros_grupo_insert on public.membros_grupo
  for insert to authenticated
  with check (
    public.mesma_congregacao(dirigente_id)
    and (
      (public.gestor_de_territorio() and public.mesma_congregacao(sg_id))
      or (public.tem_perfil('superintendente_grupo') and sg_id = auth.uid())
    )
  );

drop policy if exists membros_grupo_update on public.membros_grupo;
create policy membros_grupo_update on public.membros_grupo
  for update to authenticated
  using (
    public.mesma_congregacao(dirigente_id)
    and (
      (public.gestor_de_territorio() and public.mesma_congregacao(sg_id))
      or (public.tem_perfil('superintendente_grupo') and sg_id = auth.uid())
    )
  )
  with check (
    public.mesma_congregacao(dirigente_id)
    and (
      (public.gestor_de_territorio() and public.mesma_congregacao(sg_id))
      or (public.tem_perfil('superintendente_grupo') and sg_id = auth.uid())
    )
  );

drop policy if exists membros_grupo_delete on public.membros_grupo;
create policy membros_grupo_delete on public.membros_grupo
  for delete to authenticated
  using (
    public.mesma_congregacao(dirigente_id)
    and (
      (public.gestor_de_territorio() and public.mesma_congregacao(sg_id))
      or (public.tem_perfil('superintendente_grupo') and sg_id = auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- 3. designacoes: SG só designa dirigente da mesma congregação
-- -----------------------------------------------------------------------------

create or replace function public.sg_pode_designar(alvo uuid, territorio uuid, quadra uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select quadra is not null
    and public.sg_do_territorio(territorio)
    and exists (select 1 from public.quadras q where q.id = quadra and q.territorio_id = territorio)
    and exists (select 1 from public.usuarios u where u.id = alvo and u.perfil = 'dirigente')
    and public.mesma_congregacao(alvo)
$$;

-- -----------------------------------------------------------------------------
-- 4. pontos_parada: autor não move o ponto para quadra que não pode ver
-- -----------------------------------------------------------------------------

drop policy if exists pontos_parada_update on public.pontos_parada;
create policy pontos_parada_update on public.pontos_parada
  for update to authenticated
  using (public.gestor_da_quadra(quadra_id) or (public.usuario_ativo() and usuario_id = auth.uid()))
  with check (
    public.gestor_da_quadra(quadra_id)
    or (public.usuario_ativo() and usuario_id = auth.uid() and public.pode_ver_quadra(quadra_id))
  );

-- -----------------------------------------------------------------------------
-- 5. storage: fotos
--
-- Caminhos usados pelo app:
--   <territorio_id>/marco-<timestamp>.<ext>   foto do marco do território
--   pontos/<usuario_id>-<timestamp>.<ext>     foto do ponto de parada
-- -----------------------------------------------------------------------------

-- Pode gerenciar este objeto do bucket? (sem cast que quebre em nome inválido)
create or replace function public.pode_gerenciar_foto(nome text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.tem_perfil('admin') then true
    when not public.usuario_ativo() then false
    -- foto de ponto: só o próprio autor (ou ST, que modera pontos)
    when left(nome, 7) = 'pontos/' then
      nome like 'pontos/' || auth.uid()::text || '-%'
      or public.tem_perfil('superintendente_territorio')
    -- foto de marco: só ST da congregação dona do território
    when split_part(nome, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      public.gestor_do_territorio(split_part(nome, '/', 1)::uuid)
    else false
  end
$$;

drop policy if exists territorios_fotos_insert on storage.objects;
create policy territorios_fotos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'territorios' and public.pode_gerenciar_foto(name));

drop policy if exists territorios_fotos_update on storage.objects;
create policy territorios_fotos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'territorios' and public.pode_gerenciar_foto(name))
  with check (bucket_id = 'territorios' and public.pode_gerenciar_foto(name));

drop policy if exists territorios_fotos_delete on storage.objects;
create policy territorios_fotos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'territorios' and public.pode_gerenciar_foto(name));
