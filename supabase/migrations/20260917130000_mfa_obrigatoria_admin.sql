-- =============================================================================
-- Território de Campo — verificação em 2 etapas (MFA/TOTP)
--
-- Senha sozinha deixa de bastar para o admin: quem tem perfil 'admin' só passa
-- pela RLS depois de digitar o código do app autenticador (nível "aal2" do
-- Supabase Auth). E quem cadastrou 2 etapas — de qualquer perfil — também
-- precisa do código: token de aal1 não serve mais.
--
-- Admin que ainda não cadastrou o autenticador consegue ler apenas a própria
-- linha em usuarios (a política usuarios_select libera "id = auth.uid()"),
-- o suficiente para a tela "Segurança" funcionar e ele concluir o cadastro.
-- Nada mais do banco aparece até isso ser feito.
--
-- Pré-requisito no painel do Supabase: Authentication → Multi-Factor,
-- com TOTP (app autenticador) habilitado.
-- =============================================================================

-- Nível de autenticação do token atual: 'aal1' (só senha) ou 'aal2' (senha + código)
create or replace function public.aal_atual()
returns text
language sql stable
set search_path = public
as $$
  select coalesce(nullif(auth.jwt() ->> 'aal', ''), 'aal1')
$$;

-- Já terminou de cadastrar um app autenticador?
create or replace function public.tem_fator_mfa()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = auth.uid() and f.status = 'verified'
  )
$$;

-- Perfis obrigados a usar 2 etapas. Hoje: admin.
create or replace function public.mfa_exigida()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.ativo and u.perfil = 'admin'
  )
$$;

-- Porteiro único: é usado por usuario_ativo() e perfil_atual(), de onde todas
-- as políticas saem — então vale para todas as tabelas de uma vez.
create or replace function public.mfa_ok()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    -- passou pelas 2 etapas: sempre ok
    when public.aal_atual() = 'aal2' then true
    -- cadastrou autenticador mas não digitou o código nesta sessão
    when public.tem_fator_mfa() then false
    -- ainda não cadastrou: só passa quem não é obrigado
    else not public.mfa_exigida()
  end
$$;

create or replace function public.usuario_ativo()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and ativo)
    and public.mfa_ok()
$$;

create or replace function public.perfil_atual()
returns text
language sql stable security definer
set search_path = public
as $$
  select perfil from public.usuarios
  where id = auth.uid() and ativo and public.mfa_ok()
$$;
