-- Recria o mínimo do ambiente Supabase num Postgres puro, para testar as
-- migrations sem depender de uma conta: papéis, schema auth e auth.uid().

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key);

-- No Supabase, auth.uid() lê o "sub" do JWT da requisição
create function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Claims do JWT da requisição (usado por aal_atual() para ver se a pessoa
-- passou pela verificação em 2 etapas)
create function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- Fatores de MFA cadastrados (app autenticador)
create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  status text not null default 'verified',
  factor_type text not null default 'totp'
);

-- Mínimo do Storage, para as políticas de foto das migrations
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner_id text
);
alter table storage.objects enable row level security;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Mesmos privilégios padrão que o Supabase concede nas tabelas do schema public
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
