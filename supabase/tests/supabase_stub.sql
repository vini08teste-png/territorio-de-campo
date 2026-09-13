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

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Mesmos privilégios padrão que o Supabase concede nas tabelas do schema public
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
