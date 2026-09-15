-- Congregação passa a ter uma tabela própria (antes era só texto livre em
-- usuarios.congregacao / territorios.congregacao, o que causava mismatches
-- de grafia quebrando o isolamento por congregação). A tabela serve para
-- alimentar o seletor e permitir renomear em cascata; os campos de texto em
-- usuarios/territorios continuam existindo (compatibilidade com o RLS atual).

create table if not exists congregacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cidade text,
  lat double precision,
  lng double precision,
  superintendente_id uuid references public.usuarios (id) on delete set null,
  prazo_territorio_dias integer,
  bloquear_territorio_vencido boolean not null default false,
  criado_em timestamptz not null default now()
);

alter table congregacoes enable row level security;

drop policy if exists "congregacoes_select" on congregacoes;
create policy "congregacoes_select" on congregacoes
  for select using (usuario_ativo());

drop policy if exists "congregacoes_admin_all" on congregacoes;
create policy "congregacoes_admin_all" on congregacoes
  for all using (tem_perfil('admin')) with check (tem_perfil('admin'));

-- Backfill com os valores já usados, pra não perder nada que já existia.
insert into congregacoes (nome)
select distinct trim(congregacao) from territorios
where congregacao is not null and trim(congregacao) <> ''
on conflict (nome) do nothing;

insert into congregacoes (nome)
select distinct trim(congregacao) from usuarios
where congregacao is not null and trim(congregacao) <> ''
on conflict (nome) do nothing;
