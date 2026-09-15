-- =============================================================================
-- Território de Campo — foto do marco do território
--
-- Uma foto de referência (placa, ponto marcante do bairro etc.) que ajuda a
-- reconhecer o território. Guardada no Storage, bucket público de leitura;
-- só ST/admin sobem ou trocam a foto.
-- =============================================================================

alter table public.territorios add column if not exists foto_marco text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('territorios', 'territorios', true, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists territorios_fotos_select on storage.objects;
create policy territorios_fotos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'territorios' and public.usuario_ativo());

drop policy if exists territorios_fotos_insert on storage.objects;
create policy territorios_fotos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'territorios' and public.gestor_de_territorio());

drop policy if exists territorios_fotos_update on storage.objects;
create policy territorios_fotos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'territorios' and public.gestor_de_territorio())
  with check (bucket_id = 'territorios' and public.gestor_de_territorio());

drop policy if exists territorios_fotos_delete on storage.objects;
create policy territorios_fotos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'territorios' and public.gestor_de_territorio());
