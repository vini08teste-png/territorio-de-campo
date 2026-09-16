-- Corrige a criação de território pelo Sup. de Território.
--
-- O app faz insert().select() (INSERT ... RETURNING), o que dispara a política
-- de SELECT na linha recém-criada. A política antiga usava pode_ver_territorio(id),
-- que faz um EXISTS na própria tabela territorios pra achar a congregação — mas a
-- linha nova ainda não é visível a esse sub-select durante o RETURNING, então a
-- RLS bloqueava (admin passava pelo bypass; ST não). Aqui a política compara a
-- congregação DIRETO na coluna da linha (disponível no RETURNING), sem o EXISTS
-- circular. Mesma semântica de isolamento pro SELECT normal.

drop policy if exists territorios_select on public.territorios;
create policy territorios_select on public.territorios
  for select to authenticated
  using (
    public.usuario_ativo() and (
      public.tem_perfil('admin')
      or (public.congregacao_atual() is not null and congregacao = public.congregacao_atual())
    )
  );
