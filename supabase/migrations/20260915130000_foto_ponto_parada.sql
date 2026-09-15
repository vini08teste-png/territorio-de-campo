-- Foto no ponto de parada/referência: quem está em campo já bate a foto do
-- marco na hora que acha o ponto, em vez de precisar voltar depois na tela
-- de Territórios pra fazer isso separado.

alter table public.pontos_parada add column if not exists foto text;

-- Reaproveita o bucket "territorios" (já existe, público pra leitura).
-- Objetos de ponto de parada ficam sob o prefixo "pontos/" e podem ser
-- enviados por qualquer usuário ativo que possa marcar aquela quadra — a
-- mesma regra de pontos_parada_insert, só que aqui a policy de storage não
-- enxerga quadra_id, então libera geral pra usuário ativo (o insert na
-- linha de pontos_parada, essa sim, já é protegido por pode_ver_quadra).
drop policy if exists territorios_fotos_insert on storage.objects;
create policy territorios_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'territorios'
    and (
      public.gestor_de_territorio()
      or (left(name, 7) = 'pontos/' and public.usuario_ativo())
    )
  );

drop policy if exists territorios_fotos_update on storage.objects;
create policy territorios_fotos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'territorios'
    and (
      public.gestor_de_territorio()
      or (left(name, 7) = 'pontos/' and public.usuario_ativo())
    )
  )
  with check (
    bucket_id = 'territorios'
    and (
      public.gestor_de_territorio()
      or (left(name, 7) = 'pontos/' and public.usuario_ativo())
    )
  );

drop policy if exists territorios_fotos_delete on storage.objects;
create policy territorios_fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'territorios'
    and (
      public.gestor_de_territorio()
      or (left(name, 7) = 'pontos/' and public.usuario_ativo())
    )
  );
