-- Opção por congregação: quando ligada, marcação de quadra já entra
-- aprovada (sem passar pela fila de "Validar marcações" do Sup. de Grupo).
alter table public.congregacoes
  add column if not exists validacao_automatica boolean not null default false;

create or replace function public.congregacao_permite_validacao_automatica(quadra uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.validacao_automatica, false)
  from public.quadras q
  join public.territorios t on t.id = q.territorio_id
  join public.congregacoes c on lower(trim(c.nome)) = lower(trim(coalesce(t.congregacao, '')))
  where q.id = quadra
  limit 1
$$;

-- A regra original travava validado_por sempre nulo no insert (ninguém se
-- auto-aprova). Agora permite validado_por = quem marcou, só quando a
-- congregação do território tem "permitir tudo" ligado.
drop policy if exists marcacoes_insert on public.marcacoes;
create policy marcacoes_insert on public.marcacoes
  for insert to authenticated
  with check (
    public.usuario_ativo() and usuario_id = auth.uid()
    and public.pode_ver_quadra(quadra_id)
    and (
      validado_por is null
      or (validado_por = auth.uid() and public.congregacao_permite_validacao_automatica(quadra_id))
    )
  );
