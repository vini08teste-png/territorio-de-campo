-- =============================================
-- Adiciona configuração de prazo de território
-- Cole isso no SQL Editor do Supabase e rode
-- =============================================

ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS prazo_territorio_dias INTEGER NOT NULL DEFAULT 120;

ALTER TABLE configuracoes
  ADD COLUMN IF NOT EXISTS bloquear_territorio_vencido BOOLEAN NOT NULL DEFAULT false;

-- prazo_territorio_dias: quantos dias um Sup. de Grupo pode ficar com um
-- território designado antes de aparecer como "vencido" nas telas.
-- 120 dias ≈ 4 meses (padrão sugerido).
--
-- bloquear_territorio_vencido: por padrão OFF (false). Quando ligado,
-- o dirigente não consegue mais marcar quadras de um território cujo
-- prazo já passou — só o SG/ST resolvendo a pendência libera de novo.
-- Fica desligado até vocês decidirem ativar; a lógica já funciona pronta.
