-- =============================================
-- Corrige a permissão da tabela "usuarios"
-- Cole isso no SQL Editor do Supabase e rode
-- =============================================
--
-- Problema: a política atual permite que QUALQUER usuário logado
-- altere a tabela "usuarios" livremente — inclusive o próprio perfil
-- (ex: alguém poderia se promover a "admin" sozinho, direto pelo
-- console do navegador, sem passar pela tela do app).
--
-- Esta correção faz com que só quem JÁ é admin consiga criar,
-- editar ou excluir usuários (inclusive alterar perfis).

-- 1) Remove a política aberta demais
DROP POLICY IF EXISTS "Gerenciar usuarios" ON usuarios;

-- 2) Só admin pode inserir
CREATE POLICY "Admins inserem usuarios" ON usuarios
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.perfil = 'admin')
);

-- 3) Só admin pode atualizar (qualquer usuário, inclusive perfil/ativo)
CREATE POLICY "Admins atualizam usuarios" ON usuarios
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.perfil = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.perfil = 'admin')
);

-- 4) Só admin pode excluir
CREATE POLICY "Admins excluem usuarios" ON usuarios
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.perfil = 'admin')
);

-- =============================================
-- IMPORTANTE — rode isto ANTES do resto acima,
-- ou você pode ficar sem nenhum admin e travar o acesso.
-- Confirme que SEU usuário é o admin (troque o email abaixo
-- pelo que você usa pra logar no sistema):
-- =============================================
-- UPDATE usuarios SET perfil = 'admin' WHERE email = 'SEU_EMAIL_DE_LOGIN_AQUI';

-- Depois, confira se existe algum OUTRO admin que não devia existir:
-- SELECT id, nome, email, perfil FROM usuarios WHERE perfil = 'admin';
-- Se aparecer alguém que não deveria ser admin, rode:
-- UPDATE usuarios SET perfil = 'dirigente' WHERE email = 'EMAIL_DO_OUTRO_ADMIN';
