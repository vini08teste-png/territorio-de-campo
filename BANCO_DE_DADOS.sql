-- =============================================
-- TERRITÓRIO DE CAMPO — SQL do Banco de Dados
-- Cole isso no SQL Editor do Supabase
-- =============================================

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin','superintendente_territorio','superintendente_grupo','dirigente')),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de territórios
CREATE TABLE IF NOT EXISTS territorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  numero TEXT NOT NULL,
  bairro TEXT,
  status TEXT DEFAULT 'nao_iniciado',
  geojson JSONB,
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de quadras
CREATE TABLE IF NOT EXISTS quadras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territorio_id UUID REFERENCES territorios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  status TEXT DEFAULT 'nao_iniciado' CHECK (status IN ('nao_iniciado','em_andamento','parcial','concluido','pendente')),
  geojson JSONB,
  lados JSONB DEFAULT '[]',
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de designações
CREATE TABLE IF NOT EXISTS designacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  territorio_id UUID REFERENCES territorios(id) ON DELETE CASCADE,
  quadra_id UUID REFERENCES quadras(id) ON DELETE SET NULL,
  data_inicio DATE DEFAULT CURRENT_DATE,
  data_fim DATE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de marcações
CREATE TABLE IF NOT EXISTS marcacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quadra_id UUID REFERENCES quadras(id) ON DELETE CASCADE,
  lado_id UUID,
  usuario_id UUID REFERENCES usuarios(id),
  status TEXT NOT NULL,
  validado_por UUID REFERENCES usuarios(id),
  observacao TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de pontos de parada
CREATE TABLE IF NOT EXISTS pontos_parada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quadra_id UUID REFERENCES quadras(id) ON DELETE CASCADE,
  lado_id UUID,
  usuario_id UUID REFERENCES usuarios(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  endereco TEXT,
  observacao TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE territorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE quadras ENABLE ROW LEVEL SECURITY;
ALTER TABLE designacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pontos_parada ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (todos os autenticados leem tudo)
CREATE POLICY "Leitura autenticada" ON usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada" ON territorios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada" ON quadras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada" ON designacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada" ON marcacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura autenticada" ON pontos_parada FOR SELECT TO authenticated USING (true);

-- Políticas de escrita
CREATE POLICY "Inserir marcacoes" ON marcacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Inserir pontos" ON pontos_parada FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Atualizar quadras" ON quadras FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Atualizar marcacoes" ON marcacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Gerenciar usuarios" ON usuarios FOR ALL TO authenticated USING (true);
CREATE POLICY "Gerenciar territorios" ON territorios FOR ALL TO authenticated USING (true);
CREATE POLICY "Gerenciar quadras" ON quadras FOR ALL TO authenticated USING (true);
CREATE POLICY "Gerenciar designacoes" ON designacoes FOR ALL TO authenticated USING (true);

-- Inserir primeiro admin (troque o email!)
-- Rode DEPOIS de criar o usuário pelo Auth do Supabase
-- INSERT INTO usuarios (id, nome, email, perfil) 
-- VALUES ('UUID_DO_USUARIO', 'Administrador', 'admin@email.com', 'admin');
